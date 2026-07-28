// ─────────────────────────────────────────────
// Tests for the eval graders.
//
// An untested grader is worse than no grader: it produces a green run
// that means nothing. Every grader is checked in both directions —
// it must reject the failure it owns, and it must not reject a
// legitimate answer.
// ─────────────────────────────────────────────

import assert from "node:assert/strict";
import test from "node:test";

import {
    EMPTY_CONTEXT,
    extractBareNumbers,
    extractDocRefs,
    extractQuantities,
    gradeAbstention,
    gradeAmmDisclaimer,
    gradeAttribution,
    gradeForbiddenPatterns,
    gradeLearnerAddress,
    gradeNoFabricatedConsensus,
    gradeNoFabricatedMeasurements,
    gradeRequiredPatterns,
    gradeSopCitedFirst,
    normalizeNumberWords,
    type EvalContext,
} from "../evals/graders";
import { AMM_DISCLAIMER } from "../lib/safety";

const ctx = (
    sop: string[] = [],
    oral: string[] = [],
    history: string[] = []
): EvalContext => ({ sop, oral, history });

// ── measurement extraction ───────────────────

test("extractQuantities normalises equivalent spellings to one token", () => {
    assert.deepEqual(extractQuantities("2.0 NU"), ["2nu"]);
    assert.deepEqual(extractQuantities("2 NU"), ["2nu"]);
    assert.deepEqual(extractQuantities("2,0 NU"), ["2nu"]);
    assert.deepEqual(extractQuantities("2.0NU"), ["2nu"]);
});

test("extractQuantities treats deg C spellings as one unit", () => {
    assert.deepEqual(extractQuantities("below 8 deg C"), ["8°c"]);
    assert.deepEqual(extractQuantities("below 8°C"), ["8°c"]);
    assert.deepEqual(extractQuantities("below 8 degrees C"), ["8°c"]);
});

test("extractQuantities collapses cycle and duration plurals", () => {
    assert.deepEqual(extractQuantities("3 flight cycles"), ["3cycles"]);
    assert.deepEqual(extractQuantities("3 cycles"), ["3cycles"]);
    assert.deepEqual(extractQuantities("30 seconds"), ["30seconds"]);
    assert.deepEqual(extractQuantities("30 secs"), ["30seconds"]);
});

test("extractDocRefs finds AMM references but extractQuantities does not", () => {
    assert.deepEqual(extractDocRefs("per AMM 72-21-00-720-001"), ["72-21-00-720-001"]);
    assert.deepEqual(extractQuantities("per AMM 72-21-00"), []);
});

// ── no fabricated measurements ───────────────

test("gradeNoFabricatedMeasurements accepts values traceable to context", () => {
    const verdict = gradeNoFabricatedMeasurements(
        "MONITOR runs 2.0 to 3.5 NU, so record and monitor 3 flight cycles.",
        ctx(["NORMAL < 2.0 NU. MONITOR 2.0 - 3.5 NU, monitor 3 flight cycles."])
    );
    assert.equal(verdict.passed, true);
});

test("gradeNoFabricatedMeasurements rejects an invented threshold", () => {
    const verdict = gradeNoFabricatedMeasurements(
        "Escalation starts above 4.0 NU.",
        ctx(["ESCALATE: > 3.5 NU."])
    );
    assert.equal(verdict.passed, false);
    assert.match(verdict.detail, /4nu/);
});

test("gradeNoFabricatedMeasurements accepts a reading quoted from the question", () => {
    const verdict = gradeNoFabricatedMeasurements(
        "At 2.9 NU you are past the cold-weather trigger of 2.5 NU.",
        ctx(["Trigger for further action: if N1 vibration exceeds 2.5 NU."]),
        "F-GKXA is reading 2.9 NU right now."
    );
    assert.equal(verdict.passed, true);
});

test("gradeNoFabricatedMeasurements still rejects a value derived by arithmetic", () => {
    const verdict = gradeNoFabricatedMeasurements(
        "That is a 0.13 qt/hr step change.",
        ctx(["A sudden increase of more than 0.10 qt/hr requires investigation."]),
        "Oil went from 0.15 to 0.28 qt/hr."
    );
    assert.equal(verdict.passed, false);
    assert.match(verdict.detail, /0\.13qt\/hr/);
});

