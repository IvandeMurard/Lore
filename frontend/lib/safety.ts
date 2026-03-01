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

export function ensureAmmDisclaimer(text: string): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) {
        return AMM_DISCLAIMER;
    }

    const normalizedLower = normalized.toLowerCase();
    const disclaimerLower = AMM_DISCLAIMER.toLowerCase();
    if (normalizedLower.endsWith(disclaimerLower)) {
        return normalized;
    }

    if (/[.!?]$/.test(normalized)) {
        return `${normalized} ${AMM_DISCLAIMER}`;
    }

    return `${normalized}. ${AMM_DISCLAIMER}`;
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
