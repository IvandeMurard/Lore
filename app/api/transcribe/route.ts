import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/speechmatics";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const audio = formData.get("audio");

        const isBlobLike =
            !!audio &&
            typeof audio === "object" &&
            "arrayBuffer" in audio &&
            typeof (audio as Blob).arrayBuffer === "function";

        if (!isBlobLike) {
            return NextResponse.json(
                { error: "audio file is required in multipart/form-data" },
                { status: 400 }
            );
        }

        const audioBlob = audio as Blob;
        const audioArrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = Buffer.from(audioArrayBuffer);

        if (!audioBuffer.length) {
            return NextResponse.json(
                { error: "audio file is empty" },
                { status: 400 }
            );
        }

        console.log(`[/api/transcribe] Received ${audioBuffer.length} bytes, mime: ${audioBlob.type}`);

        const result = await transcribeAudio(audioBuffer);

        console.log(`[/api/transcribe] Transcript: "${result.transcript}"`);

        return NextResponse.json({
            transcript: result.transcript,
            segments: result.finalSegments.length,
        });
    } catch (error) {
        console.error("[/api/transcribe] Error:", error);
        return NextResponse.json(
            {
                error: "Transcription failed",
                details:
                    error instanceof Error ? error.message : "Unknown transcription error",
            },
            { status: 500 }
        );
    }
}
