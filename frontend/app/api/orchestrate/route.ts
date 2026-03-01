import { NextRequest, NextResponse } from "next/server";
import { classifyIntent } from "@/lib/llm";
import { chatCompletion } from "@/lib/openai";
import { sendMessage, countMessages, resolveThreadId } from "@/lib/backboard";
import { ELICITATION_PROMPT, LOG_PROMPT } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 25;

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

        // ── Step 1: Classify intent ──────────────────────
        const classification = await classifyIntent(transcript);
        const intent = classification.intent as "capture" | "query" | "log";
        const confidence = classification.confidence ?? 0;
        const detectedAircraft = classification.aircraft || tail || null;
        const detectedComponent = classification.component || null;

        console.log("[/api/orchestrate] classified:", {
            intent,
            confidence,
            aircraft: detectedAircraft,
            component: detectedComponent,
            classifyMs: Date.now() - startMs,
        });

        // ── Step 2: Route to handler ─────────────────────
        let result;

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

        return NextResponse.json({
            intent,
            confidence,
            aircraft: detectedAircraft,
            component: detectedComponent,
            ...result,
        });
    } catch (error) {
        console.error("[/api/orchestrate] Error:", error);
        return NextResponse.json(
            {
                error: "Internal server error",
                details: error instanceof Error ? error.message : String(error),
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
) {
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

    // Fire-and-forget: store in background, don't block the response
    const storeInBackground = async () => {
        const storePromises: Promise<any>[] = [];

        if (tail) {
            try {
                const aircraftThreadId = resolveThreadId(tail);
                storePromises.push(sendMessage(aircraftThreadId, memoryMessage, "Auto"));
            } catch {
                console.warn(`[orchestrate/capture] No thread for aircraft: ${tail}`);
            }
        }

        if (technician && technician !== "Unknown") {
            try {
                const techThreadId = resolveThreadId(technician);
                storePromises.push(sendMessage(techThreadId, memoryMessage, "Auto"));
            } catch {
                console.warn(`[orchestrate/capture] No thread for technician: ${technician}`);
            }
        }

        const results = await Promise.allSettled(storePromises);
        for (const r of results) {
            if (r.status === "rejected") {
                console.error("[orchestrate/capture] Background store failed:", r.reason);
            }
        }
    };
    void storeInBackground();

    const confirmation = `Knowledge captured from ${technician} for ${tail || "unknown"}. Linked to ${extracted.component || component || "unknown"}, ${extracted.conditions || "standard"} conditions. Accessible to all certified technicians on this airframe.`;

    return {
        response: confirmation,
        sources: [{ type: "oral", label: "Captured just now" }],
    };
}

// ── Query handler ────────────────────────────────────
async function handleQuery(transcript: string, tail: string | null) {
    let threadId: string;
    try {
        threadId = resolveThreadId(tail || "default");
    } catch {
        return {
            response: `No Backboard thread configured for aircraft: ${tail}. Run npm run setup-backboard.`,
            sources: [],
        };
    }

    const question = tail ? `[Aircraft: ${tail}] ${transcript}` : transcript;
    const { response, message_id } = await sendMessage(threadId, question, "ReadOnly");

    const sources: Array<{ type: string; label: string }> = [];
    if (tail) sources.push({ type: "history", label: `${tail} memory` });
    sources.push({ type: "sop", label: "SOP documents (RAG)" });
    sources.push({ type: "oral", label: "Senior oral knowledge" });

    return { response, sources, message_id };
}

// ── Log handler ──────────────────────────────────────
async function handleLog(
    transcript: string,
    tail: string | null,
    technician: string
) {
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

    // Fire-and-forget: store in background, don't block the response
    try {
        const threadId = resolveThreadId(tail || "default");
        void sendMessage(threadId, logMessage, "Auto").catch((err) => {
            console.error("[orchestrate/log] Background store failed:", err);
        });
    } catch (err) {
        console.warn(`[orchestrate/log] Could not resolve thread for ${tail}:`, err);
    }

    const confirmation = `Logged. ${tail || "Aircraft"} memory updated.`;

    return {
        response: confirmation,
        sources: [
            {
                type: "history",
                label: `${tail || "Aircraft"} history`,
            },
        ],
    };
}
