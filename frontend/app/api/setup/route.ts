import { NextRequest, NextResponse } from "next/server";
import {
    createAndStoreThreadId,
    getBackboardErrorMessage,
    isBackboardTransientError,
    sendMessage,
} from "@/lib/backboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SetupPayload = {
    orgName?: string;
    industry?: string;
    assetId?: string;
    sopTitle?: string;
    sopContent?: string;
    expertName?: string;
    expertRole?: string;
    expertYears?: string;
};

const MAX_SOP_CHARS = 18_000;

function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function truncateSop(text: string): { content: string; truncated: boolean } {
    if (text.length <= MAX_SOP_CHARS) {
        return { content: text, truncated: false };
    }
    return {
        content: `${text.slice(0, MAX_SOP_CHARS).trim()}\n\n[truncated for setup ingestion]`,
        truncated: true,
    };
}

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as SetupPayload;

        const orgName = asString(body.orgName);
        const industry = asString(body.industry);
        const assetId = asString(body.assetId).toUpperCase();
        const sopTitle = asString(body.sopTitle);
        const sopContent = asString(body.sopContent);
        const expertName = asString(body.expertName);
        const expertRole = asString(body.expertRole);
        const expertYears = asString(body.expertYears);

        if (!assetId) {
            return NextResponse.json(
                { error: "assetId is required" },
                { status: 400 }
            );
        }

        // Every setup run creates fresh scoped threads so previous demo/history does not leak.
        const assetThreadId = await createAndStoreThreadId(assetId);
        const expertThreadId = expertName
            ? await createAndStoreThreadId(expertName)
            : null;

        const setupMessage = `[LORE SPACE CONFIG — ${new Date().toISOString().split("T")[0]}]
Organization: ${orgName || "Unknown"}
Industry: ${industry || "Unknown"}
Asset: ${assetId}
Expert: ${expertName || "Unknown"}${expertRole ? ` (${expertRole})` : ""}${expertYears ? `, ${expertYears} years` : ""}
Scope rule: This thread is scoped to asset ${assetId}.`;

        await sendMessage(assetThreadId, setupMessage, "Auto");

        if (expertThreadId) {
            await sendMessage(
                expertThreadId,
                `${setupMessage}\nExpert profile key: ${expertName}`,
                "Auto"
            );
        }

        let sopIngested = false;
        let sopTruncated = false;
        if (sopContent) {
            const truncated = truncateSop(sopContent);
            sopTruncated = truncated.truncated;
            const sopMessage = `[SOP INGESTED FROM SETUP — ${new Date().toISOString().split("T")[0]}]
Title: ${sopTitle || "Untitled SOP"}
Asset: ${assetId}

${truncated.content}`;
            await sendMessage(assetThreadId, sopMessage, "Auto");
            sopIngested = true;
        }

        return NextResponse.json({
            configured: true,
            asset_id: assetId,
            asset_thread_id: assetThreadId,
            expert_thread_id: expertThreadId,
            sop_ingested: sopIngested,
            sop_truncated: sopTruncated,
        });
    } catch (error) {
        if (isBackboardTransientError(error)) {
            return NextResponse.json(
                {
                    error: "Setup is temporarily unavailable. Please retry.",
                    retryable: true,
                    degraded: true,
                },
                { status: 503 }
            );
        }

        return NextResponse.json(
            {
                error: "Setup failed",
                retryable: false,
                degraded: true,
                details: getBackboardErrorMessage(error),
            },
            { status: 500 }
        );
    }
}
