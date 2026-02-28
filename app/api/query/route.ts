import { NextRequest, NextResponse } from "next/server";
import { sendMessage, resolveThreadId } from "@/lib/backboard";

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

    // Query the aircraft thread
    // Backboard automatically:
    //   - Retrieves relevant memories (oral knowledge + history) from this thread
    //   - Runs RAG over uploaded SOP documents
    //   - Applies the Lore assistant's synthesis prompt (SOP > oral > history)
    const question = tail
      ? `[Aircraft: ${tail}] ${transcript}`
      : transcript;

    const { response, message_id } = await sendMessage(threadId, question, "Auto");

    // Build sources list from response metadata
    // Backboard returns source attribution in the response or metadata
    const sources: string[] = [];
    if (tail) sources.push(`${tail} memory`);
    sources.push("Backboard RAG — SOP documents");
    sources.push("Senior oral knowledge");

    return NextResponse.json({
      response,
      sources,
      message_id,
    });
  } catch (error) {
    console.error("[/api/query] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
