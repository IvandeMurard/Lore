import { NextRequest, NextResponse } from "next/server";
import { classifyIntent } from "@/lib/llm";
import { chatCompletion } from "@/lib/openai";
import {
    countMessages,
    getLatestGeneratedSopDraftSource,
    getBackboardErrorMessage,
    getBackboardStatusCode,
    isBackboardTransientError,
    persistMessages,
    resolveThreadId,
    sendQueryMessage,
    type PersistTarget,
} from "@/lib/backboard";
import { ELICITATION_PROMPT, LOG_PROMPT } from "@/lib/prompts";
import { ensureAmmDisclaimer } from "@/lib/safety";

export const runtime = "nodejs";
export const maxDuration = 25;
const MIN_WRITE_INTENT_CONFIDENCE = 0.55;
const MIN_SIGNAL_WORDS = 3;

const FILLER_WORDS = new Set([
    "uh",
    "um",
    "erm",
    "ah",
    "okay",
    "ok",
    "like",
    "you",
    "know",
    "just",
]);

type Intent = "capture" | "query" | "log";

type OrchestrateSource = {
    type: "sop" | "oral" | "history" | "intent" | "system";
    label: string;
    details?: string;
};

type OrchestrateResult = {
    status?: number;
    error?: string;
    response?: string;
    sources?: OrchestrateSource[];
    message_id?: string;
    intervention_count?: number | null;
    stored?: boolean;
    stored_targets?: string[];
    failed_targets?: Array<{ target: string; reason: string; retryable: boolean }>;
    validated?: boolean;
    validation_note?: string;
    degraded?: boolean;
    retryable?: boolean;
};

function countSignalWords(transcript: string): number {
    const words = transcript
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean);
    return words.filter((word) => !FILLER_WORDS.has(word)).length;
}

/**
 * POST /api/orchestrate
 *
 * Auto-classifies a transcript into capture / query / log,
 * then executes the corresponding action in a single round-trip.
 *
 * Body: { transcript, technician?, tail? }
 * Returns: { intent, confidence, response, sources?, intervention_count? }
 */
export async function POST(req: NextRequest) {
    const startMs = Date.now();

    try {
        const body = await req.json();
        const { transcript, technician, tail } = body;

        if (!transcript) {
            return NextResponse.json(
                { error: "transcript is required" },
                { status: 400 }
            );
        }

        const signalWords = countSignalWords(transcript);
        if (signalWords < MIN_SIGNAL_WORDS) {
            return NextResponse.json(
                {
                    intent: "query",
                    confidence: 0,
                    aircraft: tail || null,
                    component: null,
                    response: ensureAmmDisclaimer(
                        "I did not store that because the transcript was too short or unclear. Please repeat with a specific maintenance statement or question."
                    ),
                    sources: [
                        {
                            type: "system",
                            label: "Low-signal transcript blocked",
                            details: `Signal words detected: ${signalWords}. No capture/log write was performed.`,
                        },
                    ],
                    degraded: false,
                    retryable: false,
                    blocked: true,
                },
                { status: 200 }
            );
        }

        // ── Step 1: Classify intent ──────────────────────
        const classification = await classifyIntent(transcript);
        const intent = classification.intent as Intent;
        const confidence = classification.confidence ?? 0;
        const detectedAircraft = classification.aircraft || tail || null;
        const detectedComponent = classification.component || null;

        if (
            (intent === "capture" || intent === "log") &&
            confidence < MIN_WRITE_INTENT_CONFIDENCE
        ) {
            return NextResponse.json(
                {
                    intent: "query",
                    confidence,
                    aircraft: detectedAircraft,
                    component: detectedComponent,
                    response: ensureAmmDisclaimer(
                        `I did not store this because intent confidence is too low (${Math.round(confidence * 100)}%). Please repeat clearly and say whether this is a log entry or knowledge capture.`
                    ),
                    sources: [
                        {
                            type: "system",
                            label: "Low-confidence write blocked",
                            details: `Detected intent: ${intent}\nConfidence: ${confidence.toFixed(2)}\nThreshold: ${MIN_WRITE_INTENT_CONFIDENCE.toFixed(2)}\nNo capture/log write was performed.`,
                        },
                    ],
                    degraded: false,
                    retryable: false,
                    blocked: true,
                },
                { status: 200 }
            );
        }

        console.log("[/api/orchestrate] classified:", {
            intent,
            confidence,
            aircraft: detectedAircraft,
            component: detectedComponent,
            classifyMs: Date.now() - startMs,
        });

        // ── Step 2: Route to handler ─────────────────────
        let result: OrchestrateResult;

        switch (intent) {
            case "capture":
                result = await handleCapture(
                    transcript,
                    technician || "Unknown",
                    detectedAircraft,
                    detectedComponent
                );
                break;

            case "log":
                result = await handleLog(
                    transcript,
                    detectedAircraft,
                    technician || "Unknown"
                );
                break;

            case "query":
            default:
                result = await handleQuery(transcript, detectedAircraft);
                break;
        }

        console.log("[/api/orchestrate] done:", {
            intent,
            totalMs: Date.now() - startMs,
        });

        const status = result.status ?? 200;
        return NextResponse.json({
            intent,
            confidence,
            aircraft: detectedAircraft,
            component: detectedComponent,
            ...result,
        }, { status });
    } catch (error) {
        console.error("[/api/orchestrate] Error:", error);
        const details = getBackboardErrorMessage(error);
        const backboardStatus = getBackboardStatusCode(error);

        if (isBackboardTransientError(error)) {
            return NextResponse.json(
                {
                    error: "Knowledge service is temporarily unavailable. Please try again.",
                    retryable: true,
                    degraded: true,
                },
                { status: 503 }
            );
        }

        if (backboardStatus === 401 || backboardStatus === 403) {
            return NextResponse.json(
                {
                    error: "Backboard authentication failed. Check BACKBOARD_API_KEY in frontend/.env.local.",
                    retryable: false,
                    degraded: true,
                    details,
                },
                { status: 502 }
            );
        }

        if (backboardStatus === 404) {
            return NextResponse.json(
                {
                    error: "Backboard resource not found. Re-run setup and verify thread/assistant IDs.",
                    retryable: false,
                    degraded: true,
                    details,
                },
                { status: 502 }
            );
        }

        if (
            details.toLowerCase().includes("openai") ||
            details.toLowerCase().includes("api key") ||
            details.toLowerCase().includes("invalid_api_key")
        ) {
            return NextResponse.json(
                {
                    error: "OpenAI request failed. Check OPENAI_API_KEY in frontend/.env.local.",
                    retryable: false,
                    degraded: true,
                    details,
                },
                { status: 502 }
            );
        }

        return NextResponse.json(
            {
                error: "Internal server error",
                details,
                retryable: false,
                degraded: true,
            },
            { status: 500 }
        );
    }
}

