import { NextRequest, NextResponse } from "next/server";
import {
    buildConversationalQueryMessage,
    getLatestGeneratedSopDraftSource,
    getBackboardErrorMessage,
    getBackboardStatusCode,
    isBackboardTransientError,
    resolveOrCreateThreadId,
    sendQueryMessage,
} from "@/lib/backboard";
import { ensureAmmDisclaimer, shouldAppendAmmDisclaimer } from "@/lib/safety";

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

        if (!tail || !String(tail).trim()) {
            return NextResponse.json(
                { error: "tail is required. Run setup and provide a valid asset identifier." },
                { status: 400 }
            );
        }

        const tailCode = String(tail).trim().toUpperCase();

        // Resolve or create aircraft thread on demand for newly configured spaces.
        const threadId = await resolveOrCreateThreadId(tailCode);

        // Query the aircraft thread — Backboard handles RAG + memory retrieval
        const question = buildConversationalQueryMessage(transcript, tailCode);

        const { response, message_id } = await sendQueryMessage(threadId, question);
        const safeResponse = shouldAppendAmmDisclaimer(transcript)
            ? ensureAmmDisclaimer(response)
            : response.trim();
        const latestGeneratedSopDraft = await getLatestGeneratedSopDraftSource(threadId);

        // Build sources list
        const sources: Array<{ type: string; label: string; details?: string }> = [];
        sources.push({
            type: "history",
            label: `${tailCode} memory`,
            details:
                `Retrieved from the ${tailCode} aircraft thread in Backboard. ` +
                "Includes prior interventions, observations, and maintenance context.",
        });
        sources.push({
            type: "sop",
            label: "SOP documents (RAG)",
            details:
                "Retrieved from SOP documents uploaded to Backboard and indexed for retrieval.",
        });
        sources.push({
            type: "sop",
            label: "Generated SOP drafts (from captures)",
            details:
                latestGeneratedSopDraft ||
                "No generated SOP draft found yet for this aircraft. Capture one first via /api/capture.",
        });
        sources.push({
            type: "oral",
            label: "Senior oral knowledge",
            details:
                "Retrieved from captured senior technician debrief notes stored in Backboard memory.",
        });

        return NextResponse.json({
            response: safeResponse,
            sources,
            message_id,
            degraded: false,
            retryable: false,
        });
    } catch (error) {
        const details = getBackboardErrorMessage(error);
        const backboardStatus = getBackboardStatusCode(error);

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

        if (backboardStatus === 401 || backboardStatus === 403) {
            return NextResponse.json(
                {
                    error: "Backboard authentication failed. Check BACKBOARD_API_KEY in frontend/.env.local.",
                    retryable: false,
                    degraded: true,
                    details,
                },
                { status: 502 }
            );
        }

        if (backboardStatus === 404) {
            return NextResponse.json(
                {
                    error: "Backboard resource not found. Re-run setup and verify thread/assistant IDs.",
                    retryable: false,
                    degraded: true,
                    details,
                },
                { status: 502 }
            );
        }

        console.error("[/api/query] Error:", error);
        return NextResponse.json(
            {
                error: "Internal server error",
                retryable: false,
                degraded: true,
                details,
            },
            { status: 500 }
        );
    }
}
