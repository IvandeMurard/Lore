// ─────────────────────────────────────────────
// LORE — Eval targets
//
// A target turns a case into a response string. Swapping targets is
// how the same case set grades a hand-written specification, a prompt
// in isolation, or the real deployed path.
//
// The offline targets deliberately import nothing outside this folder
// and ../lib/safety, so `npm run test:evals` runs with no API keys and
// no frontend dependencies installed.
// ─────────────────────────────────────────────

import type { EvalCase } from "./cases";
import { GOLDEN_RESPONSES } from "./fixtures/golden";

export type EvalTarget = {
    name: string;
    describe: string;
    /** Live targets cost money and need credentials. */
    live: boolean;
    supports(evalCase: EvalCase): boolean;
    run(evalCase: EvalCase): Promise<string>;
};

// ── golden: hand-written reference answers ───
// Guards the graders against false positives. Proves nothing about
// model behaviour.

export const goldenTarget: EvalTarget = {
    name: "golden",
    describe: "hand-written reference answers (offline, free)",
    live: false,
    supports: (evalCase) => evalCase.id in GOLDEN_RESPONSES,
    run: async (evalCase) => GOLDEN_RESPONSES[evalCase.id],
};

// ── synthesis: SYNTHESIS_PROMPT in isolation ──
// NOTE: as of v0.1, lib/llm.ts#synthesizeResponse is not called by any
// route — /api/query delegates to Backboard instead. This target
// grades the prompt that docs/trust-safety.md claims enforces SOP
// primacy, which is worth knowing even while it is unwired.

// Evals run at temperature 0 by default. At the production 0.5 the pass
// rate is a sample, not a measurement: two runs of the same 53 cases gave
// 38/53 and 36/53 with only 12 of the 17 failures in common. Override with
// LORE_EVAL_TEMPERATURE to measure that spread deliberately.
export const EVAL_TEMPERATURE = Number.parseFloat(
    process.env.LORE_EVAL_TEMPERATURE ?? "0"
);

export const synthesisTarget: EvalTarget = {
    name: "synthesis",
    describe: `lib/llm.ts synthesizeResponse at temperature ${EVAL_TEMPERATURE} — needs OPENAI_API_KEY (live, costs tokens)`,
    live: true,
    supports: () => true,
    run: async (evalCase) => {
        const { synthesizeResponse } = await import("../lib/llm");
        const { ensureAmmDisclaimer, shouldAppendAmmDisclaimer } = await import(
            "../lib/safety"
        );

        const raw = await synthesizeResponse(evalCase.question, evalCase.context, {
            temperature: EVAL_TEMPERATURE,
        });

        // Mirror what /api/query does to the model's output. Grading the raw
        // completion would measure something that never reaches a technician,
        // and would leave the disclaimer invariant sampled rather than
        // guaranteed. The grader now regression-guards the code path: remove
        // the call and the eval fails.
        return shouldAppendAmmDisclaimer(evalCase.question)
            ? ensureAmmDisclaimer(raw)
            : raw.trim();
    },
};

// ── http: the real deployed path ─────────────
// POSTs to a running /api/query, which resolves the aircraft thread and
// lets Backboard do retrieval. This is the only target that grades what
// a technician would actually hear.
//
// Caveat worth stating out loud: this target cannot inject context. The
// case's declared context is treated as the set Backboard *should*
// retrieve, so a no-fabricated-measurements failure here means either
// the model hallucinated OR retrieval surfaced a source the case set
// does not declare. Read the detail line before blaming the model.

const TAIL_RE = /\bF-[A-Z]{4}\b/;

export function createHttpTarget(baseUrl: string): EvalTarget {
    return {
        name: "http",
        describe: `POST ${baseUrl}/api/query — real Backboard path (live)`,
        live: true,
        supports: () => true,
        run: async (evalCase) => {
            const tail = evalCase.question.match(TAIL_RE)?.[0] ?? "F-GKXA";

            const res = await fetch(`${baseUrl}/api/query`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ transcript: evalCase.question, tail }),
            });

            if (!res.ok) {
                const body = await res.text();
                throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
            }

            const json = (await res.json()) as { response?: string };
            return json.response ?? "";
        },
    };
}

export function resolveTarget(name: string, baseUrl: string): EvalTarget {
    switch (name) {
        case "golden":
            return goldenTarget;
        case "synthesis":
            return synthesisTarget;
        case "http":
            return createHttpTarget(baseUrl);
        default:
            throw new Error(
                `Unknown target "${name}". Use one of: golden, synthesis, http, regression.`
            );
    }
}