// ── Capture handler ──────────────────────────────────
async function handleCapture(
    transcript: string,
    technician: string,
    tail: string | null,
    component: string | null
): Promise<OrchestrateResult> {
    const extractionContext = `Technician: ${technician}
Aircraft: ${tail || "Unknown"}
Component: ${component || "Unknown"}
Conditions: Standard

Transcript:
"${transcript}"`;

    const extractedRaw = await chatCompletion(
        ELICITATION_PROMPT,
        extractionContext,
        { temperature: 0.1 }
    );

    let extracted;
    try {
        extracted = JSON.parse(extractedRaw);
    } catch {
        extracted = {
            knowledge: transcript,
            component: component || "Unknown",
            conditions: "Standard",
            confidence: 0.7,
        };
    }

    const memoryMessage = `[ORAL KNOWLEDGE — ${new Date().toISOString().split("T")[0]}]
Technician: ${technician}
Aircraft: ${tail || "Unknown"}
Component: ${extracted.component || component || "Unknown"}
Conditions: ${extracted.conditions || "Standard"}
Knowledge: ${extracted.knowledge || transcript}`;

    const targets: PersistTarget[] = [];
    if (tail) {
        targets.push({
            key: tail,
            label: `aircraft:${tail}`,
            content: memoryMessage,
        });
    }
    if (technician && technician !== "Unknown") {
        targets.push({
            key: technician,
            label: `technician:${technician}`,
            content: memoryMessage,
        });
    }

    if (targets.length === 0) {
        return {
            status: 400,
            error: "No capture targets configured for this input.",
            response: "No capture target was provided.",
            stored: false,
            stored_targets: [],
            failed_targets: [],
            degraded: true,
            retryable: false,
            sources: [{ type: "system", label: "capture target missing" }],
        };
    }

    // Fire-and-forget: persist in background, return response immediately for TTS
    void persistMessages(targets).then((persistence) => {
        if (!persistence.stored) {
            console.error("[orchestrate/capture] Background persist failed:", persistence.failed_targets);
        }
    }).catch((err) => {
        console.error("[orchestrate/capture] Background persist error:", err);
    });

    const confirmation = `Knowledge captured from ${technician} for ${tail || "unknown"}. Linked to ${extracted.component || component || "unknown"}, ${extracted.conditions || "standard"} conditions. Accessible to all certified technicians on this airframe.`;

    return {
        response: confirmation,
        sources: [
            {
                type: "oral",
                label: "Captured just now",
                details: memoryMessage,
            },
        ],
        validated: false,
        validation_note:
            "Pending review by certified technical authority before activation in production.",
        stored: true,
        stored_targets: targets.map((t) => t.label),
        failed_targets: [],
        retryable: false,
    };
}

