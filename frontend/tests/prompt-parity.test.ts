// ─────────────────────────────────────────────
// The same safety rules exist in two prompts:
//
//   frontend/lib/prompts.ts        SYNTHESIS_PROMPT   (not currently wired)
//   scripts/setup-backboard.mjs   DEFAULT_SYSTEM_PROMPT (governs /api/query)
//
// Two copies of a safety rule is one copy too many, and the one that runs
// is not the one docs/trust-safety.md cites. Until they are merged, this
// test is the drift guard: edit one and forget the other, and it fails.
// ─────────────────────────────────────────────

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SAFETY_RULES, SYNTHESIS_PROMPT } from "../lib/prompts";
import { AMM_DISCLAIMER } from "../lib/safety";

const setupScript = readFileSync(
    fileURLToPath(new URL("../../scripts/setup-backboard.mjs", import.meta.url)),
    "utf8"
);

test("every safety rule appears in the synthesis prompt", () => {
    for (const rule of SAFETY_RULES) {
        assert.ok(
            SYNTHESIS_PROMPT.includes(rule),
            `SYNTHESIS_PROMPT is missing: ${rule.slice(0, 60)}...`
        );
    }
});

test("every safety rule appears in the Backboard assistant prompt", () => {
    for (const rule of SAFETY_RULES) {
        assert.ok(
            setupScript.includes(rule),
            `setup-backboard.mjs DEFAULT_SYSTEM_PROMPT is missing: ${rule.slice(0, 60)}...`
        );
    }
});

test("both prompts state the exact AMM closing sentence", () => {
    assert.ok(SYNTHESIS_PROMPT.includes(AMM_DISCLAIMER));
    assert.ok(setupScript.includes(AMM_DISCLAIMER));
});

test("both prompts forbid anything following the AMM sentence", () => {
    // disclaimer-05 in the first live run put a follow-up question after it.
    assert.match(SYNTHESIS_PROMPT, /nothing may follow it/i);
    assert.match(setupScript, /Nothing may follow that sentence/i);
});

test("the setup script pushes the prompt to an existing assistant", () => {
    // Without updateAssistant, editing the prompt above changes nothing at
    // runtime: the assistant keeps the prompt it was created with.
    assert.match(setupScript, /updateAssistant/);
});
