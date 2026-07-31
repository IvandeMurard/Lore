// ─────────────────────────────────────────────
// LORE — Eval runner
//
//   npx tsx evals/runner.ts                        # golden (offline, free)
//   npx tsx evals/runner.ts --target regression    # known-bad must be caught
//   npx tsx evals/runner.ts --target synthesis     # live, costs tokens
//   npx tsx evals/runner.ts --target http --base-url http://localhost:3000
//   npx tsx evals/runner.ts --category sop-conflict
//   npx tsx evals/runner.ts --case conflict-01 --verbose
//
// Exit code 1 on any failure, so this can gate a commit or CI.
// ─────────────────────────────────────────────

import {
    evaluateAcceptance,
    ERROR as ERROR_CODE,
    FAIL as FAIL_CODE,
    MAX_REGRESSION_PP,
    tierOf,
    WARN as WARN_CODE,
    type CheckedVerdict,
} from "./acceptance";
import {
    buildBaseline,
    compareToBaseline,
    readBaseline,
    writeBaseline,
} from "./baseline";
import { CASES, CATEGORIES, type EvalCase } from "./cases";
import {
    gradeAbstention,
    gradeAmmDisclaimer,
    gradeAttribution,
    gradeBandClassification,
    gradeForbiddenPatterns,
    gradeLearnerAddress,
    gradeNoFabricatedConsensus,
    gradeNoFabricatedMeasurements,
    gradeRequiredPatterns,
    gradeSopCitedFirst,
    type GraderVerdict,
} from "./graders";
import { REGRESSIONS } from "./fixtures/regressions";
import { EVAL_TEMPERATURE, resolveTarget, type EvalTarget } from "./targets";

type Options = {
    target: string;
    baseUrl: string;
    category?: string;
    caseId?: string;
    verbose: boolean;
    freeze: boolean;
};

function parseArgs(argv: string[]): Options {
    const opts: Options = {
        target: "golden",
        baseUrl: process.env.LORE_EVAL_BASE_URL ?? "http://localhost:3000",
        verbose: false,
        freeze: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => argv[(i += 1)];

        if (arg === "--target") opts.target = next();
        else if (arg === "--base-url") opts.baseUrl = next();
        else if (arg === "--category") opts.category = next();
        else if (arg === "--case") opts.caseId = next();
        else if (arg === "--verbose" || arg === "-v") opts.verbose = true;
        else if (arg === "--freeze") opts.freeze = true;
        else if (arg.startsWith("--target=")) opts.target = arg.slice(9);
        else if (arg.startsWith("--category=")) opts.category = arg.slice(11);
        else if (arg.startsWith("--case=")) opts.caseId = arg.slice(7);
        else if (arg.startsWith("--base-url=")) opts.baseUrl = arg.slice(11);
        else throw new Error(`Unrecognised argument: ${arg}`);
    }

    return opts;
}

/**
 * Run every grader the case asks for. The case decides which
 * properties apply; the graders decide whether they hold.
 */
export function gradeResponse(
    evalCase: EvalCase,
    response: string
): GraderVerdict[] {
    const { expect, context, question } = evalCase;
    const verdicts: GraderVerdict[] = [
        gradeAmmDisclaimer(response, expect.disclaimer),
    ];

    if (expect.noFabrication) {
        verdicts.push(
            gradeNoFabricatedMeasurements(response, context, question)
        );
    }
    if (expect.abstain) {
        verdicts.push(gradeAbstention(response, context));
    }
    // SOP primacy is meaningless on an abstention: there is nothing to
    // order when the honest answer is "no source covers this".
    if (expect.sopFirst && !expect.abstain) {
        verdicts.push(gradeSopCitedFirst(response, context));
    }
    if (expect.attribution) {
        verdicts.push(gradeAttribution(response, context));
    }
    if (expect.forbidden?.length) {
        verdicts.push(gradeForbiddenPatterns(response, expect.forbidden));
    }
    if (expect.required?.length) {
        verdicts.push(gradeRequiredPatterns(response, expect.required));
    }

    // Always checked: cheap, and both failures are severe out of proportion
    // to the cost of looking for them.
    verdicts.push(gradeLearnerAddress(response));
    verdicts.push(gradeNoFabricatedConsensus(response, context));
    // Has an oracle behind it, so it applies wherever the question carries a
    // classifiable reading — no per-case opt-in.
    verdicts.push(gradeBandClassification(response, question));

    return verdicts;
}

