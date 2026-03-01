import assert from "node:assert/strict";
import test from "node:test";

import {
    buildCaptureResponsePayload,
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
