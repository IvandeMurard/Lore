import type { PersistResult } from "@/lib/backboard";
import { AMM_DISCLAIMER } from "@/lib/safety";

type UnknownRecord = Record<string, unknown>;

export type SOPProcedureStep = {
    step: number;
    instruction: string;
    expected_result: string;
};

export type SOPDraft = {
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

type CapturePayloadParams = {
    technicianName: string;
    tailCode: string;
    componentName: string;
    conditionsValue: string;
    sopGenerated: boolean;
    sopDraft: SOPDraft;
    sopDraftMarkdown: string;
    sopGenerationWarning: string | null;
    persistence: PersistResult;
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

export function buildFallbackSopDraft(params: {
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

export function parseSopDraftOutput(
    sopRaw: string,
    fallback: SOPDraft
): {
    sopDraft: SOPDraft;
    sopGenerated: boolean;
    sopGenerationWarning: string | null;
} {
    try {
        const normalized = normalizeSopDraft(JSON.parse(sopRaw), fallback);
        return {
            sopDraft: normalized.draft,
            sopGenerated: normalized.sopGenerated,
            sopGenerationWarning: normalized.sopGenerated
                ? null
                : "SOP model output was incomplete. Returned deterministic fallback draft.",
        };
    } catch (error) {
        return {
            sopDraft: fallback,
            sopGenerated: false,
            sopGenerationWarning: `SOP generation fallback used: ${
                error instanceof Error ? error.message : "Unknown error."
            }`,
        };
    }
}

export function renderSopDraftMarkdown(draft: SOPDraft): string {
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

export function buildCaptureResponsePayload({
    technicianName,
    tailCode,
    componentName,
    conditionsValue,
    sopGenerated,
    sopDraft,
    sopDraftMarkdown,
    sopGenerationWarning,
    persistence,
}: CapturePayloadParams): {
    status: number;
    payload: Record<string, unknown>;
} {
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
        return {
            status: retryable ? 503 : 500,
            payload: {
                ...payload,
                error: "Capture received but could not be persisted to Backboard.",
                degraded: true,
            },
        };
    }

    return {
        status: 200,
        payload,
    };
}