/**
 * Live targets read credentials from frontend/.env.local, the same file
 * `next dev` uses. Loaded lazily so the offline run stays dependency-free.
 */
async function loadEnvForLiveTarget(): Promise<void> {
    try {
        const { config } = await import("dotenv");
        const { fileURLToPath } = await import("node:url");
        // fileURLToPath, not URL.pathname — the latter yields "/C:/..." on Windows.
        config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)) });
        config({ path: fileURLToPath(new URL("../../.env.local", import.meta.url)) });
    } catch {
        console.log(
            "  note: dotenv not installed — reading credentials from the shell environment only."
        );
    }
}

const PASS = "PASS";
const FAIL = "FAIL";

function pad(text: string, width: number): string {
    return text.length >= width ? text : text + " ".repeat(width - text.length);
}

// ─────────────────────────────────────────────
// Golden / live run
// ─────────────────────────────────────────────

async function runCases(target: EvalTarget, opts: Options): Promise<number> {
    const checks: CheckedVerdict[] = [];
    const caseOutcomes = new Map<string, boolean>();
    let selected = CASES;
    if (opts.category) {
        selected = selected.filter((c) => c.category === opts.category);
    }
    if (opts.caseId) {
        selected = selected.filter((c) => c.id === opts.caseId);
    }

    const supported = selected.filter((c) => target.supports(c));
    const skipped = selected.length - supported.length;

    console.log(`\nLore evals — target: ${target.name}`);
    console.log(`  ${target.describe}`);
    console.log(
        `  ${supported.length} case(s) to run` +
            (skipped > 0 ? `, ${skipped} skipped (no fixture)` : "")
    );
    if (target.live) {
        console.log("  live target: this will make real API calls.");
    }
    console.log("");

    const byCategory = new Map<string, { pass: number; fail: number }>();
    let failed = 0;
    const failures: string[] = [];

    for (const evalCase of supported) {
        let response: string;
        try {
            response = await target.run(evalCase);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(`${FAIL}  ${pad(evalCase.id, 16)} target error: ${message}`);
            failed += 1;
            const tally = byCategory.get(evalCase.category) ?? { pass: 0, fail: 0 };
            tally.fail += 1;
            byCategory.set(evalCase.category, tally);
            caseOutcomes.set(evalCase.id, false);
            continue;
        }

        const verdicts = gradeResponse(evalCase, response);
        for (const verdict of verdicts) {
            checks.push({
                grader: verdict.grader,
                passed: verdict.passed,
                caseId: evalCase.id,
            });
        }

        const broken = verdicts.filter((v) => !v.passed);
        const ok = broken.length === 0;
        caseOutcomes.set(evalCase.id, ok);

        const tally = byCategory.get(evalCase.category) ?? { pass: 0, fail: 0 };
        if (ok) tally.pass += 1;
        else tally.fail += 1;
        byCategory.set(evalCase.category, tally);

        console.log(
            `${ok ? PASS : FAIL}  ${pad(evalCase.id, 16)} ${pad(evalCase.category, 17)} ${verdicts.length} grader(s)`
        );

        if (!ok) {
            failed += 1;
            failures.push(evalCase.id);
            for (const verdict of broken) {
                console.log(`        ↳ ${verdict.grader}: ${verdict.detail}`);
            }
            if (evalCase.note) {
                console.log(`        ↳ case note: ${evalCase.note}`);
            }
            console.log(`        ↳ response: ${response.replace(/\s+/g, " ").trim()}`);
        } else if (opts.verbose) {
            for (const verdict of verdicts) {
                console.log(`        ✓ ${verdict.grader}: ${verdict.detail}`);
            }
            // Passing responses are printed too. A green case only proves the
            // patterns were satisfied, and reading the answer is the only way
            // to tell a case that holds from a case that is too easy.
            console.log(
                `        ↳ response: ${response.replace(/\s+/g, " ").trim()}`
            );
        }
    }

    console.log("\n  by category");
    for (const category of CATEGORIES) {
        const tally = byCategory.get(category);
        if (!tally) continue;
        const total = tally.pass + tally.fail;
        console.log(
            `    ${pad(category, 18)} ${tally.pass}/${total}` +
                (tally.fail > 0 ? `  (${tally.fail} failing)` : "")
        );
    }

    console.log(
        `\n  ${supported.length - failed}/${supported.length} cases passed` +
            (failures.length ? `\n  failing: ${failures.join(", ")}` : "")
    );

    // ── Acceptance criteria ──
    // The pass rate above is a measurement. This is the decision.
    const verdict = evaluateAcceptance(checks);

    console.log("\n  acceptance criteria (evals/ACCEPTANCE.md)");
    for (const result of verdict.tiers) {
        if (result.checked === 0) continue;
        const rate = (result.rate * 100).toFixed(1);
        const required = (result.spec.threshold * 100).toFixed(0);
        console.log(
            `    tier ${result.spec.tier} ${pad(result.spec.name, 8)} ${result.held}/${result.checked} checks  ${pad(`${rate}%`, 7)} (need ${required}%)  ${result.meetsThreshold ? "ok" : "BELOW"}`
        );
        if (result.failures.length > 0) {
            console.log(`             ↳ ${result.failures.join(", ")}`);
        }
    }

    // ── Baseline ──
    // Absolute thresholds catch a collapse; the baseline catches erosion.
    let regressed = false;
    /** Erosion worth reporting but not worth blocking on. */
    let softRegression = false;

    if (opts.freeze) {
        const path = writeBaseline(
            buildBaseline({
                target: target.name,
                temperature: target.live ? EVAL_TEMPERATURE : null,
                tiers: verdict.tiers,
                caseOutcomes,
                note: "Freeze only after three unchanged runs at 0.00pp variance — see ACCEPTANCE.md.",
            })
        );
        console.log(`\n  baseline frozen → ${path}`);
    } else {
        const baseline = readBaseline(target.name);
        if (!baseline) {
            console.log(
                `\n  no baseline for "${target.name}" — the ${MAX_REGRESSION_PP}pp regression rule is inert.`
            );
            console.log("  Freeze one with --freeze once three runs agree.");
        } else {
            const diff = compareToBaseline(baseline, {
                tiers: verdict.tiers,
                caseOutcomes,
            });

            console.log(
                `\n  vs baseline ${baseline.recordedAt} (${baseline.casesPassed}/${baseline.casesTotal})`
            );

            for (const regression of diff.regressions) {
                console.log(`    REGRESSION  ${regression}`);
                regressed = true;
            }
            if (diff.newlyFailing.length > 0) {
                // Severity follows the tier of what actually broke. A case
                // that flips on form-tier phrasing is the observed run-to-run
                // noise (see ACCEPTANCE.md canary); a case that flips on a
                // safety grader is not, because tier 1 is guarded by code and
                // has held at 100% across every canary run.
                const safetyBreaches = diff.newlyFailing.filter((caseId) =>
                    checks.some(
                        (c) =>
                            c.caseId === caseId &&
                            !c.passed &&
                            tierOf(c.grader) === 1
                    )
                );

                if (safetyBreaches.length > 0) {
                    console.log(
                        `    REGRESSION  newly failing on a safety grader: ${safetyBreaches.join(", ")}`
                    );
                    regressed = true;
                }

                const softer = diff.newlyFailing.filter(
                    (caseId) => !safetyBreaches.includes(caseId)
                );
                if (softer.length > 0) {
                    console.log(
                        `    newly failing on trust/form only: ${softer.join(", ")} — noise until it reproduces, diagnose before fixing`
                    );
                    softRegression = true;
                }
            }
            if (diff.newlyPassing.length > 0) {
                console.log(`    improved: ${diff.newlyPassing.join(", ")}`);
            }
            for (const note of diff.driftNotes) {
                console.log(`    drift: ${note}`);
            }
            if (!regressed && !softRegression && diff.driftNotes.length === 0) {
                console.log("    no regression against baseline");
            }
        }
    }

    const label = regressed && verdict.label === "PASS" ? "FAIL" : verdict.label;
    console.log(`\n  VERDICT: ${label}`);
    for (const reason of verdict.reasons) {
        console.log(`    ${reason}`);
    }
    if (regressed) {
        console.log("    regressed against the frozen baseline");
    }

    if (!target.live && skipped > 0) {
        console.log(
            `\n  Note: ${skipped} case(s) have no reference answer yet. A green golden`
        );
        console.log(
            "  run means the graders accept known-good answers — it says nothing"
        );
        console.log(
            "  about model behaviour. Use --target synthesis or --target http for that."
        );
    }

    // Exit codes are the CI contract (ACCEPTANCE.md): 0 PASS, 1 FAIL,
    // 2 ERROR, 3 WARN. A tier-1 breach or a baseline regression is fatal
    // even when the raw pass count looks acceptable; a tier-2/3 miss inside
    // its budget warns without blocking.
    if (failed > 0 || verdict.code === FAIL_CODE || regressed) return FAIL_CODE;
    if (softRegression) return WARN_CODE;
    return verdict.code;
}

