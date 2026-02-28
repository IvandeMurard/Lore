import { NextRequest, NextResponse } from "next/server";
import { embed, chatCompletion } from "@/lib/openai";
import { searchPoints, COLLECTIONS } from "@/lib/qdrant";
import { SYNTHESIS_PROMPT } from "@/lib/prompts";

/**
 * POST /api/query
 *
 * Handles a junior technician's question.
 * Searches oral knowledge + SOP chunks, synthesizes a response.
 *
 * Body: { transcript, tail }
 * Returns: { response, sources }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { transcript, tail } = body;

        if (!transcript) {
            return NextResponse.json(
                { error: "transcript is required" },
                { status: 400 }
            );
        }

        // 1. Embed the query text
        const queryVector = await embed(transcript);

        // 2. Parallel Qdrant searches: oral_knowledge + sop_chunks + aircraft_history
        // Note: We don't filter oral_knowledge by aircraft — semantic search handles relevancy
        // and seniors' knowledge often applies across airframes
        const [oralResults, sopResults, historyResults] = await Promise.all([
            searchPoints(COLLECTIONS.ORAL_KNOWLEDGE, queryVector, 5).catch(() => []),
            searchPoints(COLLECTIONS.SOP_CHUNKS, queryVector, 3).catch(() => []),
            tail
                ? searchPoints(COLLECTIONS.AIRCRAFT_HISTORY, queryVector, 3, {
                    must: [{ key: "aircraft", match: { value: tail } }],
                }).catch(() => [])
                : Promise.resolve([]),
        ]);

        // 3. Format context for LLM synthesis
        const sopContext =
            sopResults.length > 0
                ? sopResults
                    .map(
                        (r: any) =>
                            `[SOP ${r.payload?.sop_id || "Unknown"}] ${r.payload?.text || r.payload?.content || ""}`
                    )
                    .join("\n")
                : "No relevant SOP excerpts found.";

        const oralContext =
            oralResults.length > 0
                ? oralResults
                    .map(
                        (r: any) =>
                            `[${r.payload?.technician || "Senior"}, ${r.payload?.date || "Unknown date"}] ${r.payload?.knowledge || r.payload?.text || ""}`
                    )
                    .join("\n")
                : "No oral knowledge found for this query.";

        const historyContext =
            historyResults.length > 0
                ? historyResults
                    .map(
                        (r: any) =>
                            `[${r.payload?.date || "Unknown date"}] ${r.payload?.description || r.payload?.text || ""}`
                    )
                    .join("\n")
                : "No aircraft history found.";

        const synthesisInput = `Junior technician's question:
"${transcript}"
${tail ? `Aircraft: ${tail}` : ""}

--- SOP EXCERPTS (HIGHEST PRIORITY) ---
${sopContext}

--- SENIOR ORAL KNOWLEDGE ---
${oralContext}

--- AIRCRAFT HISTORY ---
${historyContext}`;

        // 4. LLM synthesis with priority enforcement
        const response = await chatCompletion(SYNTHESIS_PROMPT, synthesisInput, {
            temperature: 0.3,
            maxTokens: 512,
        });

        // 5. Build sources list
        const sources: string[] = [];
        if (sopResults.length > 0) {
            sopResults.forEach((r: any) => {
                sources.push(`SOP ${r.payload?.sop_id || "Unknown"}`);
            });
        }
        if (oralResults.length > 0) {
            oralResults.forEach((r: any) => {
                sources.push(
                    `${r.payload?.technician || "Senior"}, ${r.payload?.date || "Unknown date"}`
                );
            });
        }
        if (historyResults.length > 0) {
            sources.push(`${tail || "Aircraft"} history`);
        }

        return NextResponse.json({
            response,
            sources: Array.from(new Set(sources)), // deduplicate
        });
    } catch (error) {
        console.error("[/api/query] Error:", error);
        return NextResponse.json(
            { error: "Internal server error", details: String(error) },
            { status: 500 }
        );
    }
}
