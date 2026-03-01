import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/openai";
import {
    getBackboardErrorMessage,
    isBackboardTransientError,
    persistMessages,
    type PersistTarget,
} from "@/lib/backboard";
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

        const targets: PersistTarget[] = [];
        if (tail) {
            targets.push({
                key: tail,
                label: `aircraft:${tail}`,
                content: memoryMessage,
            });
        }
        if (technician) {
            targets.push({
                key: technician,
                label: `technician:${technician}`,
                content: memoryMessage,
            });
        }

        if (targets.length === 0) {
            return NextResponse.json(
                {
                    error: "No capture targets provided. Add at least one of tail or technician.",
                    stored: false,
                    stored_targets: [],
                    failed_targets: [],
                    degraded: true,
                    retryable: false,
                },
                { status: 400 }
            );
        }

        const persistence = await persistMessages(targets);
        const retryable = persistence.failed_targets.some((f) => f.retryable);
        const payload = {
            confirmation: `Knowledge captured from ${technician || "unknown"} for ${tail || "unknown"}. Linked to ${extracted.component || component || "unknown"}, ${extracted.conditions || conditions || "standard"} conditions. Accessible to all certified technicians on this airframe.`,
            validated: false,
            validation_note:
                "Pending review by certified technical authority before activation in production.",
            ...persistence,
            retryable,
        };

        if (!persistence.stored) {
            return NextResponse.json(
                {
                    ...payload,
                    error: "Capture received but could not be persisted to Backboard.",
                },
                { status: retryable ? 503 : 500 }
            );
        }

        return NextResponse.json(payload);
    } catch (error) {
        console.error("[/api/capture] Error:", error);

        if (isBackboardTransientError(error)) {
            return NextResponse.json(
                {
                    error: "Capture service is temporarily unavailable. Please retry.",
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
