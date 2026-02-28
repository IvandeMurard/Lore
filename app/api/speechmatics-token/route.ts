import { NextResponse } from "next/server";
import { createSpeechmaticsJWT } from "@speechmatics/auth";

export const runtime = "nodejs";

const DEFAULT_RT_URL = "wss://eu2.rt.speechmatics.com/v2";
const DEFAULT_LANGUAGE = "en";

type SpeechmaticsRegion = "eu" | "usa" | "au";

function parseRegion(value: string | undefined): SpeechmaticsRegion | undefined {
    if (!value) {
        return undefined;
    }

    if (value === "eu" || value === "usa" || value === "au") {
        return value;
    }

    return undefined;
}

export async function POST() {
    try {
        const apiKey = process.env.SPEECHMATICS_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { error: "Missing SPEECHMATICS_API_KEY on server." },
                { status: 500 }
            );
        }

        const region = parseRegion(process.env.SPEECHMATICS_REGION);

        const jwt = await createSpeechmaticsJWT({
            type: "rt",
            apiKey,
            ttl: 60,
            ...(region ? { region } : {}),
        });

        return NextResponse.json({
            jwt,
            rtUrl: process.env.SPEECHMATICS_RT_URL || DEFAULT_RT_URL,
            language: process.env.SPEECHMATICS_LANGUAGE || DEFAULT_LANGUAGE,
        });
    } catch (error) {
        console.error("[/api/speechmatics-token] Error:", error);
        return NextResponse.json(
            {
                error: "Failed to create Speechmatics realtime token.",
                details: error instanceof Error ? error.message : "Unknown token error",
            },
            { status: 500 }
        );
    }
}
