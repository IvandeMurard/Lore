import { config as loadEnv } from "dotenv";
import { BackboardClient } from "backboard-sdk";

const DEFAULT_ASSISTANT_NAME = "Lore Assistant";
const DEFAULT_SYSTEM_PROMPT = [
    "You are Lore, an aircraft maintenance assistant.",
    "Priority order is strict: SOP documents > oral knowledge > aircraft history.",
    "Never provide instructions that conflict with SOPs.",
    "Keep answers concise and operational for technicians, but conversational across turns.",
    "Continue context from prior turns and do not reset conversation each time.",
    "Ask one brief follow-up question in most turns unless the user asks for a final answer.",
    "If the user asks about the Lore project or product itself, answer directly and ask one short follow-up question.",
    "If maintenance context is missing, ask one clarifying question before high-risk guidance.",
    "Address the current learner as 'you'; do not assume the learner is Marc.",
    "Mention 'Marc' only when explicitly attributing retrieved oral knowledge from Marc.",
    "For maintenance guidance, place follow-up questions before the AMM closing sentence.",
    "For maintenance guidance, end the response with: Always verify the AMM procedure before intervening.",
    "Nothing may follow that sentence — no question, no sign-off.",
    // REFUSAL CONTRACT — mirrors SAFETY_RULES in frontend/lib/prompts.ts.
    // Keep both in sync; frontend/tests/prompt-parity.test.ts fails if they drift.
    "If no source you were given answers the question, say that plainly and add nothing after it. An honest refusal followed by a guess is worse than a refusal.",
    "Never give a figure — threshold, limit, interval, torque, count, duration, temperature — that is not present in the sources you were given or in the technician's own words.",
    "Never answer about one aircraft using another aircraft's record. If the tail number asked about has nothing on file, that is the answer.",
    "Never fall back on general knowledge of the engine type. What you were not given, you do not know.",
    "Naming which document you checked is allowed. Guessing what it contains is not.",
    "Attribute oral knowledge to the named technician and the month. Never write 'a senior technician' without the name.",
    "Never state or imply that other technicians agree, unless two or more sources you were given actually say so.",
    "A refusal on a maintenance question is still maintenance guidance: close it with the AMM sentence like any other answer. Not knowing is exactly when the technician has to go to the manual.",
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

            // Push the current prompt every run. Without this the assistant
            // keeps whatever prompt it was created with, so editing
            // DEFAULT_SYSTEM_PROMPT here changed nothing at runtime — a
            // prompt fix could never reach production.
            await client.updateAssistant(assistant.assistantId, {
                system_prompt: DEFAULT_SYSTEM_PROMPT,
            });
            console.log(
                `[setup-backboard] Synced system prompt to existing assistant ${assistant.assistantId}.`
            );

            return assistant.assistantId;
        } catch (error) {
            console.warn(
                `[setup-backboard] Existing ${ENV_KEY_ASSISTANT} unusable (${error.message || error}), creating a new assistant.`
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
