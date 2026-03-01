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

export type CaptureQualityAssessment = {
    accepted: boolean;
    reason: string | null;
    normalizedTranscript: string;
    wordCount: number;
    actionableSignalCount: number;
};

type CapturePayloadParams = {
    technicianName: string;
    tailCode: string;
    componentName: string;
    conditionsValue: string;
    probingQuestion: string;
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

function cleanWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function splitWords(value: string): string[] {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean);
}

function dedupeList(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
        const key = value.toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
}

const FILLER_WORDS = new Set([
    "uh",
    "um",
    "erm",
    "ah",
    "okay",
    "ok",
    "like",
    "sir",
    "you",
    "know",
]);

const ACTIONABLE_HINTS = [
    "inspect",
    "inspection",
    "check",
    "verify",
    "record",
    "monitor",
    "replace",
    "tighten",
    "calibrate",
    "borescope",
    "blade",
    "fan",
    "compressor",
    "leak",
    "wear",
    "damage",
    "torque",
    "vibration",
    "temperature",
    "pressure",
];

export function assessCaptureTranscript(transcript: string): CaptureQualityAssessment {
    const normalizedTranscript = cleanWhitespace(transcript);
    const words = splitWords(normalizedTranscript);
    const wordCount = words.length;

    if (!normalizedTranscript || wordCount < 8) {
        return {
            accepted: false,
            reason: "capture_too_short",
            normalizedTranscript,
            wordCount,
            actionableSignalCount: 0,
        };
    }

    const fillerCount = words.filter((w) => FILLER_WORDS.has(w)).length;
    const fillerRatio = fillerCount / Math.max(1, wordCount);
    const actionableSignalCount = ACTIONABLE_HINTS.reduce((count, hint) => (
        normalizedTranscript.toLowerCase().includes(hint) ? count + 1 : count
    ), 0);

    if (actionableSignalCount === 0 && wordCount < 30) {
        return {
            accepted: false,
            reason: "capture_not_actionable",
            normalizedTranscript,
            wordCount,
            actionableSignalCount,
        };
    }

    if (fillerRatio > 0.32 && actionableSignalCount < 2) {
        return {
            accepted: false,
            reason: "capture_low_signal",
            normalizedTranscript,
            wordCount,
            actionableSignalCount,
        };
    }

    return {
        accepted: true,
        reason: null,
        normalizedTranscript,
        wordCount,
        actionableSignalCount,
    };
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

function summarizeObjective(text: string, component: string | null): string {
    const cleaned = text
        .replace(/\b(uh+|um+|erm+|ah+|okay|ok|sir)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

    const sentences = cleaned
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 20);

    const candidate = sentences[0] ?? cleaned;
    if (!candidate) {
        return component
            ? `Perform a safe and traceable maintenance task on ${component}.`
            : "Perform a safe and traceable maintenance task.";
    }

    const truncated = candidate.length > 180 ? `${candidate.slice(0, 177).trim()}...` : candidate;
    return truncated;
}

function splitSentences(text: string): string[] {
    return text
        .replace(/\s+/g, " ")
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 12);
}

function cleanKnowledgeLine(text: string): string {
    return cleanWhitespace(
        text
            .replace(/\b(uh+|um+|erm+|ah+)\b/gi, "")
            .replace(/\b(okay|ok)\b/gi, "")
            .replace(/\b(i'?ll be doing it|i'?ll do it|understood|got it)\b/gi, "")
    );
}

function inferComponentFromText(text: string): string | null {
    const lower = text.toLowerCase();
    if (lower.includes("blade")) return "blade section";
    if (lower.includes("fan")) return "fan section";
    if (lower.includes("compressor")) return "compressor section";
    if (lower.includes("borescope")) return "borescope inspection point";
    if (lower.includes("n1")) return "N1 system";
    if (lower.includes("n2")) return "N2 system";
    return null;
}

function expectedResultForInstruction(instruction: string): string {
    const lower = instruction.toLowerCase();
    if (/wear|tear|crack|damage|blade/.test(lower)) {
        return "No unacceptable wear, crack, or blade damage is observed.";
    }
    if (/leak/.test(lower)) {
        return "No active leak is observed and the area remains clean.";
    }
    if (/vibration/.test(lower)) {
        return "Vibration behavior is stable and deviations are documented.";
    }
    if (/record|log|document/.test(lower)) {
        return "A traceable maintenance record is created with key findings.";
    }
    if (/escalat|report|flag/.test(lower)) {
        return "Abnormal findings are escalated to authorized maintenance authority.";
    }
    return "Inspection outcome is verified and documented for traceability.";
}

function normalizeQuestion(value: string): string {
    const trimmed = cleanWhitespace(value);
    if (!trimmed) return "";
    if (/[?]$/.test(trimmed)) return trimmed;
    return `${trimmed}?`;
}