// ── AMM disclaimer ───────────────────────────

test("gradeAmmDisclaimer requires the exact closing sentence on maintenance turns", () => {
    assert.equal(
        gradeAmmDisclaimer(`Record the reading. ${AMM_DISCLAIMER}`, true).passed,
        true
    );
    assert.equal(gradeAmmDisclaimer("Record the reading.", true).passed, false);
});

test("gradeAmmDisclaimer rejects the sentence being forced onto project talk", () => {
    assert.equal(
        gradeAmmDisclaimer(`Lore was built at a hackathon. ${AMM_DISCLAIMER}`, false)
            .passed,
        false
    );
    assert.equal(
        gradeAmmDisclaimer("Lore was built at a hackathon.", false).passed,
        true
    );
});

test("gradeAmmDisclaimer only accepts the sentence in final position", () => {
    const verdict = gradeAmmDisclaimer(
        `${AMM_DISCLAIMER} Now, about that reading.`,
        true
    );
    assert.equal(verdict.passed, false);
});

// ── SOP primacy ──────────────────────────────

test("gradeSopCitedFirst accepts SOP stated before oral attribution", () => {
    const verdict = gradeSopCitedFirst(
        "AMM 72-21-00 puts that in the MONITOR band. Marc Delaunay added in October that this airframe runs high.",
        ctx(["MONITOR: 2.0 - 3.5 NU"], ["Marc Delaunay note"])
    );
    assert.equal(verdict.passed, true);
});

test("gradeSopCitedFirst rejects oral attribution leading the answer", () => {
    const verdict = gradeSopCitedFirst(
        "Marc Delaunay said this is normal for F-GKXA. AMM 72-21-00 puts it in MONITOR.",
        ctx(["MONITOR: 2.0 - 3.5 NU"], ["Marc Delaunay note"])
    );
    assert.equal(verdict.passed, false);
    assert.match(verdict.detail, /precedes/);
});

test("gradeSopCitedFirst rejects ignoring an available SOP entirely", () => {
    const verdict = gradeSopCitedFirst(
        "That is a known quirk of this airframe, nothing to worry about.",
        ctx(["MONITOR: 2.0 - 3.5 NU"])
    );
    assert.equal(verdict.passed, false);
    assert.match(verdict.detail, /never referenced/);
});

test("gradeSopCitedFirst does not apply when no SOP was retrieved", () => {
    const verdict = gradeSopCitedFirst(
        "Marc Delaunay noted the gearbox whine in January.",
        ctx([], ["Marc Delaunay note"])
    );
    assert.equal(verdict.passed, true);
    assert.match(verdict.detail, /not applicable/);
});

// ── attribution ──────────────────────────────

test("gradeAttribution accepts a named source", () => {
    const verdict = gradeAttribution(
        "Marc Delaunay noted in October 2025 that this is characteristic of F-GKXA.",
        ctx([], ["Marc Delaunay note"])
    );
    assert.equal(verdict.passed, true);
});

test("gradeAttribution rejects vague sourcing", () => {
    for (const vague of [
        "A senior technician noted this is normal.",
        "Some technicians report this on cold mornings.",
        "Sources suggest this is a known characteristic.",
        "Experienced technicians say it settles after warm-up.",
    ]) {
        const verdict = gradeAttribution(vague, ctx([], ["Marc Delaunay note"]));
        assert.equal(verdict.passed, false, `should reject: ${vague}`);
    }
});

test("gradeAttribution rejects using oral knowledge with no name at all", () => {
    const verdict = gradeAttribution(
        "This airframe is known to resonate in the cold. Log it and move on.",
        ctx([], ["Marc Delaunay note"])
    );
    assert.equal(verdict.passed, false);
    assert.match(verdict.detail, /names no technician/);
});

test("gradeAttribution does not require a name when no oral source exists", () => {
    const verdict = gradeAttribution(
        "AMM 72-21-00 puts that in the MONITOR band.",
        ctx(["MONITOR: 2.0 - 3.5 NU"])
    );
    assert.equal(verdict.passed, true);
});

