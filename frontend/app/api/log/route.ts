import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/openai";
import {
    countMessages,
    getBackboardErrorMessage,
    isBackboardTransientError,
    persistMessages,
    resolveThreadId,
} from "@/lib/backboard";
import { LOG_PROMPT } from "@/lib/prompts";

/**
 * POST /api/log
 *
 * Logs a technician intervention to the aircraft Backboard thread.
 * memory=Auto → stored as part of the aircraft's persistent memory.
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

        // 2. Build structured log message for Backboard memory
        const logMessage = `[INTERVENTION LOG — ${new Date().toISOString().split("T")[0]}]
Technician: ${technician || "Unknown"}
Aircraft: ${tail || "Unknown"}
Component: ${extracted.component || "Unknown"}
Observation: ${extracted.findings || extracted.description || transcript}
Action taken: ${extracted.action_taken || "None"}
Status: ${extracted.status || "monitoring"}
Escalation required: ${extracted.escalation_required ? "YES" : "No"}`;

        const tailKey = tail || "default";
        const persistence = await persistMessages([
            {
                key: tailKey,
                label: `aircraft:${tailKey}`,
                content: logMessage,
            },
        ]);
        const retryable = persistence.failed_targets.some((f) => f.retryable);

        if (!persistence.stored) {
            return NextResponse.json(
                {
                    error: `Log received but could not be persisted for ${tail || "aircraft"}.`,
                    confirmation: "No memory update completed.",
                    ...persistence,
                    retryable,
                },
                { status: retryable ? 503 : 500 }
            );
        }

        let intervention_count: number | null = null;
        try {
            const threadId = resolveThreadId(tailKey);
            intervention_count = await countMessages(threadId);
        } catch {
            intervention_count = null;
        }

        return NextResponse.json({
            confirmation: `Logged. ${tail || "Aircraft"} memory updated.`,
            intervention_count,
            ...persistence,
            retryable,
        });
    } catch (error) {
        console.error("[/api/log] Error:", error);

        if (isBackboardTransientError(error)) {
            return NextResponse.json(
                {
                    error: "Log service is temporarily unavailable. Please retry.",
                    retryable: true,
                    degraded: true,
                },
                { status: 503 }
            );
        }

        return NextResponse.json(
            {
                error: "Internal server error",
                details: getBackboardErrorMessage(error),
                retryable: false,
                degraded: true,
            },
            { status: 500 }
        );
    }
}
