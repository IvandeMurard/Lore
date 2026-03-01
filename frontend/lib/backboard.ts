import { BackboardClient } from "backboard-sdk";

const apiKey = process.env.BACKBOARD_API_KEY;
const RETRY_BASE_DELAY_MS = 400;
const RETRY_MAX_ATTEMPTS = 3;

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

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

type BackboardErrorLike = {
    statusCode?: number;
    message?: string;
};

function getStatusCode(error: unknown): number | undefined {
    if (typeof error === "object" && error !== null && "statusCode" in error) {
        const code = (error as BackboardErrorLike).statusCode;
        return typeof code === "number" ? code : undefined;
    }
    return undefined;
}

function isRetryableBackboardError(error: unknown): boolean {
    const statusCode = getStatusCode(error);
    if (statusCode === 429) return true;
    if (typeof statusCode === "number" && statusCode >= 500) return true;

    const message = String(
        typeof error === "object" && error !== null && "message" in error
            ? (error as BackboardErrorLike).message
            : error
    ).toLowerCase();

    return (
        message.includes("bad gateway") ||
        message.includes("gateway") ||
        message.includes("timeout") ||
        message.includes("temporar") ||
        message.includes("fetch failed") ||
        message.includes("ecconnreset") ||
        message.includes("econnreset")
    );
}

export async function sendMessage(
    threadId: string,
    content: string,
    memory: "Auto" | "ReadOnly" | "Off" = "Auto"
): Promise<{ response: string; message_id: string }> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt += 1) {
        try {
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
        } catch (error) {
            lastError = error;
            const shouldRetry =
                attempt < RETRY_MAX_ATTEMPTS && isRetryableBackboardError(error);

            if (!shouldRetry) {
                throw error;
            }

            const jitterMs = Math.floor(Math.random() * 150);
            const backoffMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + jitterMs;
            console.warn(
                `[backboard] addMessage attempt ${attempt}/${RETRY_MAX_ATTEMPTS} failed; retrying in ${backoffMs}ms`,
                error
            );
            await delay(backoffMs);
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error("Backboard request failed after retries.");
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
