import { BackboardClient } from "backboard-sdk";

const apiKey = process.env.BACKBOARD_API_KEY;
const RETRY_BASE_DELAY_MS = 350;
const GENERATED_SOP_TAG = "[GENERATED SOP DRAFT";
const SOP_MARKDOWN_TAG = "SOP Markdown:";

export type MemoryMode = "Auto" | "ReadOnly" | "Off";

export const BACKBOARD_QUERY_POLICY = {
    timeoutMs: 12_000,
    maxAttempts: 2,
} as const;

if (!apiKey) {
    throw new Error("BACKBOARD_API_KEY is not set.");
}

const backboard = new BackboardClient({ apiKey });

type BackboardErrorLike = {
    statusCode?: number;
    message?: string;
};

export type SendMessageOptions = {
    timeoutMs?: number;
    maxAttempts?: number;
};

export type PersistTarget = {
    key: string;
    label: string;
    content: string;
    memory?: MemoryMode;
};

export type PersistFailure = {
    target: string;
    reason: string;
    retryable: boolean;
};

export type PersistResult = {
    stored: boolean;
    stored_targets: string[];
    failed_targets: PersistFailure[];
    degraded: boolean;
};

class BackboardTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`Backboard request timed out after ${timeoutMs}ms.`);
        this.name = "BackboardTimeoutError";
    }
}

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

function mapMemoryMode(mode: MemoryMode): "Auto" | "Readonly" | "off" {
    if (mode === "ReadOnly") return "Readonly";
    if (mode === "Off") return "off";
    return "Auto";
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
    if (!timeoutMs || timeoutMs <= 0) {
        return promise;
    }

    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            setTimeout(() => reject(new BackboardTimeoutError(timeoutMs)), timeoutMs);
        }),
    ]);
}

export function getBackboardStatusCode(error: unknown): number | undefined {
    if (typeof error === "object" && error !== null && "statusCode" in error) {
        const code = (error as BackboardErrorLike).statusCode;
        return typeof code === "number" ? code : undefined;
    }
    return undefined;
}

export function getBackboardErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (typeof error === "object" && error !== null && "message" in error) {
        const maybeMessage = (error as BackboardErrorLike).message;
        if (typeof maybeMessage === "string" && maybeMessage.trim()) {
            return maybeMessage;
        }
    }
    return String(error);
}

function isNetworkTimeoutMessage(message: string): boolean {
    return (
        message.includes("timeout") ||
        message.includes("timed out") ||
        message.includes("network") ||
        message.includes("fetch failed") ||
        message.includes("econnreset") ||
        message.includes("etimedout") ||
        message.includes("socket hang up")
    );
}

export function isBackboardTransientError(error: unknown): boolean {
    const statusCode = getBackboardStatusCode(error);
    if (statusCode === 429) return true;
    if (typeof statusCode === "number" && statusCode >= 500) return true;

    return isNetworkTimeoutMessage(getBackboardErrorMessage(error).toLowerCase());
}

export function isBackboardTimeoutError(error: unknown): boolean {
    return (
        error instanceof BackboardTimeoutError ||
        isNetworkTimeoutMessage(getBackboardErrorMessage(error).toLowerCase())
    );
}

export async function sendMessage(
    threadId: string,
    content: string,
    memory: MemoryMode = "Auto",
    options?: SendMessageOptions
): Promise<{ response: string; message_id: string }> {
    const maxAttempts = Math.max(1, options?.maxAttempts ?? 1);
    const timeoutMs = options?.timeoutMs;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const response = await withTimeout(
                backboard.addMessage(threadId, {
                    content,
                    memory: mapMemoryMode(memory),
                    stream: false,
                }),
                timeoutMs
            );

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
                attempt < maxAttempts && isBackboardTransientError(error);

            if (!shouldRetry) {
                throw error;
            }

            const jitterMs = Math.floor(Math.random() * 150);
            const backoffMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + jitterMs;
            console.warn(
                `[backboard] addMessage attempt ${attempt}/${maxAttempts} failed; retrying in ${backoffMs}ms`,
                error
            );
            await delay(backoffMs);
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error("Backboard request failed after retries.");
}

export async function sendQueryMessage(
    threadId: string,
    content: string
): Promise<{ response: string; message_id: string }> {
    return sendMessage(threadId, content, "ReadOnly", BACKBOARD_QUERY_POLICY);
}

export async function persistMessages(targets: PersistTarget[]): Promise<PersistResult> {
    const writes = await Promise.all(
        targets.map(async (target) => {
            try {
                const threadId = resolveThreadId(target.key);
                await sendMessage(threadId, target.content, target.memory ?? "Auto");
                return { target: target.label, ok: true as const };
            } catch (error) {
                const reason =
                    getBackboardErrorMessage(error).slice(0, 220) || "Unknown persistence failure.";
                return {
                    target: target.label,
                    ok: false as const,
                    reason,
                    retryable: isBackboardTransientError(error),
                };
            }
        })
    );

    const stored_targets = writes.filter((w) => w.ok).map((w) => w.target);
    const failed_targets = writes
        .filter((w) => !w.ok)
        .map((w) => ({
            target: w.target,
            reason: w.reason,
            retryable: w.retryable,
        }));

    return {
        stored: stored_targets.length > 0,
        stored_targets,
        failed_targets,
        degraded: failed_targets.length > 0,
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

function toMessageText(value: unknown): string {
    if (typeof value === "string") {
        return value.trim();
    }

    if (Array.isArray(value)) {
        return value
            .map((item) => toMessageText(item))
            .filter(Boolean)
            .join("\n")
            .trim();
    }

    if (typeof value === "object" && value !== null) {
        const record = value as Record<string, unknown>;
        const direct =
            (typeof record.text === "string" && record.text) ||
            (typeof record.content === "string" && record.content) ||
            (typeof record.value === "string" && record.value) ||
            "";
        if (direct.trim()) return direct.trim();

        const nested =
            toMessageText(record.text) ||
            toMessageText(record.content) ||
            toMessageText(record.value);
        if (nested) return nested.trim();
    }

    return "";
}

function trimForSourceDetails(text: string, maxChars = 5000): string {
    const normalized = text.trim();
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars)}\n\n[truncated]`;
}

function extractSopMarkdownFromMessage(messageText: string): string {
    const tagIndex = messageText.indexOf(SOP_MARKDOWN_TAG);
    if (tagIndex === -1) return messageText.trim();
    return messageText.slice(tagIndex + SOP_MARKDOWN_TAG.length).trim();
}

export async function getLatestGeneratedSopDraftSource(
    threadId: string
): Promise<string | null> {
    try {
        const thread = await backboard.getThread(threadId);
        const messages = Array.isArray(thread.messages) ? thread.messages : [];

        for (let i = messages.length - 1; i >= 0; i -= 1) {
            const message = messages[i] as { content?: unknown } | null;
            const messageText = toMessageText(message?.content);
            if (!messageText || !messageText.includes(GENERATED_SOP_TAG)) {
                continue;
            }

            const markdown = extractSopMarkdownFromMessage(messageText);
            if (!markdown) continue;
            return trimForSourceDetails(markdown);
        }
    } catch {
        return null;
    }

    return null;
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
