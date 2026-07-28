// ─────────────────────────────────────────────
// The AMM disclaimer is described as non-removable in
// docs/trust-safety.md. That is a claim about code, not about the prompt:
// asked to both close with the sentence and ask a follow-up question, the
// model reliably produces "...before intervening. Is there anything else?"
// — the reminder reading as if it applied to the pleasantry.
//
// ensureAmmDisclaimer therefore guarantees final position rather than mere
// presence. These tests pin that guarantee.
// ─────────────────────────────────────────────

import assert from "node:assert/strict";
import test from "node:test";

import {
    AMM_DISCLAIMER,
    ensureAmmDisclaimer,
    shouldAppendAmmDisclaimer,
} from "../lib/safety";

test("appends the sentence when it is missing", () => {
    const out = ensureAmmDisclaimer("Record the reading and monitor 3 flight cycles.");
    assert.ok(out.endsWith(AMM_DISCLAIMER));
    assert.match(out, /^Record the reading/);
});

test("leaves an already-correct response alone apart from whitespace", () => {
    const input = `Record the reading. ${AMM_DISCLAIMER}`;
    assert.equal(ensureAmmDisclaimer(input), input);
});

test("moves the sentence to the end when a question trails it", () => {
    // Verbatim shape from the second live run: fabrication-05, abstain-03,
    // abstain-05 all closed like this.
    const out = ensureAmmDisclaimer(
        `The maximum total material removal per fan blade is 8.0 mm. ${AMM_DISCLAIMER} Is there a specific zone you're concerned about?`
    );
    assert.ok(out.endsWith(AMM_DISCLAIMER), `not final: ${out}`);
    assert.match(out, /specific zone you're concerned about\?/);
    // Exactly one occurrence — the sentence is moved, not duplicated.
    assert.equal(out.split(AMM_DISCLAIMER).length - 1, 1);
});

test("collapses a sentence repeated mid-text", () => {
    const out = ensureAmmDisclaimer(
        `${AMM_DISCLAIMER} You are in the MONITOR band. ${AMM_DISCLAIMER}`
    );
    assert.equal(out.split(AMM_DISCLAIMER).length - 1, 1);
    assert.ok(out.endsWith(AMM_DISCLAIMER));
    assert.match(out, /MONITOR band/);
});

test("adds terminal punctuation before appending", () => {
    const out = ensureAmmDisclaimer("Reading is 2.4 NU");
    assert.equal(out, `Reading is 2.4 NU. ${AMM_DISCLAIMER}`);
});

test("returns the sentence alone for empty input", () => {
    assert.equal(ensureAmmDisclaimer(""), AMM_DISCLAIMER);
    assert.equal(ensureAmmDisclaimer("   "), AMM_DISCLAIMER);
});

test("is idempotent", () => {
    const once = ensureAmmDisclaimer("Monitor 3 flight cycles.");
    assert.equal(ensureAmmDisclaimer(once), once);
});

test("shouldAppendAmmDisclaimer skips product questions but not maintenance ones", () => {
    assert.equal(shouldAppendAmmDisclaimer("What is Lore, and who built it?"), false);
    assert.equal(shouldAppendAmmDisclaimer("What's the architecture behind this product?"), false);
    assert.equal(shouldAppendAmmDisclaimer("2.4 NU on the N1 shaft, what do I do?"), true);
    // A bare conversational close on a maintenance thread still gets it.
    assert.equal(shouldAppendAmmDisclaimer("Thanks, that's all."), true);
});
