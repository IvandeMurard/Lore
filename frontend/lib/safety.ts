export const AMM_DISCLAIMER = "Always verify the AMM procedure before intervening.";

const PROJECT_INTENT_HINTS = [
    "project",
    "lore",
    "hackathon",
    "demo",
    "architecture",
    "feature",
    "roadmap",
    "how does this work",
    "what is this",
    "who built",
    "why did you build",
];

const MAINTENANCE_HINTS = [
    "amm",
    "sop",
    "aircraft",
    "airframe",
    "engine",
    "component",
    "intervention",
    "inspection",
    "vibration",
    "leak",
    "torque",
    "compressor",
    "fan",
    "escalat",
    "maintenance",
];

const DISCLAIMER_ANYWHERE_RE = new RegExp(
    AMM_DISCLAIMER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "gi"
);

/**
 * Guarantees the AMM sentence is the last thing said.
 *
 * Appending when missing is not enough: asked to both close with the AMM
 * sentence and ask a follow-up question, the model reliably does both in
 * the wrong order — "...before intervening. Is there anything else?" —
 * which reads as if the reminder applied to the pleasantry.
 *
 * So any existing occurrence is removed and the sentence re-appended at
 * the end. docs/trust-safety.md calls this disclaimer non-removable; that
 * is only true if code enforces it rather than the prompt asking nicely.
 */
export function ensureAmmDisclaimer(text: string): string {
    const stripped = text
        .replace(DISCLAIMER_ANYWHERE_RE, " ")
        .replace(/\s+/g, " ")
        // Tidy punctuation left stranded by the removal.
        .replace(/\s+([.!?,;])/g, "$1")
        .replace(/([.!?])\s*[.!?]+/g, "$1")
        .trim();

    if (!stripped) {
        return AMM_DISCLAIMER;
    }

    if (/[.!?]$/.test(stripped)) {
        return `${stripped} ${AMM_DISCLAIMER}`;
    }

    return `${stripped}. ${AMM_DISCLAIMER}`;
}

export function shouldAppendAmmDisclaimer(userTranscript: string): boolean {
    const lower = userTranscript.toLowerCase();
    const hasProjectIntent = PROJECT_INTENT_HINTS.some((hint) => lower.includes(hint));
    const hasMaintenanceIntent = MAINTENANCE_HINTS.some((hint) => lower.includes(hint));

    if (hasProjectIntent && !hasMaintenanceIntent) {
        return false;
    }

    return true;
}