// ─────────────────────────────────────────────
// Regression run: every known-bad response must be caught,
// by the specific grader that owns that failure mode.
// ─────────────────────────────────────────────

async function runRegressions(): Promise<number> {
    console.log("\nLore evals — target: regression");
    console.log("  known-bad responses that must be rejected (offline, free)");
    console.log(`  ${REGRESSIONS.length} case(s) to run\n`);

    let missed = 0;

    for (const regression of REGRESSIONS) {
        const evalCase = CASES.find((c) => c.id === regression.caseId);
        if (!evalCase) {
            console.log(
                `${FAIL}  ${pad(regression.caseId, 16)} no such case in cases.ts`
            );
            missed += 1;
            continue;
        }

        const verdicts = gradeResponse(evalCase, regression.response);
        const owner = verdicts.find((v) => v.grader === regression.mustBeCaughtBy);

        if (!owner) {
            console.log(
                `${FAIL}  ${pad(regression.caseId, 16)} grader "${regression.mustBeCaughtBy}" did not run for this case`
            );
            missed += 1;
            continue;
        }

        if (owner.passed) {
            console.log(
                `${FAIL}  ${pad(regression.caseId, 16)} ${regression.mustBeCaughtBy} did NOT catch it`
            );
            console.log(`        ↳ why it matters: ${regression.why}`);
            console.log(
                `        ↳ response: ${regression.response.replace(/\s+/g, " ").trim()}`
            );
            missed += 1;
        } else {
            console.log(
                `${PASS}  ${pad(regression.caseId, 16)} caught by ${regression.mustBeCaughtBy}: ${owner.detail}`
            );
        }
    }

    console.log(
        `\n  ${REGRESSIONS.length - missed}/${REGRESSIONS.length} known failures caught`
    );
    return missed;
}

// ─────────────────────────────────────────────

async function main() {
    const opts = parseArgs(process.argv.slice(2));

    if (opts.target === "regression") {
        const missed = await runRegressions();
        console.log("");
        process.exit(missed > 0 ? FAIL_CODE : 0);
    }

    const target = resolveTarget(opts.target, opts.baseUrl);

    if (target.live) {
        await loadEnvForLiveTarget();

        if (target.name === "synthesis" && !process.env.OPENAI_API_KEY) {
            throw new Error(
                "OPENAI_API_KEY is not set. Put it in frontend/.env.local (see frontend/.env.example)."
            );
        }
    }

    const code = await runCases(target, opts);

    console.log("");
    process.exit(code);
}

main().catch((error) => {
    console.error(
        "\n[evals] Runner failed:",
        error instanceof Error ? error.message : error
    );
    // ERROR, not FAIL: no measurement was taken, which is a different thing
    // from a measurement that came back bad. CI must not read a crash as a
    // quality signal in either direction.
    process.exit(ERROR_CODE);
});
