import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/openai";
import {
    getBackboardErrorMessage,
    isBackboardTransientError,
    persistMessages,
    type PersistTarget,
} from "@/lib/backboard";
import {
    assessCaptureTranscript,
    buildCaptureResponsePayload,
    buildFallbackSopDraft,
    buildSopKnowledgeInput,
    parseSopDraftOutput,
    renderSopDraftMarkdown,
} from "@/lib/capture-sop";
import { ELICITATION_PROMPT, SOP_DRAFT_PROMPT } from "@/lib/prompts";

type ExtractedKnowledge = {
    knowledge?: string;
    component?: string;
    conditions?: string;
    confidence?: number;
};

type SpeakerFilterMetadata = {
    mode?: "teacher_filtered" | "degraded_full" | "no_profile";
    teacher_key?: string;
    teacher_ratio?: number;
    teacher_words?: number;
    full_words?: number;
    reason?: string;
};

function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

/**
 * POST /api/capture
 *
 * Captures oral knowledge from a senior technician.
 * Stores in Backboard: aircraft thread + technician thread (memory=Auto).
 *
 * Body: { transcript, technician, tail, component, conditions }
 * Returns: { confirmation }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { transcript, technician, tail, component, conditions, speaker_filter } = body as {
            transcript?: string;
            technician?: string;
            tail?: string;
            component?: string;
            conditions?: string;
            speaker_filter?: SpeakerFilterMetadata;
        };

        if (!transcript) {
            return NextResponse.json(
                { error: "transcript is required" },
                { status: 400 }
            );
        }

        const quality = assessCaptureTranscript(transcript);
        if (!quality.accepted) {
            return NextResponse.json(
                {
                    confirmation: "Capture disregarded: message was not actionable enough for SOP drafting.",
                    capture_accepted: false,
                    capture_rejection_reason: quality.reason,
                    stored: false,
                    stored_targets: [],
                    failed_targets: [],
                    degraded: false,
                    retryable: false,
                    sop_generated: false,
                    sop_draft: null,
                    sop_draft_markdown: "",
                    sop_generation_warning: "Capture disregarded before SOP generation.",
                },
                { status: 200 }
            );
        }

        // 1. LLM structures the raw transcript into clean oral knowledge
        const extractionContext = `Technician: ${technician || "Unknown"}
Aircraft: ${tail || "Unknown"}
Component: ${component || "Unknown"}
Conditions: ${conditions || "Standard"}

Transcript:
"${transcript}"`;

        const extractedRaw = await chatCompletion(
            ELICITATION_PROMPT,
            extractionContext,
            { temperature: 0.1 }
        );

        let extracted: ExtractedKnowledge;
        try {
            extracted = (JSON.parse(extractedRaw) as ExtractedKnowledge) ?? {};
        } catch {
            extracted = {
                knowledge: transcript,
                component: component || "Unknown",
                conditions: conditions || "Standard",
                confidence: 0.7,
            };
        }

        const technicianName = asString(technician) || "Unknown";
        const tailCode = asString(tail) || "Unknown";
        const componentName = asString(extracted.component) || asString(component) || "Unknown";
        const conditionsValue = asString(extracted.conditions) || asString(conditions) || "Standard";
        const extractedKnowledge = asString(extracted.knowledge) || transcript;
        const knowledgeText = buildSopKnowledgeInput(extractedKnowledge, transcript) || extractedKnowledge;

        // 2. Generate SOP draft from extracted knowledge.
        const sopFallback = buildFallbackSopDraft({
            transcript,
            technician: technicianName,
            tail: tailCode,
            component: componentName,
            conditions: conditionsValue,
            knowledge: extractedKnowledge,
        });

        let sopGenerated = false;
        let sopGenerationWarning: string | null = null;
        let sopDraft = sopFallback;

        const sopContext = `Technician: ${technicianName}
Aircraft: ${tailCode}
Component: ${componentName}
Conditions: ${conditionsValue}

Extracted knowledge:
"${knowledgeText}"

Original transcript:
"${transcript}"`;

        try {
            const sopRaw = await chatCompletion(
                SOP_DRAFT_PROMPT,
                sopContext,
                { temperature: 0.1 }
            );
            const parsed = parseSopDraftOutput(sopRaw, sopFallback);
            sopDraft = parsed.sopDraft;
            sopGenerated = parsed.sopGenerated;
            sopGenerationWarning = parsed.sopGenerationWarning;
        } catch (error) {
            sopGenerated = false;
            sopDraft = sopFallback;
            sopGenerationWarning = `SOP generation fallback used: ${
                error instanceof Error ? error.message : "Unknown error."
            }`;
        }

        const sopDraftMarkdown = renderSopDraftMarkdown(sopDraft);
        const sopMemoryMessage = `[GENERATED SOP DRAFT — UNVALIDATED — ${new Date().toISOString().split("T")[0]}]
Technician: ${technicianName}
Aircraft: ${tailCode}
Component: ${componentName}
Status: Pending review by certified technical authority
SOP generated by model: ${sopGenerated ? "yes" : "fallback"}

SOP JSON:
${JSON.stringify(sopDraft, null, 2)}

SOP Markdown:
${sopDraftMarkdown}`;

        // 3. Build a rich message for Backboard memory storage
        const speakerFilterHeader = speaker_filter
            ? `Speaker filter mode: ${asString(speaker_filter.mode) || "unknown"}
Teacher key: ${asString(speaker_filter.teacher_key) || "unknown"}
Teacher ratio: ${
                typeof speaker_filter.teacher_ratio === "number" && Number.isFinite(speaker_filter.teacher_ratio)
                    ? speaker_filter.teacher_ratio.toFixed(2)
                    : "n/a"
            }
Reason: ${asString(speaker_filter.reason) || "n/a"}`
            : null;
        const memoryMessage = `[ORAL KNOWLEDGE — ${new Date().toISOString().split("T")[0]}]
${speakerFilterHeader ? `${speakerFilterHeader}\n` : ""}Technician: ${technicianName}
Aircraft: ${tailCode}
Component: ${componentName}
Conditions: ${conditionsValue}
Knowledge: ${knowledgeText}`;

        const oralTargets: PersistTarget[] = [];
        const sopTargets: PersistTarget[] = [];
        if (tail) {
            oralTargets.push({
                key: tail,
                label: `aircraft:${tail}:oral`,
                content: memoryMessage,
            });
            sopTargets.push({
                key: tail,
                label: `aircraft:${tail}:sop-draft`,
                content: sopMemoryMessage,
            });
        }
        if (technician) {
            oralTargets.push({
                key: technician,
                label: `technician:${technician}:oral`,
                content: memoryMessage,
            });
            sopTargets.push({
                key: technician,
                label: `technician:${technician}:sop-draft`,
                content: sopMemoryMessage,
            });
        }
        const targets = [...oralTargets, ...sopTargets];

        if (targets.length === 0) {
            return NextResponse.json(
                {
                    error: "No capture targets provided. Add at least one of tail or technician.",
                    stored: false,
                    stored_targets: [],
                    failed_targets: [],
                    degraded: true,
                    retryable: false,
                    sop_generated: sopGenerated,
                    sop_draft: sopDraft,
                    sop_draft_markdown: sopDraftMarkdown,
                    sop_generation_warning: sopGenerationWarning,
                },
                { status: 400 }
            );
        }

        const persistence = await persistMessages(targets);
        const captureResponse = buildCaptureResponsePayload({
            technicianName,
            tailCode,
            componentName,
            conditionsValue,
            sopGenerated,
            sopDraft,
            sopDraftMarkdown,
            sopGenerationWarning,
            persistence,
        });
        return NextResponse.json({
            ...captureResponse.payload,
            speaker_filter,
        }, {
            status: captureResponse.status,
        });
    } catch (error) {
        console.error("[/api/capture] Error:", error);

        if (isBackboardTransientError(error)) {
            return NextResponse.json(
                {
                    error: "Capture service is temporarily unavailable. Please retry.",
                    retryable: true,
                    degraded: true,
                },
                { status: 503 }
            );
        }

        return NextResponse.json(
            {
                error: "Internal server error",
                details: getBackboardErrorMessage(error),
                retryable: false,
                degraded: true,
            },
            { status: 500 }
        );
    }
}
