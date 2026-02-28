import { NextRequest, NextResponse } from "next/server";
import { embed, chatCompletion } from "@/lib/openai";
import { upsertPoint, countPoints, COLLECTIONS } from "@/lib/qdrant";
import { LOG_PROMPT } from "@/lib/prompts";

/**
 * POST /api/log
 *
 * Logs an intervention to the aircraft history.
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

        // 2. Embed and upsert into aircraft_history
        const logText = `${extracted.description} | Findings: ${extracted.findings} | Action: ${extracted.action_taken}`;
        const vector = await embed(logText);

        const id = crypto.randomUUID();
        await upsertPoint(COLLECTIONS.AIRCRAFT_HISTORY, id, vector, {
            description: extracted.description,
            component: extracted.component,
            findings: extracted.findings,
            action_taken: extracted.action_taken,
            status: extracted.status,
            technician: technician || "Unknown",
            aircraft: tail || "Unknown",
            date: new Date().toISOString().split("T")[0],
            timestamp: new Date().toISOString(),
            raw_transcript: transcript,
        });

        // 3. Count interventions for this aircraft
        let interventionCount = 0;
        try {
            interventionCount = await countPoints(COLLECTIONS.AIRCRAFT_HISTORY, tail ? {
                must: [{ key: "aircraft", match: { value: tail } }],
            } : undefined);
        } catch {
            // If count fails, just return 0
            interventionCount = 0;
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
