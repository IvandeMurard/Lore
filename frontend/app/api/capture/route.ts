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

        // 3. Fire-and-forget: store in background, don't block the response
        const storeInBackground = async () => {
            const storePromises: Promise<any>[] = [];

            if (tail) {
                try {
                    const aircraftThreadId = resolveThreadId(tail);
                    storePromises.push(
                        sendMessage(aircraftThreadId, memoryMessage, "Auto")
                    );
                } catch {
                    console.warn(`[capture] No Backboard thread for aircraft: ${tail}`);
                }
            }

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

            const results = await Promise.allSettled(storePromises);
            for (const r of results) {
                if (r.status === "rejected") {
                    console.error("[capture] Background store failed:", r.reason);
                }
            }
        };
        void storeInBackground();

        return NextResponse.json({
            confirmation: `Knowledge captured from ${technician || "unknown"} for ${tail || "unknown"}. Linked to ${extracted.component || component || "unknown"}, ${extracted.conditions || conditions || "standard"} conditions. Accessible to all certified technicians on this airframe.`,
        });
    } catch (error) {
        console.error("[/api/capture] Error:", error);
        return NextResponse.json(
            { error: "Internal server error", details: String(error) },
            { status: 500 }
        );
    }
}
