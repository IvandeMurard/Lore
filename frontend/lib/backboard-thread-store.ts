import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

type ThreadStoreEntry = {
    key: string;
    thread_id: string;
    created_at: string;
    updated_at: string;
};

type ThreadStoreShape = {
    version: 1;
    threads: Record<string, ThreadStoreEntry>;
};

const DEFAULT_STORE_FILE = "backboard-threads.local.json";
const LEGACY_STORE_RELATIVE = "frontend/data/backboard-threads.local.json";

function getDefaultStorePath(): string {
    const cwd = process.cwd();
    const cwdBase = path.basename(cwd).toLowerCase();
    if (cwdBase === "frontend") {
        return path.resolve(cwd, "data", DEFAULT_STORE_FILE);
    }
    return path.resolve(cwd, "frontend", "data", DEFAULT_STORE_FILE);
}

function getStorePath(): string {
    const override = (process.env.BACKBOARD_THREAD_STORE_PATH ?? "").trim();
    if (!override) {
        return getDefaultStorePath();
    }
    return path.isAbsolute(override)
        ? override
        : path.resolve(process.cwd(), override);
}

function getLegacyStorePath(): string {
    return path.resolve(process.cwd(), LEGACY_STORE_RELATIVE);
}

export function normalizeThreadKey(value: string | null | undefined): string {
    return (value ?? "").trim().toUpperCase().replace(/\s+/g, "_");
}

async function readStore(): Promise<ThreadStoreShape> {
    const primaryPath = getStorePath();
    const candidatePaths = [primaryPath];
    const legacyPath = getLegacyStorePath();
    if (legacyPath !== primaryPath) {
        candidatePaths.push(legacyPath);
    }

    for (const storePath of candidatePaths) {
        try {
            const raw = await readFile(storePath, "utf8");
            const parsed = JSON.parse(raw) as Partial<ThreadStoreShape>;
            if (parsed.version === 1 && parsed.threads && typeof parsed.threads === "object") {
                return { version: 1, threads: parsed.threads as Record<string, ThreadStoreEntry> };
            }
        } catch {
            // try next candidate path
        }
    }
    return { version: 1, threads: {} };
}

async function writeStore(store: ThreadStoreShape): Promise<void> {
    const storePath = getStorePath();
    await mkdir(path.dirname(storePath), { recursive: true });
    await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function getStoredThreadId(key: string): Promise<string | null> {
    const normalized = normalizeThreadKey(key);
    if (!normalized) return null;
    const store = await readStore();
    return store.threads[normalized]?.thread_id ?? null;
}

export async function setStoredThreadId(key: string, threadId: string): Promise<void> {
    const normalized = normalizeThreadKey(key);
    const cleanThreadId = (threadId ?? "").trim();
    if (!normalized || !cleanThreadId) return;

    const store = await readStore();
    const now = new Date().toISOString();
    const existing = store.threads[normalized];

    store.threads[normalized] = {
        key: normalized,
        thread_id: cleanThreadId,
        created_at: existing?.created_at ?? now,
        updated_at: now,
    };

    await writeStore(store);
}
