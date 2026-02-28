/**
 * Speechmatics STT integration using the official SDK.
 * Uses @speechmatics/real-time-client + @speechmatics/auth
 */

import { createSpeechmaticsJWT } from "@speechmatics/auth";
import { RealtimeClient } from "@speechmatics/real-time-client";

export const SPEECHMATICS_CONFIG = {
    apiKey: process.env.SPEECHMATICS_API_KEY ?? "",
    language: process.env.SPEECHMATICS_LANGUAGE ?? "en",
};

export type TranscriptionResult = {
    transcript: string;
    finalSegments: string[];
};

/**
 * Transcribe an audio buffer using Speechmatics real-time API.
 * Sends the full buffer as a stream and collects final transcript segments.
 */
export async function transcribeAudio(
    audioBuffer: Buffer,
): Promise<TranscriptionResult> {
    if (!SPEECHMATICS_CONFIG.apiKey) {
        throw new Error("Missing SPEECHMATICS_API_KEY.");
    }

    if (!audioBuffer.byteLength) {
        throw new Error("Audio buffer is empty.");
    }

    const finalSegments: string[] = [];

    const client = new RealtimeClient();

    // Collect final transcript segments
    client.addEventListener("receiveMessage", ({ data }) => {
        if (data.message === "AddTranscript") {
            const results = data.results || [];
            const text = results
                .map((r: { alternatives?: Array<{ content?: string }> }) =>
                    r.alternatives?.[0]?.content ?? ""
                )
                .join(" ")
                .trim();
            if (text) {
                finalSegments.push(text);
            }
        }
    });

    // Get a short-lived JWT
    const jwt = await createSpeechmaticsJWT({
        type: "rt",
        apiKey: SPEECHMATICS_CONFIG.apiKey,
        ttl: 60,
    });

    // Start the session
    await client.start(jwt, {
        transcription_config: {
            language: SPEECHMATICS_CONFIG.language,
            operating_point: "enhanced",
            max_delay: 2.0,
            enable_partials: false,
        },
    });

    // Send audio in chunks
    const CHUNK_SIZE = 8192;
    for (let offset = 0; offset < audioBuffer.length; offset += CHUNK_SIZE) {
        const chunk = audioBuffer.subarray(offset, offset + CHUNK_SIZE);
        client.sendAudio(chunk);
    }

    // Signal end of audio and wait for final transcript
    await client.stopRecognition();

    const transcript = finalSegments.join(" ").replace(/\s+/g, " ").trim();

    return {
        transcript,
        finalSegments,
    };
}
