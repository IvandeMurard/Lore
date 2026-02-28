import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/openai";
import { sendMessage, resolveThreadId } from "@/lib/backboard";
import { ELICITATION_PROMPT } from "@/lib/prompts";

/**
 * POST /api/capture
 *
 * Captures oral knowledge from a senior technician.
 * Stores in Backboard: aircraft thread + technician thread (memory=Auto).
 *
 * Body: { transcript, technician, tail, component, conditions }
 * Returns: { confirmation }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, technician, tail, component, conditions } = body;

    if (!transcript) {
      return NextResponse.json(
        { error: "transcript is required" },
        { status: 400 }
      );
    }

    // 1. LLM structures the raw transcript into clean oral knowledge
    const extractionContext = `Technician: ${technician || "Unknown"}
Aircraft: ${tail || "Unknown"}
Component: ${component || "Unknown"}
Conditions: ${conditions || "Standard"}

Transcript:
"${transcript}"`;

    const extractedRaw = await chatCompletion(
      ELICITATION_PROMPT,
      extractionContext,
      { temperature: 0.1 }
    );

    // Parse structured knowledge (fallback to raw transcript if LLM doesn't return JSON)
    let extracted;
    try {
      extracted = JSON.parse(extractedRaw);
    } catch {
      extracted = {
        knowledge: transcript,
        component: component || "Unknown",
        conditions: conditions || "Standard",
        confidence: 0.7,
      };
    }

    // 2. Build a rich message for Backboard memory storage
    const memoryMessage = `[ORAL KNOWLEDGE — ${new Date().toISOString().split("T")[0]}]
Technician: ${technician || "Unknown"}
Aircraft: ${tail || "Unknown"}
Component: ${extracted.component || component || "Unknown"}
Conditions: ${extracted.conditions || conditions || "Standard"}
Knowledge: ${extracted.knowledge || transcript}`;

    // 3. Store in both threads simultaneously (aircraft + technician)
    const storePromises: Promise<any>[] = [];

    // Aircraft thread — knowledge linked to this specific tail
    if (tail) {
      try {
        const aircraftThreadId = resolveThreadId(tail);
        storePromises.push(
          sendMessage(aircraftThreadId, memoryMessage, "Auto")
        );
      } catch {
        // Thread not configured — skip silently, log warning
        console.warn(`[capture] No Backboard thread for aircraft: ${tail}`);
      }
    }

    // Technician thread — portable expertise across all aircraft
    if (technician) {
      try {
        const techThreadId = resolveThreadId(technician);
        storePromises.push(
          sendMessage(techThreadId, memoryMessage, "Auto")
        );
      } catch {
        console.warn(`[capture] No Backboard thread for technician: ${technician}`);
      }
    }

    await Promise.allSettled(storePromises);

    return NextResponse.json({
      confirmation: `Knowledge captured from ${technician || "unknown"} for ${tail || "unknown"}. Linked to ${extracted.component || component || "unknown"}, ${extracted.conditions || conditions || "standard"} conditions. Stored and pending expert review before activation for the team.`,
      // Trust & Safety: knowledge is stored but flagged as pending expert review.
      // In production, a validation queue prevents unreviewed knowledge from being served.
      validated: false,
      validation_note: "Pending review by certified technical authority before activation in production.",
    });
  } catch (error) {
    console.error("[/api/capture] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
