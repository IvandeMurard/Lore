import assert from "node:assert/strict";
import test from "node:test";

import {
    assessCaptureTranscript,
    buildCaptureProbingQuestion,
    buildCaptureResponsePayload,
    buildFallbackSopDraft,
    buildSopKnowledgeInput,
    parseSopDraftOutput,
} from "../lib/capture-sop";
import { AMM_DISCLAIMER } from "../lib/safety";

function makeFallbackDraft() {
    return {
        title: "Draft SOP - fan section",
        aircraft: "F-GKXA",
        component: "fan section",
        objective: "Inspect fan section vibration pattern.",
        preconditions: ["Aircraft safely parked."],
        safety_checks: ["PPE checked."],
        procedure_steps: [
            {
                step: 1,
                instruction: "Inspect fan section.",
                expected_result: "Visual check complete.",
            },
        ],
        escalation_conditions: ["Unexpected resonance detected."],
        limitations: ["Unvalidated draft."],
        disclaimer: AMM_DISCLAIMER,
    };
}

test("parseSopDraftOutput falls back safely on malformed JSON", async () => {
    const fallback = makeFallbackDraft();

    const result = parseSopDraftOutput("{invalid-json", fallback);

    assert.equal(result.sopGenerated, false);
    assert.equal(result.sopDraft.title, fallback.title);
    assert.equal(result.sopDraft.disclaimer, AMM_DISCLAIMER);
    assert.match(result.sopGenerationWarning ?? "", /fallback/i);
});

test("parseSopDraftOutput enforces exact disclaimer even when model output differs", async () => {
    const fallback = makeFallbackDraft();
    const modelJson = JSON.stringify({
        title: "Compressor vibration SOP draft",
        aircraft: "F-GKXA",
        component: "HP compressor",
        objective: "Run a controlled vibration inspection.",
        preconditions: ["Engine cooled."],
        safety_checks: ["Area clear."],
        procedure_steps: [
            {
                step: 99,
                instruction: "Inspect compressor stage.",
                expected_result: "Vibration trend captured.",
            },
        ],
        escalation_conditions: ["Any abnormal oscillation."],
        limitations: ["Requires AMM validation."],
        disclaimer: "some other disclaimer",
    });

    const result = parseSopDraftOutput(modelJson, fallback);

    assert.equal(result.sopGenerated, true);
    assert.equal(result.sopDraft.disclaimer, AMM_DISCLAIMER);
    assert.equal(result.sopDraft.procedure_steps[0]?.step, 1);
});

test("buildCaptureResponsePayload keeps SOP fields on degraded persistence", async () => {
    const fallback = makeFallbackDraft();

    const response = buildCaptureResponsePayload({
        technicianName: "Marc Delaunay",
        tailCode: "F-GKXA",
        componentName: "fan section",
        conditionsValue: "cold weather",
        probingQuestion: "What early sign confirms this pattern before escalation?",
        sopGenerated: false,
        sopDraft: fallback,
        sopDraftMarkdown: "## Draft SOP\n\n**Disclaimer:** Always verify the AMM procedure before intervening.",
        sopGenerationWarning: "SOP generation fallback used.",
        persistence: {
            stored: false,
            stored_targets: [],
            failed_targets: [
                {
                    target: "aircraft:F-GKXA:sop-draft",
                    reason: "Backboard timeout",
                    retryable: true,
                },
            ],
            degraded: true,
        },
    });

    const payload = response.payload as Record<string, unknown>;

    assert.equal(response.status, 503);
    assert.equal(payload.error, "Capture received but could not be persisted to Backboard.");
    assert.equal(payload.sop_draft_markdown, "## Draft SOP\n\n**Disclaimer:** Always verify the AMM procedure before intervening.");
    assert.equal(payload.retryable, true);
});

test("buildCaptureProbingQuestion prefers model-provided question when present", async () => {
    const question = buildCaptureProbingQuestion({
        transcript: "I check N1 vibration trend before deciding.",
        componentName: "fan section",
        conditionsValue: "cold weather",
        modelQuestion: "Which threshold makes you escalate immediately",
    });

    assert.equal(question, "Which threshold makes you escalate immediately?");
});

test("buildCaptureProbingQuestion falls back to SOP-gap probe when SOP gap missing", async () => {
    const question = buildCaptureProbingQuestion({
        transcript: "I inspect by feel and by sound during startup.",
        componentName: "fan section",
        conditionsValue: "cold weather",
        sopGap: "",
        failureMode: "Unexpected rise in vibration",
    });

    assert.match(question.toLowerCase(), /sop/);
});

test("assessCaptureTranscript rejects low-signal non-actionable capture", async () => {
    const result = assessCaptureTranscript("uh okay yes sure got it okay.");
    assert.equal(result.accepted, false);
    assert.ok(result.reason);
});

test("buildSopKnowledgeInput removes filler-heavy conversational noise", async () => {
    const input = "Uh okay, we need to check blades before and after each flight. Okay sir, I'll do it.";
    const distilled = buildSopKnowledgeInput(input, input);
    assert.match(distilled.toLowerCase(), /check blades/);
    assert.ok(!distilled.toLowerCase().includes("i'll do it"));
});

test("buildFallbackSopDraft derives actionable steps from meaningful guidance", async () => {
    const draft = buildFallbackSopDraft({
        transcript:
            "Check blades before and after each flight and look for wear or cracks. Record findings and escalate abnormalities.",
        technician: "Marc Delaunay",
        tail: "F-GKXA",
        component: "Unknown",
        conditions: "Standard",
        knowledge:
            "Check blades before and after each flight and look for wear or cracks. Record findings and escalate abnormalities.",
    });

    assert.equal(draft.component, "blade section");
    assert.ok(draft.procedure_steps.length >= 2);
    assert.match(draft.procedure_steps[0].instruction.toLowerCase(), /blade|check|inspect/);
});
