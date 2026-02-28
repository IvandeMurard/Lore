import { NextRequest, NextResponse } from "next/server";
import { embed } from "@/lib/openai";
import { upsertPoint, COLLECTIONS } from "@/lib/qdrant";
import { elicitKnowledge } from "@/lib/llm";

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
        const extractedRaw = await elicitKnowledge(transcript, technician || "Unknown");

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

        // 2. Embed the knowledge text
        const knowledgeText = `${extracted.knowledge || transcript} | Aircraft: ${tail || "Unknown"} | Component: ${extracted.component || component || "Unknown"} | Conditions: ${extracted.conditions || conditions || "Standard"}`;
        const vector = await embed(knowledgeText);

        // 3. Upsert into oral_knowledge collection
        const id = crypto.randomUUID();
        await upsertPoint(COLLECTIONS.ORAL_KNOWLEDGE, id, vector, {
            knowledge: extracted.knowledge || transcript,
            technician: technician || "Unknown",
            aircraft: tail || "Unknown",
            component: extracted.component || component || "Unknown",
            conditions: extracted.conditions || conditions || "Standard",
            confidence: extracted.confidence || 0.7,
            date: new Date().toISOString().split("T")[0],
            raw_transcript: transcript,
        });

        // 4. Return confirmation
        return NextResponse.json({
            id,
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
