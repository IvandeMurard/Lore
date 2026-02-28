import { NextResponse } from "next/server";
import { transcribeWithSpeechmatics } from "@/lib/speechmatics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const transcript = await transcribeWithSpeechmatics(audio, language);
    return NextResponse.json({ transcript });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
