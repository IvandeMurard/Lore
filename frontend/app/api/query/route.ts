import { NextRequest, NextResponse } from "next/server";
import { embed } from "@/lib/openai";
import { searchPoints, COLLECTIONS } from "@/lib/qdrant";
import { synthesizeResponse } from "@/lib/llm";

/**
 * POST /api/query
 *
 * Handles a junior technician's question.
 * Searches oral knowledge + SOP chunks + aircraft history, synthesizes a response.
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
        const [oralResults, sopResults, historyResults] = await Promise.all([
            searchPoints(COLLECTIONS.ORAL_KNOWLEDGE, queryVector, 5).catch(() => []),
            searchPoints(COLLECTIONS.SOP_CHUNKS, queryVector, 3).catch(() => []),
            tail
                ? searchPoints(COLLECTIONS.AIRCRAFT_HISTORY, queryVector, 3, {
                    must: [{ key: "aircraft", match: { value: tail } }],
                }).catch(() => [])
                : Promise.resolve([]),
        ]);

        // 3. Format sources for the LLM synthesis function
        const sopSources = sopResults.length > 0
            ? sopResults.map((r: any) => `[SOP ${r.payload?.sop_id || "Unknown"}] ${r.payload?.text || r.payload?.content || ""}`)
            : [];

        const oralSources = oralResults.length > 0
            ? oralResults.map((r: any) => `[${r.payload?.technician || "Senior"}, ${r.payload?.date || "Unknown date"}] ${r.payload?.knowledge || r.payload?.text || ""}`)
            : [];

        const historySources = historyResults.length > 0
            ? historyResults.map((r: any) => `[${r.payload?.date || "Unknown date"}] ${r.payload?.description || r.payload?.text || ""}`)
            : [];

        // 4. Use the frontend's synthesizeResponse which enforces SOP > Oral > History priority
        const response = await synthesizeResponse(transcript, {
            sop: sopSources,
            oral: oralSources,
            history: historySources,
        });

        // 5. Build deduplicated sources list for UI
        const sourceLabels: Array<{ type: string; label: string }> = [];
        if (sopResults.length > 0) {
            sopResults.forEach((r: any) => {
                sourceLabels.push({ type: "sop", label: `SOP ${r.payload?.sop_id || "Unknown"}` });
            });
        }
        if (oralResults.length > 0) {
            oralResults.forEach((r: any) => {
                sourceLabels.push({
                    type: "oral",
                    label: `${r.payload?.technician || "Senior"}, ${r.payload?.date || "Unknown date"}`,
                });
            });
        }
        if (historyResults.length > 0) {
            sourceLabels.push({ type: "history", label: `${tail || "Aircraft"} history` });
        }

        return NextResponse.json({
            response,
            sources: sourceLabels,
        });
    } catch (error) {
        console.error("[/api/query] Error:", error);
        return NextResponse.json(
            { error: "Internal server error", details: String(error) },
            { status: 500 }
        );
    }
}
