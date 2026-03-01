import { NextRequest, NextResponse } from "next/server";
import { sendMessage, resolveThreadId } from "@/lib/backboard";

const QUERY_TIMEOUT_MS = 18000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error("Backboard query timed out.")), timeoutMs);
        }),
    ]);
}

/**
 * POST /api/query
 *
 * Handles a junior technician's question.
 * Queries the aircraft Backboard thread — memory=Auto retrieves:
 *   - Senior oral knowledge (stored via /api/capture)
 *   - Aircraft intervention history (stored via /api/log)
 *   - SOP documents (uploaded to Backboard dashboard)
 * Priority enforced by the Lore assistant system prompt: SOP > oral > history.
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

        // Resolve aircraft thread
        let threadId: string;
        try {
            threadId = resolveThreadId(tail || "default");
        } catch {
            return NextResponse.json(
                { error: `No Backboard thread configured for aircraft: ${tail}. Run npm run setup-backboard.` },
                { status: 400 }
            );
        }

        // Query the aircraft thread — Backboard handles RAG + memory retrieval
        const question = tail
            ? `[Aircraft: ${tail}] ${transcript}`
            : transcript;

        const { response, message_id } = await withTimeout(
            sendMessage(threadId, question, "ReadOnly"),
            QUERY_TIMEOUT_MS
        );

        // Build sources list
        const sources: Array<{ type: string; label: string }> = [];
        if (tail) sources.push({ type: "history", label: `${tail} memory` });
        sources.push({ type: "sop", label: "SOP documents (RAG)" });
        sources.push({ type: "oral", label: "Senior oral knowledge" });

        return NextResponse.json({
            response,
            sources,
            message_id,
        });
    } catch (error) {
        const statusCode =
            typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            typeof (error as { statusCode?: number }).statusCode === "number"
                ? (error as { statusCode: number }).statusCode
                : undefined;

        const message =
            error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        const isTimeout = message.includes("timed out") || message.includes("timeout");

        if (
            isTimeout ||
            statusCode === 429 ||
            (typeof statusCode === "number" && statusCode >= 500)
        ) {
            console.warn("[/api/query] Backboard transient error:", error);
            return NextResponse.json(
                {
                    error:
                        "Knowledge service is temporarily unavailable. Please try again in a few seconds.",
                },
                { status: 503 }
            );
        }

        console.error("[/api/query] Error:", error);
        return NextResponse.json(
            { error: "Internal server error", details: String(error) },
            { status: 500 }
        );
    }
}