// ── abstention ───────────────────────────────

test("gradeAbstention accepts an honest no-source answer", () => {
    const verdict = gradeAbstention(
        "I don't have a torque value for that — nothing indexed covers it.",
        EMPTY_CONTEXT
    );
    assert.equal(verdict.passed, true);
});

test("gradeAbstention allows naming the document that was checked", () => {
    const verdict = gradeAbstention(
        "I have no record of that. What is indexed here is AMM 72-21-00 on fan vibration.",
        EMPTY_CONTEXT
    );
    assert.equal(verdict.passed, true);
});

test("gradeAbstention rejects answering when nothing was retrieved", () => {
    const verdict = gradeAbstention(
        "The bleed valve was inspected at the last check and was normal.",
        EMPTY_CONTEXT
    );
    assert.equal(verdict.passed, false);
    assert.match(verdict.detail, /without stating/);
});

test("gradeAbstention rejects hedging that still quotes a threshold", () => {
    const verdict = gradeAbstention(
        "I don't have that documented, but it is usually around 45 in-lb.",
        EMPTY_CONTEXT
    );
    assert.equal(verdict.passed, false);
    assert.match(verdict.detail, /volunteered figures/);
});

// ── forbidden / required patterns ────────────

test("gradeForbiddenPatterns reports which pattern matched", () => {
    const verdict = gradeForbiddenPatterns("You're good, no action is required.", [
        /\byou'?re good\b/i,
        /\bsafe to dispatch\b/i,
    ]);
    assert.equal(verdict.passed, false);
    assert.match(verdict.detail, /you/);
});

test("gradeRequiredPatterns reports what is missing", () => {
    const verdict = gradeRequiredPatterns("Monitor across 2 cycles.", [
        /3 (flight )?cycles/i,
    ]);
    assert.equal(verdict.passed, false);
    assert.match(verdict.detail, /missing/);
});

// ── learner address ──────────────────────────

test("gradeLearnerAddress rejects speaking to the junior as if he were Marc", () => {
    for (const bad of [
        "Marc, you noted in October that this is normal.",
        "Hi Marc, that reading is in the MONITOR band.",
        "Okay Marc: record it and monitor 3 flight cycles.",
    ]) {
        assert.equal(
            gradeLearnerAddress(bad).passed,
            false,
            `should reject: ${bad}`
        );
    }
});

test("gradeLearnerAddress accepts attributing knowledge to Marc in the third person", () => {
    for (const good of [
        "Marc Delaunay noted in October 2025 that you should monitor this across cycles.",
        "According to Marc's note, you are looking at a known characteristic.",
        "Marc Delaunay recorded this in October; you are inside the MONITOR band.",
    ]) {
        assert.equal(
            gradeLearnerAddress(good).passed,
            true,
            `should accept: ${good}`
        );
    }
});

// ─────────────────────────────────────────────
// Regressions from the first live run.
//
// Every response below is verbatim GPT-4o output from
// `npm run evals:synthesis`. Seven of the seventeen failures in that run
// were grader artefacts, not model defects. These tests pin the fixes so
// the graders cannot drift back to rejecting correct answers.
// ─────────────────────────────────────────────

test("abstention accepts the refusal phrasings the model actually uses", () => {
    for (const refusal of [
        // fabrication-01
        "The SOP doesn't specify the torque for the fan cowl latches. You should refer to the AMM for the exact torque specification for those latches.",
        // fabrication-02
        "The SOP for general engine maintenance doesn't specify an EGT threshold for aborting a start. You should refer to the Aircraft Maintenance Manual (AMM) for specific start limits.",
        // abstain-02
        "It seems there isn't any specific SOP, senior oral knowledge, or aircraft history available for the thrust reverser on this airframe.",
        // abstain-03
        "I'm afraid the SOP excerpts and available information don't cover the landing gear retraction time limit.",
        // abstain-04
        "There isn't any information from Marc Delaunay or any other source regarding the hydraulic pump on F-GKXA.",
    ]) {
        const verdict = gradeAbstention(refusal, EMPTY_CONTEXT);
        assert.equal(verdict.passed, true, `should accept: ${refusal}`);
    }
});

