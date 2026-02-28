import { NextRequest, NextResponse } from "next/server";
import { embed, chatCompletion } from "@/lib/openai";
import { upsertPoint, COLLECTIONS } from "@/lib/qdrant";
import { ELICITATION_PROMPT } from "@/lib/prompts";

/**
 * POST /api/capture
 *
 * Captures oral knowledge from a senior technician.
 *
 * Body: { transcript, technician, tail, component, conditions }
 * Returns: { id, confirmation }
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

        // 1. LLM extracts structured knowledge from transcript
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
            // If LLM doesn't return valid JSON, use the transcript directly
            extracted = {
                knowledge: transcript,
                component: component || "Unknown",
                conditions: conditions || "Standard",
                confidence: 0.7,
            };
        }

        // 2. Embed the knowledge text
        const knowledgeText = `${extracted.knowledge} | Aircraft: ${tail || "Unknown"} | Component: ${extracted.component} | Conditions: ${extracted.conditions}`;
        const vector = await embed(knowledgeText);

        // 3. Upsert into oral_knowledge collection
        const id = crypto.randomUUID();
        await upsertPoint(COLLECTIONS.ORAL_KNOWLEDGE, id, vector, {
            knowledge: extracted.knowledge,
            technician: technician || "Unknown",
            aircraft: tail || "Unknown",
            component: extracted.component,
            conditions: extracted.conditions,
            confidence: extracted.confidence,
            date: new Date().toISOString().split("T")[0],
            raw_transcript: transcript,
        });

        // 4. Return confirmation
        return NextResponse.json({
            id,
            confirmation: `Knowledge captured from ${technician || "unknown"} for ${tail || "unknown"}. Linked to ${extracted.component}, ${extracted.conditions} conditions. Accessible to all certified technicians on this airframe.`,
        });
    } catch (error) {
        console.error("[/api/capture] Error:", error);
        return NextResponse.json(
            { error: "Internal server error", details: String(error) },
            { status: 500 }
        );
    }
}
