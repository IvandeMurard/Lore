export const AMM_DISCLAIMER = "Always verify the AMM procedure before intervening.";

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