export function buildCaptureProbingQuestion(params: {
    transcript: string;
    componentName: string;
    conditionsValue: string;
    sopGap?: string | null;
    teachingTip?: string | null;
    failureMode?: string | null;
    modelQuestion?: string | null;
}): string {
    const modelQuestion = normalizeQuestion(asString(params.modelQuestion));
    if (modelQuestion) {
        return modelQuestion;
    }

    const lower = `${params.transcript} ${params.componentName} ${params.conditionsValue}`.toLowerCase();
    const hasSensoryCue = /\b(sound|noise|hear|feel|touch|visual|see|smell|vibration|temperature|pressure)\b/.test(lower);

    if (!asString(params.sopGap)) {
        return "For project memory, where does your field method differ from SOP, and why is that safer in this situation?";
    }

    if (!asString(params.failureMode)) {
        return "For project memory, what exact early failure signal tells you to stop and escalate immediately?";
    }

    if (!hasSensoryCue) {
        return "For project memory, what exact visual, sound, or feel cue should a junior check first on this task?";
    }

    const conditions = asString(params.conditionsValue).toLowerCase();
    if (!conditions || conditions === "standard" || conditions === "unknown") {
        return "For project memory, under which operating conditions does this pattern become critical for decision-making?";
    }

    if (!asString(params.teachingTip)) {
        return "For project memory, what one teaching tip helps a junior avoid the most common mistake on this intervention?";
    }

    return "For project memory, what final verification check should a junior perform before closing this intervention?";
}

function buildProcedureStepsFromKnowledge(knowledge: string): SOPProcedureStep[] {
    const candidates = splitSentences(knowledge)
        .map((sentence) => cleanKnowledgeLine(sentence))
        .filter(Boolean)
        .filter((line) => /inspect|check|verify|monitor|look|record|log|review|compare|confirm|escalat|report|flag|wear|blade|damage|leak|vibration/i.test(line))
        .slice(0, 4);

    const steps = dedupeList(candidates)
        .map((line, idx) => ({
            step: idx + 1,
            instruction: line.replace(/[.]+$/g, ""),
            expected_result: expectedResultForInstruction(line),
        }));

    if (steps.length === 0) {
        return [];
    }

    const hasRecordStep = steps.some((s) => /record|log|document/i.test(s.instruction));
    if (!hasRecordStep) {
        steps.push({
            step: steps.length + 1,
            instruction: "Record findings and deviations in the maintenance log.",
            expected_result: "A complete, traceable maintenance record is available.",
        });
    }

    const hasEscalationStep = steps.some((s) => /escalat|report|flag/i.test(s.instruction));
    if (!hasEscalationStep) {
        steps.push({
            step: steps.length + 1,
            instruction: "Escalate immediately if findings exceed normal limits.",
            expected_result: "Critical issues are handed over to certified authority.",
        });
    }

    return steps.map((s, idx) => ({ ...s, step: idx + 1 }));
}

export function buildSopKnowledgeInput(rawKnowledge: string, rawTranscript: string): string {
    const source = cleanWhitespace(rawKnowledge || rawTranscript);
    if (!source) return "";
    const lines = splitSentences(source)
        .map((line) => cleanKnowledgeLine(line))
        .filter((line) => line.length >= 12);
    return dedupeList(lines).join("\n");
}

function normalizeSopDraft(raw: unknown, fallback: SOPDraft): { draft: SOPDraft; sopGenerated: boolean } {
    const rec = asRecord(raw);
    if (!rec) {
        return { draft: fallback, sopGenerated: false };
    }

    const title = asString(rec.title) || fallback.title;
    const aircraft = toNullableField(asString(rec.aircraft)) ?? fallback.aircraft;
    const component = toNullableField(asString(rec.component)) ?? fallback.component;
    const objective = summarizeObjective(asString(rec.objective) || fallback.objective, component);
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
    const inferredComponent = inferComponentFromText(`${params.knowledge} ${params.transcript}`);
    const component = toNullableField(params.component) ?? inferredComponent;
    const titleComponent = component ?? "maintenance task";
    const normalizedKnowledge = buildSopKnowledgeInput(params.knowledge, params.transcript);
    const objective = summarizeObjective(
        normalizedKnowledge || params.knowledge || params.transcript,
        component
    );
    const knowledgeDrivenSteps = buildProcedureStepsFromKnowledge(normalizedKnowledge);

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
        procedure_steps: knowledgeDrivenSteps.length > 0
            ? knowledgeDrivenSteps
            : [
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
    lines.push(`# ${draft.title}`);
    lines.push("");
    lines.push("> Status: Draft (unvalidated)");
    lines.push("");
    lines.push(`**Aircraft:** ${draft.aircraft ?? "N/A"}`);
    lines.push(`**Component:** ${draft.component ?? "N/A"}`);
    lines.push("");
    lines.push("### Objective");
    lines.push(`- ${draft.objective}`);
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
        lines.push(`${step.step}. **Action:** ${step.instruction}`);
        lines.push(`   **Expected result:** ${step.expected_result}`);
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
    lines.push("### Compliance");
    lines.push(`**Disclaimer:** ${AMM_DISCLAIMER}`);
    return lines.join("\n");
}

export function buildCaptureResponsePayload({
    technicianName,
    tailCode,
    componentName,
    conditionsValue,
    probingQuestion,
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
        confirmation: `Knowledge captured from ${technicianName || "unknown"} for ${tailCode || "unknown"}. Linked to ${componentName || "unknown"} under ${conditionsValue || "standard"} conditions. Added to the project knowledge memory. ${probingQuestion}`,
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