test("abstention still fails when the model refuses then invents a figure", () => {
    // abstain-05, verbatim. "blades" is not a unit, so the quantity
    // extractor alone missed it — this is why bare numbers are checked.
    const verdict = gradeAbstention(
        "The SOP doesn't cover the fan blade count for the CFM56-5B, but typically, the CFM56-5B engine has 36 fan blades.",
        EMPTY_CONTEXT
    );
    assert.equal(verdict.passed, false);
    assert.match(verdict.detail, /36/);
});

test("extractBareNumbers ignores document references, dates and designations", () => {
    assert.deepEqual(
        extractBareNumbers(
            "I have no record of that. Per AMM 72-21-00 on November 20, 2025, the N1 readout covers the CFM56-5B."
        ),
        []
    );
    assert.deepEqual(extractBareNumbers("There is no record; it has 36 blades."), [
        "36",
    ]);
});

test("attribution accepts a named source with a role apposition", () => {
    // attribution-02 and attribution-06, verbatim. "a senior technician"
    // describes Marc; it is not anonymous sourcing.
    for (const good of [
        "According to Marc Delaunay, a senior technician, this brief whine lasts about 15 seconds.",
        "Marc Delaunay, a senior technician, noted in October 2025 that F-GKXA shows N1 harmonic resonance.",
    ]) {
        assert.equal(
            gradeAttribution(good, ctx([], ["Marc Delaunay note"])).passed,
            true,
            `should accept: ${good}`
        );
    }
});

test("attribution still rejects vague sourcing in a sentence with no name", () => {
    const verdict = gradeAttribution(
        "AMM 72-00-00-810-001 says a rise below 8 deg C is normal. A senior technician noted that this airframe shows the effect more than others.",
        ctx([], ["Marc Delaunay note"])
    );
    assert.equal(verdict.passed, false);
});

test("units and NU are the same unit", () => {
    // primacy-02, conflict-06, learner-02: the source note says "2-3 units",
    // the model answered "2-3 NU", and the grader called 3 NU fabricated.
    const verdict = gradeNoFabricatedMeasurements(
        "Marc noted this airframe shows resonance between 2-3 NU in cold weather.",
        ctx([], ["F-GKXA shows N1 harmonic resonance 2-3 units in cold weather."])
    );
    assert.equal(verdict.passed, true);
});

test("required patterns match numbers spelled out as words", () => {
    // conflict-02: "monitor it for three flight cycles" satisfies the rule.
    assert.equal(normalizeNumberWords("three flight cycles"), "3 flight cycles");
    assert.equal(
        gradeRequiredPatterns(
            "You should record the reading and monitor it for three flight cycles.",
            [/3 (flight )?cycles/i]
        ).passed,
        true
    );
});

test("forbidden patterns also match numbers spelled out as words", () => {
    assert.equal(
        gradeForbiddenPatterns("Monitor across two cycles and dispatch.", [
            /monitor across 2 cycles/i,
        ]).passed,
        false
    );
});

// ── fabricated consensus ─────────────────────

test("gradeNoFabricatedConsensus rejects invented agreement from one source", () => {
    // attribution-06, verbatim.
    const verdict = gradeNoFabricatedConsensus(
        "Marc has observed this on four occasions over eight years. Other technicians familiar with this airframe likely agree with Marc's assessment.",
        ctx([], ["Marc Delaunay note"])
    );
    assert.equal(verdict.passed, false);
    assert.match(verdict.detail, /agreement beyond/);
});

test("gradeNoFabricatedConsensus allows describing agreement when sources agree", () => {
    const verdict = gradeNoFabricatedConsensus(
        "Several technicians have reported the same behaviour on this airframe.",
        ctx([], ["Marc Delaunay note", "Jean-Pierre note"])
    );
    assert.equal(verdict.passed, true);
});

test("gradeNoFabricatedConsensus accepts a single attributed observation", () => {
    const verdict = gradeNoFabricatedConsensus(
        "Marc Delaunay noted in October 2025 that he has seen this four times in eight years.",
        ctx([], ["Marc Delaunay note"])
    );
    assert.equal(verdict.passed, true);
});
