import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/openai";
import { sendMessage, countMessages, resolveThreadId } from "@/lib/backboard";
import { LOG_PROMPT } from "@/lib/prompts";

/**
 * POST /api/log
 *
 * Logs a technician intervention to the aircraft Backboard thread.
 * memory=Auto → stored as part of the aircraft's persistent memory.
 *
 * Body: { transcript, tail, technician }
 * Returns: { confirmation, intervention_count }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, tail, technician } = body;

    if (!transcript) {
      return NextResponse.json(
        { error: "transcript is required" },
        { status: 400 }
      );
    }

    // 1. LLM extracts structured log entry
    const logContext = `Technician: ${technician || "Unknown"}
Aircraft: ${tail || "Unknown"}

Transcript:
"${transcript}"`;

    const extractedRaw = await chatCompletion(
      LOG_PROMPT,
      logContext,
      { temperature: 0.1 }
    );

    let extracted;
    try {
      extracted = JSON.parse(extractedRaw);
    } catch {
      extracted = {
        description: transcript,
        component: "Unknown",
        findings: transcript,
        action_taken: "Logged",
        status: "monitoring",
      };
    }

    // 2. Build structured log message for Backboard memory
    const logMessage = `[INTERVENTION LOG — ${new Date().toISOString().split("T")[0]}]
Technician: ${technician || "Unknown"}
Aircraft: ${tail || "Unknown"}
Component: ${extracted.component || "Unknown"}
Observation: ${extracted.findings || extracted.description || transcript}
Action taken: ${extracted.action_taken || "None"}
Status: ${extracted.status || "monitoring"}
Escalation required: ${extracted.escalation_required ? "YES" : "No"}`;

    // 3. Store in aircraft thread (memory=Auto)
    let interventionCount = 0;

    try {
      const threadId = resolveThreadId(tail || "default");
      await sendMessage(threadId, logMessage, "Auto");
      interventionCount = await countMessages(threadId);
    } catch (err) {
      console.warn(`[log] Could not resolve thread for ${tail}:`, err);
    }

    return NextResponse.json({
      confirmation: `Logged. ${tail || "Aircraft"} memory updated. ${interventionCount} intervention${interventionCount !== 1 ? "s" : ""} on record.`,
      intervention_count: interventionCount,
    });
  } catch (error) {
    console.error("[/api/log] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