// ── Query handler ────────────────────────────────────
async function handleQuery(
    transcript: string,
    tail: string | null
): Promise<OrchestrateResult> {
    let threadId: string;
    try {
        threadId = resolveThreadId(tail || "default");
    } catch {
        return {
            status: 400,
            error: `No Backboard thread configured for aircraft: ${tail}. Run npm run setup-backboard.`,
            response: ensureAmmDisclaimer(
                `No Backboard thread configured for aircraft: ${tail}.`
            ),
            degraded: true,
            retryable: false,
            sources: [{ type: "system", label: "thread not configured" }],
        };
    }

    const question = tail ? `[Aircraft: ${tail}] ${transcript}` : transcript;
    let response: string;
    let message_id: string;
    try {
        const queryResult = await sendQueryMessage(threadId, question);
        response = queryResult.response;
        message_id = queryResult.message_id;
    } catch (error) {
        if (isBackboardTransientError(error)) {
            return {
                status: 503,
                error: "Knowledge service is temporarily unavailable. Please try again in a few seconds.",
                response: ensureAmmDisclaimer(
                    "Knowledge service is temporarily unavailable. Please try again in a few seconds."
                ),
                retryable: true,
                degraded: true,
                sources: [{ type: "system", label: "knowledge service degraded" }],
            };
        }
        throw error;
    }
    const latestGeneratedSopDraft = await getLatestGeneratedSopDraftSource(threadId);

    const sources: OrchestrateSource[] = [];
    if (tail) {
        sources.push({
            type: "history",
            label: `${tail} memory`,
            details:
                `Retrieved from the ${tail} aircraft thread in Backboard. ` +
                "Includes prior interventions, observations, and maintenance context.",
        });
    }
    sources.push({
        type: "sop",
        label: "SOP documents (RAG)",
        details:
            "Retrieved from SOP documents uploaded to Backboard and indexed for retrieval.",
    });
    sources.push({
        type: "sop",
        label: "Generated SOP drafts (from captures)",
        details:
            latestGeneratedSopDraft ||
            "No generated SOP draft found yet for this aircraft. Capture one first via /api/capture.",
    });
    sources.push({
        type: "oral",
        label: "Senior oral knowledge",
        details:
            "Retrieved from captured senior technician debrief notes stored in Backboard memory.",
    });

    return {
        response: ensureAmmDisclaimer(response),
        sources,
        message_id,
        degraded: false,
        retryable: false,
    };
}

// ── Log handler ──────────────────────────────────────
async function handleLog(
    transcript: string,
    tail: string | null,
    technician: string
): Promise<OrchestrateResult> {
    const logContext = `Technician: ${technician}
Aircraft: ${tail || "Unknown"}

Transcript:
"${transcript}"`;

    const extractedRaw = await chatCompletion(LOG_PROMPT, logContext, {
        temperature: 0.1,
    });

    let extracted;
    try {
        extracted = JSON.parse(extractedRaw);
    } catch {
        extracted = {
            description: transcript,
            component: "Unknown",
            findings: transcript,
            action_taken: "Logged",
            status: "monitoring",
        };
    }

    const logMessage = `[INTERVENTION LOG — ${new Date().toISOString().split("T")[0]}]
Technician: ${technician}
Aircraft: ${tail || "Unknown"}
Component: ${extracted.component || "Unknown"}
Observation: ${extracted.findings || extracted.description || transcript}
Action taken: ${extracted.action_taken || "None"}
Status: ${extracted.status || "monitoring"}
Escalation required: ${extracted.escalation_required ? "YES" : "No"}`;

    const tailKey = tail || "default";

    // Fire-and-forget: persist in background, return response immediately for TTS
    void persistMessages([
        {
            key: tailKey,
            label: `aircraft:${tailKey}`,
            content: logMessage,
        },
    ]).then((persistence) => {
        if (!persistence.stored) {
            console.error("[orchestrate/log] Background persist failed:", persistence.failed_targets);
        }
    }).catch((err) => {
        console.error("[orchestrate/log] Background persist error:", err);
    });

    const confirmation = `Logged. ${tail || "Aircraft"} memory updated.`;

    return {
        response: confirmation,
        stored: true,
        stored_targets: [`aircraft:${tailKey}`],
        failed_targets: [],
        retryable: false,
        sources: [
            {
                type: "history",
                label: `${tail || "Aircraft"} history`,
                details: logMessage,
            },
        ],
    };
}
