import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";

export type TeacherSpeakerIdentifier = {
    speaker: string;
    identifier: string;
};

export type TeacherSpeakerProfile = {
    teacher_key: string;
    display_name: string;
    identifiers: TeacherSpeakerIdentifier[];
    language: "en";
    created_at: string;
    updated_at: string;
    sample_meta: {
        duration_sec: number;
        sample_rate: number;
        channels: number;
    };
};

type StoreShape = {
    version: 1;
    profiles: Record<string, TeacherSpeakerProfile>;
};

export const DEFAULT_TEACHER_KEY = "marc-delaunay";
const DEFAULT_DISPLAY_NAME = "Marc Delaunay";
const DEFAULT_STORE_RELATIVE = "frontend/data/speaker-profiles.local.json";

function getStorePath(): string {
    const overridePath = (process.env.SPEAKER_PROFILE_STORE_PATH ?? "").trim();
    if (overridePath) {
        return path.isAbsolute(overridePath)
            ? overridePath
            : path.resolve(process.cwd(), overridePath);
    }
    return path.resolve(process.cwd(), DEFAULT_STORE_RELATIVE);
}

async function readStore(): Promise<StoreShape> {
    const filePath = getStorePath();
    try {
        const raw = await readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as Partial<StoreShape>;
        if (parsed.version === 1 && parsed.profiles && typeof parsed.profiles === "object") {
            return { version: 1, profiles: parsed.profiles as Record<string, TeacherSpeakerProfile> };
        }
        return { version: 1, profiles: {} };
    } catch {
        return { version: 1, profiles: {} };
    }
}

async function writeStore(store: StoreShape): Promise<void> {
    const filePath = getStorePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function normalizeTeacherKey(value: string | null | undefined): string {
    const candidate = (value ?? "").trim().toLowerCase();
    if (!candidate) return DEFAULT_TEACHER_KEY;
    return candidate.replace(/\s+/g, "-");
}

export function normalizeDisplayName(value: string | null | undefined): string {
    const candidate = (value ?? "").trim();
    return candidate || DEFAULT_DISPLAY_NAME;
}

export async function upsertTeacherProfile(
    profileInput: Omit<TeacherSpeakerProfile, "created_at" | "updated_at">
): Promise<TeacherSpeakerProfile> {
    const store = await readStore();
    const teacherKey = normalizeTeacherKey(profileInput.teacher_key);
    const existing = store.profiles[teacherKey];
    const nowIso = new Date().toISOString();
    const nextProfile: TeacherSpeakerProfile = {
        ...profileInput,
        teacher_key: teacherKey,
        display_name: normalizeDisplayName(profileInput.display_name),
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
    };

    store.profiles[teacherKey] = nextProfile;
    await writeStore(store);
    return nextProfile;
}

export async function getTeacherProfile(
    teacherKey?: string | null
): Promise<TeacherSpeakerProfile | null> {
    const store = await readStore();
    const key = normalizeTeacherKey(teacherKey);
    return store.profiles[key] ?? null;
}

export async function deleteTeacherProfile(teacherKey?: string | null): Promise<boolean> {
    const store = await readStore();
    const key = normalizeTeacherKey(teacherKey);
    if (!store.profiles[key]) return false;
    delete store.profiles[key];
    await writeStore(store);
    return true;
}

export async function clearSpeakerProfileStore(): Promise<void> {
    const filePath = getStorePath();
    try {
        await rm(filePath, { force: true });
    } catch {
        // best effort helper for tests/dev
    }
}
