// ─────────────────────────────────────────────
// SOP primacy as a pipeline property.
//
// docs/trust-safety.md calls it "structurally enforced". These tests are
// what makes that sentence true: the pipeline cannot emit an answer that
// contradicts a computable AMM rule, whatever the model produces.
//
// The regenerate callback is a stub here — no network, no keys. What is
// under test is the verify → correct → verify → fail-closed sequence, not
// any model's willingness to comply.
// ─────────────────────────────────────────────

import assert from "node:assert/strict";
import test from "node:test";

import { findBandContradictions } from "../lib/bands";
import { enforceSopPrimacy } from "../lib/sop-primacy";

const OIL_QUESTION = "Oil consumption on F-GKXA is at 0.3 qt/hr. Is that a problem?";
const WRONG_OIL =
    "According to the SOP, 0.3 qt/hr is considered NORMAL. Marc Delaunay noted it has been stable, so no further action is required.";
const RIGHT_OIL =
    "Per AMM 72-53-00, 0.3 qt/hr falls into the ELEVATED band: increase monitoring to every flight and check for leaks.";

// ── detection ──

test("a wrong band is detected", () => {
    const found = findBandContradictions(WRONG_OIL, OIL_QUESTION);
    assert.equal(found.length, 1);
    assert.equal(found[0].kind, "wrong-band");
    assert.match(found[0].detail, /ELEVATED/);
});

test("a correct band is not flagged", () => {
    assert.deepEqual(findBandContradictions(RIGHT_OIL, OIL_QUESTION), []);
});

test("a shortened monitoring interval standing alone is detected", () => {
    // source-conflict-01: both captured experts work to 2 cycles, the AMM
    // MONITOR band requires 3, and the manual's interval stopped being carried.
    const found = findBandContradictions(
        "Marc and Jean-Pierre both suggest monitoring across 2 cycles before escalating.",
        "F-GKXA, 2.6 NU, 5 degrees out. What do I do?"
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].kind, "shortened-interval");
    assert.match(found[0].detail, /3 flight cycles/);
});

test("quoting a shorter interval alongside the manual's is allowed", () => {
    // The correct answer mentions both. Forbidding the expert's number would
    // suppress exactly the context the product exists to deliver.
    assert.deepEqual(
        findBandContradictions(
            "AMM 72-21-00 requires monitoring 3 flight cycles. Marc suggests monitoring 2 cycles, which is his own practice and shorter than the manual.",
            "F-GKXA, 2.6 NU, 5 degrees out."
        ),
        []
    );
});

// ── enforcement ──

test("a clean answer passes through untouched", async () => {
    const outcome = await enforceSopPrimacy(OIL_QUESTION, RIGHT_OIL, async () => {
        throw new Error("regenerate must not be called on a clean answer");
    });

    assert.equal(outcome.status, "clean");
    assert.equal(outcome.response, RIGHT_OIL);
    assert.deepEqual(outcome.contradictions, []);
});

test("one targeted correction is accepted when it resolves the contradiction", async () => {
    let correction = "";
    const outcome = await enforceSopPrimacy(OIL_QUESTION, WRONG_OIL, async (c) => {
        correction = c;
        return RIGHT_OIL;
    });

    assert.equal(outcome.status, "corrected");
    assert.equal(outcome.response, RIGHT_OIL);
    assert.equal(outcome.contradictions.length, 1);
    // The correction carries the manual's own terms, not a vague scolding.
    assert.match(correction, /ELEVATED/);
    assert.match(correction, /0\.30 - 0\.50 qt\/hr/);
    assert.match(correction, /do not override the manual/i);
});

test("a correction that still contradicts falls back to the manual", async () => {
    const outcome = await enforceSopPrimacy(
        OIL_QUESTION,
        WRONG_OIL,
        async () => "Still NORMAL as far as I can tell, no action is required."
    );

    assert.equal(outcome.status, "fallback");
    assert.match(outcome.response, /ELEVATED/);
    assert.match(outcome.response, /72-53-00/);
    assert.doesNotMatch(outcome.response, /NORMAL/);
});

test("a throwing regenerate falls back rather than propagating", async () => {
    const outcome = await enforceSopPrimacy(OIL_QUESTION, WRONG_OIL, async () => {
        throw new Error("provider timeout");
    });

    assert.equal(outcome.status, "fallback");
    assert.match(outcome.response, /ELEVATED/);
});

test("an empty correction falls back", async () => {
    const outcome = await enforceSopPrimacy(OIL_QUESTION, WRONG_OIL, async () => "   ");
    assert.equal(outcome.status, "fallback");
    assert.match(outcome.response, /ELEVATED/);
});

test("with no regenerate available it fails closed immediately", async () => {
    const outcome = await enforceSopPrimacy(OIL_QUESTION, WRONG_OIL);
    assert.equal(outcome.status, "fallback");
    assert.match(outcome.response, /ELEVATED/);
});

test("a question with no classifiable reading is left alone", async () => {
    const outcome = await enforceSopPrimacy(
        "What's the torque spec for the fan cowl latches?",
        "I don't have a torque value for those latches in any indexed source.",
        async () => {
            throw new Error("regenerate must not be called");
        }
    );

    assert.equal(outcome.status, "clean");
});
