import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/openai";
import {
    getBackboardErrorMessage,
    isBackboardTransientError,
    persistMessages,
    type PersistTarget,
} from "@/lib/backboard";
import { ELICITATION_PROMPT, SOP_DRAFT_PROMPT } from "@/lib/prompts";
import { AMM_DISCLAIMER } from "@/lib/safety";

type UnknownRecord = Record<string, unknown>;

type SOPProcedureStep = {
    step: number;
    instruction: string;
    expected_result: string;
};

type SOPDraft = {
    title: string;
    aircraft: string | null;
    component: string | null;
    objective: string;
    preconditions: string[];
    safety_checks: string[];
    procedure_steps: SOPProcedureStep[];
    escalation_conditions: string[];
    limitations: string[];
    disclaimer: string;
};

type ExtractedKnowledge = {
    knowledge?: string;
    component?: string;
    conditions?: string;
    confidence?: number;
};

function asRecord(value: unknown): UnknownRecord | null {
    return typeof value === "object" && value !== null ? (value as UnknownRecord) : null;
}

function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeList(value: unknown, fallback: string[]): string[] {
    if (!Array.isArray(value)) return fallback;
    const list = value
        .map((item) => asString(item))
        .filter(Boolean);
    return list.length > 0 ? list : fallback;
}

function toNullableField(value: string): string | null {
    if (!value) return null;
    return value.toLowerCase() === "unknown" ? null : value;
}

function buildFallbackSopDraft(params: {
    transcript: string;
    technician: string;
    tail: string;
    component: string;
    conditions: string;
    knowledge: string;
}): SOPDraft {
    const aircraft = toNullableField(params.tail);
    const component = toNullableField(params.component);
    const titleComponent = component ?? "maintenance task";
    const objective = params.knowledge || params.transcript;

    return {
        title: `Draft SOP - ${titleComponent}`,
        aircraft,
        component,
        objective,
        preconditions: [
            `Technician briefing captured from ${params.technician}.`,
            `Applicable aircraft context: ${params.tail}.`,
        ],
        safety_checks: [
            "Confirm aircraft condition and local work area safety.",
            "Confirm required tools and documentation are available.",
        ],
        procedure_steps: [
            {
                step: 1,
                instruction: "Review the captured observation and task context.",
                expected_result: "Task scope is clear before intervention.",
            },
            {
                step: 2,
                instruction: "Perform the inspection or action described by the senior technician.",
                expected_result: "Findings are documented with component context.",
            },
            {
                step: 3,
                instruction: "Record outcomes and any deviations from expected behavior.",
                expected_result: "Traceable intervention record is available.",
            },
            {
                step: 4,
                instruction: "Escalate if the result is outside expected limits.",
                expected_result: "Issue is handed over according to maintenance process.",
            },
        ],
        escalation_conditions: [
            "Unexpected component behavior during inspection.",
            "Any uncertainty about procedure applicability.",
        ],
        limitations: [
            `Captured conditions: ${params.conditions}.`,
            "Draft generated from oral capture; requires technical review.",
        ],
        disclaimer: AMM_DISCLAIMER,
    };
}

function normalizeProcedureSteps(value: unknown, fallback: SOPProcedureStep[]): SOPProcedureStep[] {
    if (!Array.isArray(value)) return fallback;

    const steps = value
        .map((item, idx) => {
            const rec = asRecord(item);
            if (!rec) return null;
            const instruction = asString(rec.instruction);
            const expectedResult = asString(rec.expected_result);
            if (!instruction || !expectedResult) return null;
            return {
                step: idx + 1,
                instruction,
                expected_result: expectedResult,
            };
        })
        .filter((step): step is SOPProcedureStep => step !== null);

    return steps.length > 0 ? steps : fallback;
}

