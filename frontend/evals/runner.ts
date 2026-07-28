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

import { CASES, CATEGORIES, type EvalCase } from "./cases";
import {
    gradeAbstention,
    gradeAmmDisclaimer,
    gradeAttribution,
    gradeForbiddenPatterns,
    gradeLearnerAddress,
    gradeNoFabricatedMeasurements,
    gradeRequiredPatterns,
    gradeSopCitedFirst,
    type GraderVerdict,
} from "./graders";
import { REGRESSIONS } from "./fixtures/regressions";
import { resolveTarget, type EvalTarget } from "./targets";

type Options = {
    target: string;
    baseUrl: string;
    category?: string;
    caseId?: string;
    verbose: boolean;
};

function parseArgs(argv: string[]): Options {
    const opts: Options = {
        target: "golden",
        baseUrl: process.env.LORE_EVAL_BASE_URL ?? "http://localhost:3000",
        verbose: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => argv[(i += 1)];

        if (arg === "--target") opts.target = next();
        else if (arg === "--base-url") opts.baseUrl = next();
        else if (arg === "--category") opts.category = next();
        else if (arg === "--case") opts.caseId = next();
        else if (arg === "--verbose" || arg === "-v") opts.verbose = true;
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

    // Always checked: cheap, and the failure is embarrassing in a demo.
    verdicts.push(gradeLearnerAddress(response));

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
            continue;
        }

        const verdicts = gradeResponse(evalCase, response);
        const broken = verdicts.filter((v) => !v.passed);
        const ok = broken.length === 0;

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

    return failed;
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
        process.exit(missed > 0 ? 1 : 0);
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

    const failed = await runCases(target, opts);

    console.log("");
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error("\n[evals] Runner failed:", error instanceof Error ? error.message : error);
    process.exit(1);
});
