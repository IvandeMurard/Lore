#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────
// LORE — Eval coverage gate
//
// The mechanism that stops evals rotting while the product moves. It asks
// two questions of a change:
//
//   1. Did you touch something that governs model behaviour without
//      touching the case set?
//   2. Does every category still have at least one reference answer?
//
// Neither is about whether the code works. Both are about whether the
// next person can still tell.
//
// Modelled on scripts/ci/check_eval_coverage.py in
// aetherix-hospitality-ai, including its exit-code contract and its
// 0.80 / 0.60 coverage thresholds.
//
//   npx tsx scripts/ci/check-eval-coverage.ts --base-ref origin/main
//   npx tsx scripts/ci/check-eval-coverage.ts --md-out report.md
// ─────────────────────────────────────────────

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import { CASES } from "../../frontend/evals/cases";
import { GOLDEN_RESPONSES } from "../../frontend/evals/fixtures/golden";

const PASS = 0;
const FAIL = 1;
const ERROR = 2;
const WARN = 3;

const COVERAGE_PASS = 0.8;
const COVERAGE_FAIL = 0.6;

/**
 * Changing any of these can change what a technician hears. Order does not
 * matter; a prefix match is enough.
 */
const TRIGGER_PATHS = [
    "frontend/lib/prompts.ts",
    "frontend/lib/llm.ts",
    "frontend/lib/safety.ts",
    "frontend/lib/backboard.ts",
    "frontend/lib/capture-sop.ts",
    "frontend/app/api/query/",
    "frontend/app/api/capture/",
    "frontend/app/api/orchestrate/",
    "frontend/app/api/log/",
    "scripts/setup-backboard.mjs",
    "docs/sops/",
    "data/",
];

/** Touching any of these counts as having updated the evals. */
const EVAL_PATHS = [
    "frontend/evals/cases.ts",
    "frontend/evals/fixtures/",
    "frontend/evals/graders.ts",
    "frontend/evals/ACCEPTANCE.md",
    "frontend/evals/baselines/",
];

type Args = { baseRef: string; mdOut?: string };

function parseArgs(argv: string[]): Args {
    const args: Args = { baseRef: "origin/main" };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === "--base-ref") args.baseRef = argv[i + 1] ?? args.baseRef;
        else if (argv[i] === "--md-out") args.mdOut = argv[i + 1];
    }
    return args;
}

function changedFiles(baseRef: string): string[] {
    const out = execFileSync(
        "git",
        ["diff", "--name-only", `${baseRef}...HEAD`],
        { encoding: "utf8" }
    );
    return out
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}

function matching(files: string[], prefixes: string[]): string[] {
    return files.filter((file) => prefixes.some((p) => file.startsWith(p)));
}

/** A category is covered when at least one of its cases has a reference answer. */
function categoryCoverage() {
    const categories = [...new Set(CASES.map((c) => c.category))].sort();
    const covered = categories.filter((category) =>
        CASES.some((c) => c.category === category && c.id in GOLDEN_RESPONSES)
    );
    const uncovered = categories.filter((c) => !covered.includes(c));

    return {
        categories,
        covered,
        uncovered,
        rate: categories.length === 0 ? 1 : covered.length / categories.length,
    };
}

function main(): number {
    const args = parseArgs(process.argv.slice(2));

    let files: string[];
    try {
        files = changedFiles(args.baseRef);
    } catch (error) {
        console.error(
            `[eval-coverage] Cannot diff against ${args.baseRef}: ${error instanceof Error ? error.message : error}`
        );
        return ERROR;
    }

    const touchedTriggers = matching(files, TRIGGER_PATHS);
    const touchedEvals = matching(files, EVAL_PATHS);
    const coverage = categoryCoverage();

    const reasons: string[] = [];
    let code: number = PASS;

    // ── 1. touched-but-not-evaluated ──
    if (touchedTriggers.length > 0 && touchedEvals.length === 0) {
        reasons.push(
            `Changed ${touchedTriggers.length} path(s) that govern model behaviour without touching the case set.`
        );
        code = WARN;
    }

    // ── 2. category coverage ──
    if (coverage.rate < COVERAGE_FAIL) {
        reasons.push(
            `Category coverage ${(coverage.rate * 100).toFixed(0)}% is below the ${COVERAGE_FAIL * 100}% floor.`
        );
        code = FAIL;
    } else if (coverage.rate < COVERAGE_PASS) {
        reasons.push(
            `Category coverage ${(coverage.rate * 100).toFixed(0)}% is under the ${COVERAGE_PASS * 100}% target.`
        );
        if (code !== FAIL) code = WARN;
    }

    const label = code === PASS ? "PASS" : code === FAIL ? "FAIL" : "WARN";

    const lines: string[] = [
        "## Eval coverage gate",
        "",
        `**${label}** — ${CASES.length} cases, ${coverage.categories.length} categories, ${Object.keys(GOLDEN_RESPONSES).length} reference answers.`,
        "",
        `- Category coverage: **${(coverage.rate * 100).toFixed(0)}%** (${coverage.covered.length}/${coverage.categories.length}) · target ${COVERAGE_PASS * 100}%, floor ${COVERAGE_FAIL * 100}%`,
        `- Behaviour-governing paths changed: ${touchedTriggers.length}`,
        `- Eval paths changed: ${touchedEvals.length}`,
    ];

    if (coverage.uncovered.length > 0) {
        lines.push(
            `- Categories with no reference answer: ${coverage.uncovered.map((c) => `\`${c}\``).join(", ")}`
        );
    }
    if (touchedTriggers.length > 0) {
        lines.push("", "<details><summary>Paths that triggered the gate</summary>", "");
        for (const file of touchedTriggers) lines.push(`- \`${file}\``);
        lines.push("</details>");
    }
    if (reasons.length > 0) {
        lines.push("", "### Why", "");
        for (const reason of reasons) lines.push(`- ${reason}`);
    }

    const report = `${lines.join("\n")}\n`;
    console.log(report);

    if (args.mdOut) {
        writeFileSync(args.mdOut, report, "utf8");
    }

    return code;
}

process.exit(main());
