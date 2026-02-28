import { BackboardClient } from "backboard-sdk";

const apiKey = process.env.BACKBOARD_API_KEY;

if (!apiKey) {
    throw new Error("BACKBOARD_API_KEY is not set.");
}

const backboard = new BackboardClient({ apiKey });

function envThreadKey(key: string): string {
    return `BACKBOARD_THREAD_${key
        .toUpperCase()
        .replace(/-/g, "_")
        .replace(/ /g, "_")}`;
}

export function resolveThreadId(key: string): string {
    const envKey = envThreadKey(key);
    const threadId = process.env[envKey];

    if (!threadId) {
        throw new Error(
            `No Backboard thread found for key "${key}" (${envKey}). Run npm run setup-backboard.`
        );
    }

    return threadId;
}

export function getAssistantId(): string {
    const assistantId = process.env.BACKBOARD_ASSISTANT_ID;
    if (!assistantId) {
        throw new Error("BACKBOARD_ASSISTANT_ID not set. Run npm run setup-backboard.");
    }
    return assistantId;
}

function mapMemoryMode(mode: "Auto" | "ReadOnly" | "Off"): "Auto" | "Readonly" | "off" {
    if (mode === "ReadOnly") return "Readonly";
    if (mode === "Off") return "off";
    return "Auto";
}

export async function sendMessage(
    threadId: string,
    content: string,
    memory: "Auto" | "ReadOnly" | "Off" = "Auto"
): Promise<{ response: string; message_id: string }> {
    const response = await backboard.addMessage(threadId, {
        content,
        memory: mapMemoryMode(memory),
        stream: false,
    });

    if (!("content" in response)) {
        throw new Error("Unexpected streaming response from Backboard.");
    }

    return {
        response: response.content || "",
        message_id: response.messageId || "",
    };
}

export async function countMessages(threadId: string): Promise<number> {
    try {
        const thread = await backboard.getThread(threadId);
        return Array.isArray(thread.messages) ? thread.messages.length : 0;
    } catch {
        return 0;
    }
}

export async function createThread(assistantId: string): Promise<string> {
    const thread = await backboard.createThread(assistantId);
    return thread.threadId;
}

export async function createAssistant(
    name: string,
    instructions: string,
    _model: string = "gpt-4o"
): Promise<string> {
    const assistant = await backboard.createAssistant({
        name,
        system_prompt: instructions,
    });

    return assistant.assistantId;
}
