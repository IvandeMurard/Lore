// ─────────────────────────────────────────────
// Band edges, tested at the edge.
//
// The whole point of lib/bands.ts is that a boundary is arithmetic, not a
// judgement call, so every test here probes a boundary rather than a
// comfortable middle value.
// ─────────────────────────────────────────────

import assert from "node:assert/strict";
import test from "node:test";

import {
    buildClassificationBlock,
    classify,
    classifyReadings,
    findTableDefects,
    N1_VIBRATION,
    OIL_CONSUMPTION,
} from "../lib/bands";

// ── structural ──
// This is the check that would have caught the false claim in the eval case
// set that the oil bands "overlap at the edge". A statement about edges
// should be verifiable by machine, not asserted by its author.

test("no band table has a gap or an overlap anywhere near an edge", () => {
    for (const table of [N1_VIBRATION, OIL_CONSUMPTION]) {
        assert.deepEqual(
            findTableDefects(table),
            [],
            `${table.reference} table is not a clean partition`
        );
    }
});

// ── N1 vibration, AMM 72-21-00 ──

test("N1 vibration edges land on the stricter band", () => {
    assert.equal(classify(N1_VIBRATION, 1.99)?.name, "NORMAL");
    // NORMAL is "< 2.0", so exactly 2.0 is not NORMAL.
    assert.equal(classify(N1_VIBRATION, 2.0)?.name, "MONITOR");
    assert.equal(classify(N1_VIBRATION, 2.6)?.name, "MONITOR");
    // MONITOR is "2.0 - 3.5" inclusive, so exactly 3.5 is still MONITOR.
    assert.equal(classify(N1_VIBRATION, 3.5)?.name, "MONITOR");
    assert.equal(classify(N1_VIBRATION, 3.51)?.name, "ESCALATE");
    assert.equal(classify(N1_VIBRATION, 3.9)?.name, "ESCALATE");
});

test("MONITOR carries the AMM's three-cycle interval, not a shortened one", () => {
    // source-conflict-01 relayed an expert's earlier escalation and quietly
    // turned 3 flight cycles into "the next flight cycle".
    assert.match(classify(N1_VIBRATION, 2.6)?.action ?? "", /3 flight cycles/);
});

// ── Oil consumption, AMM 72-53-00 ──

test("oil consumption edges land on the stricter band", () => {
    assert.equal(classify(OIL_CONSUMPTION, 0.29)?.name, "NORMAL");
    // The defect this file exists for: "< 0.30" excludes 0.30.
    assert.equal(classify(OIL_CONSUMPTION, 0.3)?.name, "ELEVATED");
    assert.equal(classify(OIL_CONSUMPTION, 0.35)?.name, "ELEVATED");
    assert.equal(classify(OIL_CONSUMPTION, 0.5)?.name, "ELEVATED");
    assert.equal(classify(OIL_CONSUMPTION, 0.51)?.name, "EXCESSIVE");
});

test("exactly 0.30 qt/hr does not carry a no-action instruction", () => {
    const band = classify(OIL_CONSUMPTION, 0.3);
    assert.equal(band?.name, "ELEVATED");
    assert.doesNotMatch(band?.action ?? "", /no action/i);
    assert.match(band?.action ?? "", /every flight|leak/i);
});

// ── reading extraction ──

test("classifyReadings picks up NU, bare units and qt/hr", () => {
    assert.deepEqual(
        classifyReadings("reading 2.4 NU").map((r) => r.band?.name),
        ["MONITOR"]
    );
    // marc-knowledge.json says "units" where the AMM says NU.
    assert.deepEqual(
        classifyReadings("about 3 units on the shaft").map((r) => r.band?.name),
        ["MONITOR"]
    );
    assert.deepEqual(
        classifyReadings("oil at 0.55 qt/hr").map((r) => r.band?.name),
        ["EXCESSIVE"]
    );
});

test("classifyReadings ignores numbers with no mapped unit", () => {
    assert.deepEqual(classifyReadings("it is 6 degrees out and 2am"), []);
});

test("classifyReadings handles several readings and de-duplicates", () => {
    const names = classifyReadings(
        "1.8 NU yesterday, 2.4 NU today, 2.4 NU again, oil 0.3 qt/hr"
    ).map((r) => r.band?.name);
    assert.deepEqual(names, ["NORMAL", "MONITOR", "ELEVATED"]);
});

// ── the block handed to the model ──

test("buildClassificationBlock states the band, the notation and the action", () => {
    const block = buildClassificationBlock("Oil sitting exactly at 0.30 qt/hr.");
    assert.match(block, /ELEVATED/);
    assert.match(block, /0\.30 - 0\.50 qt\/hr/);
    assert.match(block, /every flight/);
    assert.match(block, /do not re-derive/i);
});

test("buildClassificationBlock carries the conditional rules that override the band", () => {
    // The first version stated a band and nothing else, and two passing cases
    // began to fail: a confident MONITOR at 2.9 NU buried the 2.5 NU
    // cold-weather trigger, and a confident NORMAL at 0.28 qt/hr buried the
    // 0.10 qt/hr step-change rule.
    const vibration = buildClassificationBlock("Reading 2.9 NU on the N1 shaft.");
    assert.match(vibration, /2\.5 NU/);
    assert.match(vibration, /cold/i);
    assert.match(vibration, /override/i);

    const oil = buildClassificationBlock("Oil at 0.28 qt/hr.");
    assert.match(oil, /0\.10 qt\/hr/);
    assert.match(oil, /baseline/i);
});

test("buildClassificationBlock does not present the band as the final answer", () => {
    const block = buildClassificationBlock("Reading 2.4 NU.");
    assert.match(block, /the answer is not/i);
    assert.match(block, /condition wins over the band/i);
});

test("buildClassificationBlock is empty when there is no reading to classify", () => {
    assert.equal(buildClassificationBlock("What is the torque on the cowl latches?"), "");
});
