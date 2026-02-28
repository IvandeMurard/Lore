// ─────────────────────────────────────────────
// LORE — Backboard client
// Replaces lib/qdrant.ts
// One assistant (Lore) + one thread per aircraft or technician
// memory="Auto" → Backboard extracts and persists facts automatically
// ─────────────────────────────────────────────

const BASE = "https://api.backboard.io/v1";
const KEY = process.env.BACKBOARD_API_KEY!;

const headers = () => ({
  "X-API-Key": KEY,
  "Content-Type": "application/json",
});

// ── Thread resolution ─────────────────────────
// Thread IDs are set once (via setup-backboard script) and stored in env:
//   BACKBOARD_THREAD_F_GKXA    → aircraft thread
//   BACKBOARD_THREAD_F_HBXA    → aircraft thread
//   BACKBOARD_THREAD_MARC      → technician thread
//   BACKBOARD_ASSISTANT_ID     → the Lore assistant

export function resolveThreadId(key: string): string {
  const envKey = `BACKBOARD_THREAD_${key.toUpperCase().replace(/-/g, "_").replace(/ /g, "_")}`;
  const id = process.env[envKey];
  if (!id) throw new Error(`No Backboard thread found for key "${key}". Run npm run setup-backboard.`);
  return id;
}

export function getAssistantId(): string {
  const id = process.env.BACKBOARD_ASSISTANT_ID;
  if (!id) throw new Error("BACKBOARD_ASSISTANT_ID not set. Run npm run setup-backboard.");
  return id;
}

// ── Core API calls ────────────────────────────

/**
 * Send a message to a thread and get the assistant's response.
 * memory="Auto" → Backboard extracts and stores relevant facts.
 */
export async function sendMessage(
  threadId: string,
  content: string,
  memory: "Auto" | "ReadOnly" | "Off" = "Auto"
): Promise<{ response: string; message_id: string }> {
  const res = await fetch(`${BASE}/threads/${threadId}/messages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      role: "user",
      content,
      memory,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backboard sendMessage failed: ${res.status} — ${text}`);
  }

  const data = await res.json();

  // Extract the assistant's reply text
  const reply =
    data.response ||
    data.content ||
    data.messages?.find((m: any) => m.role === "assistant")?.content ||
    "";

  return {
    response: reply,
    message_id: data.id || data.message_id || "",
  };
}

/**
 * Count messages in a thread (used for intervention count in /api/log).
 */
export async function countMessages(threadId: string): Promise<number> {
  try {
    const res = await fetch(`${BASE}/threads/${threadId}/messages`, {
      headers: { "X-API-Key": KEY },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.total ?? data.count ?? data.data?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Create a new thread linked to an assistant.
 * Used by setup-backboard script — not called at runtime.
 */
export async function createThread(assistantId: string): Promise<string> {
  const res = await fetch(`${BASE}/assistants/${assistantId}/threads`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`createThread failed: ${res.status}`);
  const data = await res.json();
  return data.id || data.thread_id;
}

/**
 * Create a new assistant with given instructions.
 * Used by setup-backboard script — not called at runtime.
 */
export async function createAssistant(
  name: string,
  instructions: string,
  model: string = "gpt-4o"
): Promise<string> {
  const res = await fetch(`${BASE}/assistants`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name, instructions, model }),
  });
  if (!res.ok) throw new Error(`createAssistant failed: ${res.status}`);
  const data = await res.json();
  return data.id || data.assistant_id;
}
