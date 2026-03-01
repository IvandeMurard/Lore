export const TTS_MAX_CHARS = 240;
export const TTS_MAX_WORDS = 55;
export const TTS_MAX_SENTENCES = 2;

export function buildSpokenTtsText(text: string): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return "";

    const sentenceMatches = normalized.match(/[^.!?]+[.!?]?/g) ?? [normalized];
    let spoken = "";
    let sentenceCount = 0;

    for (const sentenceRaw of sentenceMatches) {
        const sentence = sentenceRaw.trim();
        if (!sentence) continue;

        const candidate = spoken ? `${spoken} ${sentence}` : sentence;
        const words = candidate.split(/\s+/).filter(Boolean).length;

        if (candidate.length > TTS_MAX_CHARS || words > TTS_MAX_WORDS) {
            break;
        }

        spoken = candidate;
        sentenceCount += 1;

        if (sentenceCount >= TTS_MAX_SENTENCES) {
            break;
        }
    }

    if (spoken) return spoken;

    const truncated = normalized.slice(0, TTS_MAX_CHARS).trim();
    return /[.!?]$/.test(truncated) ? truncated : `${truncated}...`;
}
