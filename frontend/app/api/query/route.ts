import { NextRequest, NextResponse } from "next/server";
import {
    getBackboardErrorMessage,
    isBackboardTransientError,
    resolveThreadId,
    sendQueryMessage,
} from "@/lib/backboard";
import { ensureAmmDisclaimer } from "@/lib/safety";

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
                {
                    error: `No Backboard thread configured for aircraft: ${tail}. Run npm run setup-backboard.`,
                    retryable: false,
                    degraded: true,
                },
                { status: 400 }
            );
        }

        // Query the aircraft thread — Backboard handles RAG + memory retrieval
        const question = tail
            ? `[Aircraft: ${tail}] ${transcript}`
            : transcript;

        const { response, message_id } = await sendQueryMessage(threadId, question);
        const safeResponse = ensureAmmDisclaimer(response);

        // Build sources list
        const sources: Array<{ type: string; label: string }> = [];
        if (tail) sources.push({ type: "history", label: `${tail} memory` });
        sources.push({ type: "sop", label: "SOP documents (RAG)" });
        sources.push({ type: "oral", label: "Senior oral knowledge" });

        return NextResponse.json({
            response: safeResponse,
            sources,
            message_id,
            degraded: false,
            retryable: false,
        });
    } catch (error) {
        if (isBackboardTransientError(error)) {
            console.warn("[/api/query] Backboard transient error:", error);
            return NextResponse.json(
                {
                    error:
                        "Knowledge service is temporarily unavailable. Please try again in a few seconds.",
                    retryable: true,
                    degraded: true,
                },
                { status: 503 }
            );
        }

        console.error("[/api/query] Error:", error);
        return NextResponse.json(
            {
                error: "Internal server error",
                retryable: false,
                degraded: true,
                details: getBackboardErrorMessage(error),
            },
            { status: 500 }
        );
    }
}
