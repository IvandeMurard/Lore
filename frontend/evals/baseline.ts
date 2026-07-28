// ─────────────────────────────────────────────
// LORE — Frozen baselines
//
// Absolute thresholds catch a collapse. They do not catch erosion: a
// prompt change that takes a tier from 100% to 96% is still above its
// floor and has still broken something. The baseline is what makes the
// 3-percentage-point regression rule in ACCEPTANCE.md enforceable.
//
// A baseline is only meaningful if the measurement is stable. Freeze one
// only after the same target has run unchanged three times with 0.00pp
// variance — the canary described in ACCEPTANCE.md.
// ─────────────────────────────────────────────

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_REGRESSION_PP, type TierResult } from "./acceptance";

export type Baseline = {
    target: string;
    recordedAt: string;
    /** Null for offline targets, which have no sampling temperature. */
    temperature: number | null;
    casesPassed: number;
    casesTotal: number;
    /** Tier number to fraction held, e.g. { "1": 1, "2": 1, "3": 1 }. */
    tierRates: Record<string, number>;
    /** Per-case outcome, so a swap of one failure for another is visible. */
    cases: Record<string, boolean>;
    note?: string;
};

const BASELINE_DIR = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "baselines"
);

export function baselinePath(target: string): string {
    return resolve(BASELINE_DIR, `${target}.json`);
}

export function readBaseline(target: string): Baseline | null {
    try {
        return JSON.parse(readFileSync(baselinePath(target), "utf8")) as Baseline;
    } catch {
        return null;
    }
}

export function writeBaseline(baseline: Baseline): string {
    mkdirSync(BASELINE_DIR, { recursive: true });
    const path = baselinePath(baseline.target);
    writeFileSync(path, `${JSON.stringify(baseline, null, 4)}\n`, "utf8");
    return path;
}

export function buildBaseline(input: {
    target: string;
    temperature: number | null;
    tiers: TierResult[];
    caseOutcomes: Map<string, boolean>;
    note?: string;
}): Baseline {
    const outcomes = [...input.caseOutcomes.entries()].sort(([a], [b]) =>
        a.localeCompare(b)
    );

    return {
        target: input.target,
        recordedAt: new Date().toISOString().slice(0, 10),
        temperature: input.temperature,
        casesPassed: outcomes.filter(([, passed]) => passed).length,
        casesTotal: outcomes.length,
        tierRates: Object.fromEntries(
            input.tiers
                .filter((t) => t.checked > 0)
                .map((t) => [String(t.spec.tier), t.rate])
        ),
        cases: Object.fromEntries(outcomes),
        note: input.note,
    };
}

export type BaselineComparison = {
    /** Tier drops beyond MAX_REGRESSION_PP — hard failures. */
    regressions: string[];
    /** Cases that held at baseline and fail now, whatever the tier maths say. */
    newlyFailing: string[];
    /** Cases that failed at baseline and hold now. */
    newlyPassing: string[];
    /** Baseline cases absent from this run, and vice versa. */
    driftNotes: string[];
};

export function compareToBaseline(
    baseline: Baseline,
    current: { tiers: TierResult[]; caseOutcomes: Map<string, boolean> }
): BaselineComparison {
    const regressions: string[] = [];

    for (const tier of current.tiers) {
        if (tier.checked === 0) continue;

        const was = baseline.tierRates[String(tier.spec.tier)];
        if (was === undefined) continue;

        const dropPp = (was - tier.rate) * 100;
        if (dropPp > MAX_REGRESSION_PP) {
            regressions.push(
                `tier ${tier.spec.tier} (${tier.spec.name}) dropped ${dropPp.toFixed(1)}pp: ${(was * 100).toFixed(1)}% → ${(tier.rate * 100).toFixed(1)}% (max ${MAX_REGRESSION_PP}pp)`
            );
        }
    }

    const newlyFailing: string[] = [];
    const newlyPassing: string[] = [];
    const driftNotes: string[] = [];

    for (const [id, passed] of current.caseOutcomes) {
        const was = baseline.cases[id];
        if (was === undefined) {
            driftNotes.push(`${id} is new since the baseline`);
            continue;
        }
        if (was && !passed) newlyFailing.push(id);
        if (!was && passed) newlyPassing.push(id);
    }

    for (const id of Object.keys(baseline.cases)) {
        if (!current.caseOutcomes.has(id)) {
            driftNotes.push(`${id} was in the baseline but did not run`);
        }
    }

    return { regressions, newlyFailing, newlyPassing, driftNotes };
}
