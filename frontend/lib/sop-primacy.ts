// ─────────────────────────────────────────────
// LORE — Structural SOP primacy
//
// docs/trust-safety.md calls SOP primacy "structurally enforced". Until
// this file it was a sentence in two prompts, which is a request, not an
// enforcement. Three attempts to strengthen the request all failed:
//
//   1. More explicit prompt rules — the model complied on the cases the
//      rule named and drifted on the ones it did not.
//   2. Injecting the computed band into the context — fixed the boundary
//      cases and broke others, 53/53 → 61/64.
//   3. Adding the conditional caveats to that block — worse, 58/64, a
//      3.9pp tier-1 drop.
//
// The lesson each time: acting before generation perturbs every answer,
// because the model has to reconcile a new instruction with all the
// others. Acting after generation touches only the answers that are
// actually wrong.
//
// So: verify, correct once with a targeted instruction, verify again, and
// fail closed onto the manual. The pipeline cannot emit a response that
// contradicts a computable SOP rule, whatever the model does.
//
// Same shape as ensureAmmDisclaimer, which is the only guarantee in this
// codebase that has held under measurement.
// ─────────────────────────────────────────────

import {
    buildDeterministicVerdict,
    findBandContradictions,
    type BandContradiction,
} from "./bands";

export type PrimacyStatus =
    /** The model's answer already agreed with the manual. */
    | "clean"
    /** One targeted correction brought it into line. */
    | "corrected"
    /** Correction failed or was unavailable; the manual's verdict shipped instead. */
    | "fallback";

export type PrimacyOutcome = {
    response: string;
    status: PrimacyStatus;
    /** What was wrong on the first pass. Empty when clean. */
    contradictions: string[];
};

/**
 * Regenerates the answer given a correction instruction. Supplied by the
 * caller so this module stays independent of which model or service
 * produced the original — /api/query goes through Backboard, the eval
 * target goes through OpenAI directly.
 */
export type Regenerate = (correction: string) => Promise<string>;

function buildCorrection(
    contradictions: BandContradiction[],
    question: string
): string {
    const lines = contradictions.map((c) => `- ${c.correction}`);

    return [
        "Your previous answer contradicted the maintenance manual on a point that is not open to interpretation.",
        "",
        "Corrections, taken directly from the AMM band tables:",
        ...lines,
        "",
        `Rewrite your answer to the technician's question — "${question}" — stating the correction above as the governing rule.`,
        "Captured technician notes may stay, as attributed context, but they do not override the manual and must not be presented as the applicable rule.",
        "Do not mention this correction or that you are rewriting anything.",
    ].join("\n");
}

export async function enforceSopPrimacy(
    question: string,
    response: string,
    regenerate?: Regenerate
): Promise<PrimacyOutcome> {
    const first = findBandContradictions(response, question);

    if (first.length === 0) {
        return { response, status: "clean", contradictions: [] };
    }

    const details = first.map((c) => c.detail);

    if (regenerate) {
        try {
            const corrected = await regenerate(buildCorrection(first, question));
            if (
                corrected.trim().length > 0 &&
                findBandContradictions(corrected, question).length === 0
            ) {
                return {
                    response: corrected,
                    status: "corrected",
                    contradictions: details,
                };
            }
        } catch (error) {
            console.warn(
                "[sop-primacy] Correction pass failed, falling back to the manual:",
                error instanceof Error ? error.message : error
            );
        }
    }

    // Fail closed. A terse, correct answer beats a fluent, contradicting one:
    // the technician can act on the first and is misled by the second.
    const verdict = buildDeterministicVerdict(question);

    return {
        response:
            verdict ||
            "I can't give you a reliable classification for that reading. Take it from the AMM directly.",
        status: "fallback",
        contradictions: details,
    };
}
