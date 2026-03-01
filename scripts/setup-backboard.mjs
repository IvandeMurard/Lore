import { config as loadEnv } from "dotenv";
import { BackboardClient } from "backboard-sdk";

const DEFAULT_ASSISTANT_NAME = "Lore Assistant";
const DEFAULT_SYSTEM_PROMPT = [
    "You are Lore, an aircraft maintenance assistant.",
    "Priority order is strict: SOP documents > oral knowledge > aircraft history.",
    "Never provide instructions that conflict with SOPs.",
    "Keep answers concise and operational for technicians.",
    "Always end every advisory response with: Always verify the AMM procedure before intervening.",
].join(" ");

const ENV_KEY_ASSISTANT = "BACKBOARD_ASSISTANT_ID";
const ENV_KEY_THREAD_F_GKXA = "BACKBOARD_THREAD_F_GKXA";
const ENV_KEY_THREAD_F_HBXA = "BACKBOARD_THREAD_F_HBXA";
const ENV_KEY_THREAD_MARC = "BACKBOARD_THREAD_MARC_DELAUNAY";
const FRONTEND_ENV_PATH = "frontend/.env.local";
const ROOT_ENV_PATH = ".env.local";

function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}

async function ensureAssistant(client) {
    const existingId = process.env[ENV_KEY_ASSISTANT];
    if (existingId) {
        try {
            const assistant = await client.getAssistant(existingId);
            return assistant.assistantId;
        } catch {
            console.warn(
                `[setup-backboard] Existing ${ENV_KEY_ASSISTANT} is invalid, creating a new assistant.`
            );
        }
    }

    const assistant = await client.createAssistant({
        name: DEFAULT_ASSISTANT_NAME,
        system_prompt: DEFAULT_SYSTEM_PROMPT,
    });

    return assistant.assistantId;
}

async function ensureThread(client, assistantId, envKey) {
    const existingId = process.env[envKey];
    if (existingId) {
        try {
            const thread = await client.getThread(existingId);
            return thread.threadId;
        } catch {
            console.warn(
                `[setup-backboard] Existing ${envKey} is invalid, creating a new thread.`
            );
        }
    }

    const thread = await client.createThread(assistantId);
    return thread.threadId;
}

async function main() {
    // Runtime source of truth: frontend/.env.local
    // Fallback for compatibility: root .env.local
    loadEnv({ path: FRONTEND_ENV_PATH });
    loadEnv({ path: ROOT_ENV_PATH });

    const apiKey = requireEnv("BACKBOARD_API_KEY");

    const client = new BackboardClient({ apiKey });

    const assistantId = await ensureAssistant(client);

    const threadFgkxa = await ensureThread(
        client,
        assistantId,
        ENV_KEY_THREAD_F_GKXA
    );
    const threadFhbxa = await ensureThread(
        client,
        assistantId,
        ENV_KEY_THREAD_F_HBXA
    );
    const threadMarc = await ensureThread(client, assistantId, ENV_KEY_THREAD_MARC);

    console.log(`\nCopy these to ${FRONTEND_ENV_PATH} and Vercel:\n`);
    console.log(`${ENV_KEY_ASSISTANT}=${assistantId}`);
    console.log(`${ENV_KEY_THREAD_F_GKXA}=${threadFgkxa}`);
    console.log(`${ENV_KEY_THREAD_F_HBXA}=${threadFhbxa}`);
    console.log(`${ENV_KEY_THREAD_MARC}=${threadMarc}`);
    console.log("");
}

main().catch((error) => {
    console.error("[setup-backboard] Failed:", error.message || error);
    process.exit(1);
});
