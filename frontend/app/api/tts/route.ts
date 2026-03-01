import { NextResponse } from "next/server";
import openai from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TtsRequestBody {
  text?: string;
  voice?: string;
  model?: string;
  format?: "mp3" | "wav" | "opus" | "aac" | "flac" | "pcm";
  // Backward compatibility with prior Speechmatics payload shape.
  output_format?: "wav_16000" | "pcm_16000";
}

function toOpenAiFormat(body: TtsRequestBody): "mp3" | "wav" | "opus" | "aac" | "flac" | "pcm" {
  if (body.format) return body.format;
  if (body.output_format === "wav_16000") return "wav";
  if (body.output_format === "pcm_16000") return "pcm";
  return (process.env.OPENAI_TTS_FORMAT as
    | "mp3"
    | "wav"
    | "opus"
    | "aac"
    | "flac"
    | "pcm"
    | undefined) ?? "opus";
}

function contentTypeFor(format: "mp3" | "wav" | "opus" | "aac" | "flac" | "pcm"): string {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "opus":
      return "audio/opus";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "pcm":
      return "audio/L16";
    case "mp3":
    default:
      return "audio/mpeg";
  }
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function looksLikeModelError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("model") || message.includes("unsupported");
}

async function synthesizeWithModel(
  model: string,
  voice: string,
  text: string,
  format: "mp3" | "wav" | "opus" | "aac" | "flac" | "pcm"
) {
  return openai.audio.speech.create({
    model,
    voice: voice as any,
    input: text,
    response_format: format,
  });
}

export async function POST(request: Request) {
  try {
    const totalStart = nowMs();
    const body = (await request.json()) as TtsRequestBody;
    const text = String(body.text ?? "").trim();

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const preferredModel =
      body.model ?? process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
    const voice = body.voice ?? process.env.OPENAI_TTS_VOICE ?? "alloy";
    const format = toOpenAiFormat(body);

    let resolvedModel = preferredModel;
    let generated;
    const openaiStart = nowMs();

    try {
      generated = await synthesizeWithModel(preferredModel, voice, text, format);
    } catch (error) {
      if (preferredModel !== "tts-1" && looksLikeModelError(error)) {
        resolvedModel = "tts-1";
        generated = await synthesizeWithModel("tts-1", voice, text, format);
      } else {
        throw error;
      }
    }
    const openaiCreateMs = nowMs() - openaiStart;

    const downloadStart = nowMs();
    const audioBytes = await generated.arrayBuffer();
    const downloadMs = nowMs() - downloadStart;
    const totalMs = nowMs() - totalStart;

    console.log("[/api/tts] timing", {
      model: resolvedModel,
      textLength: text.length,
      audioBytes: audioBytes.byteLength,
      openaiCreateMs: Number(openaiCreateMs.toFixed(1)),
      audioDownloadMs: Number(downloadMs.toFixed(1)),
      totalMs: Number(totalMs.toFixed(1)),
    });

    return new Response(audioBytes, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(format),
        "Cache-Control": "no-store",
        "X-TTS-Model": resolvedModel,
        "X-TTS-Text-Length": String(text.length),
        "X-TTS-Audio-Bytes": String(audioBytes.byteLength),
        "Server-Timing": [
          `openai_create;dur=${openaiCreateMs.toFixed(1)}`,
          `audio_download;dur=${downloadMs.toFixed(1)}`,
          `total;dur=${totalMs.toFixed(1)}`,
        ].join(", "),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "OpenAI TTS request failed.";
    console.error("[/api/tts] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
