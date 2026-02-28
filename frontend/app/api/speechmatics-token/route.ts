import { NextResponse } from "next/server";

const DEFAULT_MP_BASE_URL = "https://mp.speechmatics.com";

interface SpeechmaticsTokenResponse {
  key_value?: string;
  token?: string;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const apiKey = process.env.SPEECHMATICS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing SPEECHMATICS_API_KEY." },
        { status: 500 }
      );
    }

    const mpBaseUrl = process.env.SPEECHMATICS_MANAGEMENT_BASE_URL ?? DEFAULT_MP_BASE_URL;
    const response = await fetch(`${mpBaseUrl}/v1/api_keys?type=rt`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: 300 }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      return NextResponse.json(
        {
          error: `Speechmatics realtime token request failed (${response.status}): ${body}`,
        },
        { status: 500 }
      );
    }

    const payload = (await response.json()) as SpeechmaticsTokenResponse;
    const token = payload.key_value ?? payload.token;
    if (!token) {
      return NextResponse.json(
        { error: "Speechmatics token response missing token." },
        { status: 500 }
      );
    }

    return NextResponse.json({ token });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create token.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