function normalizeSopDraft(raw: unknown, fallback: SOPDraft): { draft: SOPDraft; sopGenerated: boolean } {
    const rec = asRecord(raw);
    if (!rec) {
        return { draft: fallback, sopGenerated: false };
    }

    const title = asString(rec.title) || fallback.title;
    const aircraft = toNullableField(asString(rec.aircraft)) ?? fallback.aircraft;
    const component = toNullableField(asString(rec.component)) ?? fallback.component;
    const objective = asString(rec.objective) || fallback.objective;
    const preconditions = normalizeList(rec.preconditions, fallback.preconditions);
    const safetyChecks = normalizeList(rec.safety_checks, fallback.safety_checks);
    const procedureSteps = normalizeProcedureSteps(rec.procedure_steps, fallback.procedure_steps);
    const escalationConditions = normalizeList(
        rec.escalation_conditions,
        fallback.escalation_conditions
    );
    const limitations = normalizeList(rec.limitations, fallback.limitations);

    const hasModelShape =
        asString(rec.title) !== "" &&
        asString(rec.objective) !== "" &&
        Array.isArray(rec.procedure_steps);

    return {
        draft: {
            title,
            aircraft,
            component,
            objective,
            preconditions,
            safety_checks: safetyChecks,
            procedure_steps: procedureSteps,
            escalation_conditions: escalationConditions,
            limitations,
            disclaimer: AMM_DISCLAIMER,
        },
        sopGenerated: hasModelShape,
    };
}

function renderSopDraftMarkdown(draft: SOPDraft): string {
    const lines: string[] = [];
    lines.push(`## ${draft.title}`);
    lines.push("");
    lines.push(`**Aircraft:** ${draft.aircraft ?? "N/A"}`);
    lines.push(`**Component:** ${draft.component ?? "N/A"}`);
    lines.push("");
    lines.push("### Objective");
    lines.push(draft.objective);
    lines.push("");
    lines.push("### Preconditions");
    for (const item of draft.preconditions) {
        lines.push(`- ${item}`);
    }
    lines.push("");
    lines.push("### Safety Checks");
    for (const item of draft.safety_checks) {
        lines.push(`- ${item}`);
    }
    lines.push("");
    lines.push("### Procedure Steps");
    for (const step of draft.procedure_steps) {
        lines.push(`${step.step}. ${step.instruction}`);
        lines.push(`   - Expected result: ${step.expected_result}`);
    }
    lines.push("");
    lines.push("### Escalation Conditions");
    for (const item of draft.escalation_conditions) {
        lines.push(`- ${item}`);
    }
    lines.push("");
    lines.push("### Limitations");
    for (const item of draft.limitations) {
        lines.push(`- ${item}`);
    }
    lines.push("");
    lines.push(`**Disclaimer:** ${AMM_DISCLAIMER}`);
    return lines.join("\n");
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
        const { transcript, technician, tail, component, conditions } = body;

        if (!transcript) {
            return NextResponse.json(
                { error: "transcript is required" },
                { status: 400 }
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
        const knowledgeText = asString(extracted.knowledge) || transcript;

        // 2. Generate SOP draft from extracted knowledge.
        const sopFallback = buildFallbackSopDraft({
            transcript,
            technician: technicianName,
            tail: tailCode,
            component: componentName,
            conditions: conditionsValue,
            knowledge: knowledgeText,
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
            const normalized = normalizeSopDraft(JSON.parse(sopRaw), sopFallback);
            sopDraft = normalized.draft;
            sopGenerated = normalized.sopGenerated;
            if (!sopGenerated) {
                sopGenerationWarning =
                    "SOP model output was incomplete. Returned deterministic fallback draft.";
            }
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
        const memoryMessage = `[ORAL KNOWLEDGE — ${new Date().toISOString().split("T")[0]}]
Technician: ${technicianName}
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
        const retryable = persistence.failed_targets.some((f) => f.retryable);
        const sopPersisted = persistence.stored_targets.some((target) =>
            target.endsWith(":sop-draft")
        );
        const payload = {
            confirmation: `Knowledge captured from ${technicianName || "unknown"} for ${tailCode || "unknown"}. Linked to ${componentName || "unknown"}, ${conditionsValue || "standard"} conditions. Accessible to all certified technicians on this airframe.`,
            validated: false,
            validation_note:
                "Pending review by certified technical authority before activation in production.",
            ...persistence,
            retryable,
            sop_generated: sopGenerated,
            sop_draft: sopDraft,
            sop_draft_markdown: sopDraftMarkdown,
            sop_generation_warning: sopGenerationWarning,
            sop_persisted: sopPersisted,
        };

        if (!persistence.stored) {
            return NextResponse.json(
                {
                    ...payload,
                    error: "Capture received but could not be persisted to Backboard.",
                    degraded: true,
                },
                { status: retryable ? 503 : 500 }
            );
        }

        return NextResponse.json(payload);
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
