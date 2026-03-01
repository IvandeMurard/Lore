import { NextResponse } from "next/server";
import { transcribeWithSpeechmatics } from "@/lib/speechmatics";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Convert webm/opus audio to wav using ffmpeg (available on most systems).
 * Speechmatics batch API only supports: wav, mp3, aac, ogg, mpeg, amr, m4a, mp4, flac.
 * webm is NOT supported.
 */
async function convertToWav(audioFile: File): Promise<File> {
  const { execSync } = await import("child_process");
  const { writeFileSync, readFileSync, unlinkSync } = await import("fs");
  const { tmpdir } = await import("os");
  const { join } = await import("path");

  const id = `stt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = join(tmpdir(), `${id}.webm`);
  const outputPath = join(tmpdir(), `${id}.wav`);

  try {
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    writeFileSync(inputPath, buffer);

    execSync(
      `ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -f wav "${outputPath}"`,
      { timeout: 15000, stdio: "pipe" }
    );

    const wavBuffer = readFileSync(outputPath);
    return new File([wavBuffer], "recording.wav", { type: "audio/wav" });
  } finally {
    try { unlinkSync(inputPath); } catch { }
    try { unlinkSync(outputPath); } catch { }
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function transcribeWithOpenAI(audioFile: File, language: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe";

  const result = await client.audio.transcriptions.create({
    file: audioFile,
    model,
    language: language || "en",
    response_format: "text",
  });

  return String(result ?? "").trim();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
    const language = String(formData.get("language") ?? "en");

    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "Missing audio file in form-data field `audio`." },
        { status: 400 }
      );
    }

    if (audio.size === 0) {
      return NextResponse.json(
        { error: "Audio file is empty." },
        { status: 400 }
      );
    }

    // Convert webm to wav for Speechmatics batch compatibility.
    const isWebm = (audio.type || "").includes("webm");
    const fileToTranscribe = isWebm ? await convertToWav(audio) : audio;

    let speechmaticsError: string | null = null;
    let speechmaticsTranscript = "";

    try {
      speechmaticsTranscript = (await transcribeWithSpeechmatics(fileToTranscribe, language)).trim();
    } catch (error) {
      speechmaticsError = toErrorMessage(error);
      console.warn("[/api/transcribe] Speechmatics failed, trying OpenAI fallback:", speechmaticsError);
    }

    if (speechmaticsTranscript) {
      return NextResponse.json({ transcript: speechmaticsTranscript, provider: "speechmatics" });
    }

    try {
      // Use original audio file for OpenAI fallback to avoid unnecessary conversion paths.
      const openAiTranscript = await transcribeWithOpenAI(audio, language);
      if (openAiTranscript) {
        return NextResponse.json({
          transcript: openAiTranscript,
          provider: "openai-fallback",
          degraded: true,
        });
      }
    } catch (error) {
      const openAiError = toErrorMessage(error);
      if (speechmaticsError) {
        return NextResponse.json(
          {
            error: `Speechmatics failed (${speechmaticsError}) and OpenAI fallback failed (${openAiError}).`,
          },
          { status: 502 }
        );
      }
      return NextResponse.json({ error: `OpenAI fallback failed: ${openAiError}` }, { status: 502 });
    }

    // At this point both providers returned an empty transcript: treat as true silence.
    return NextResponse.json({ transcript: "", provider: "none" });
  } catch (error) {
    console.error("[/api/transcribe] Error:", error);
    const message = toErrorMessage(error) || "Transcription failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
