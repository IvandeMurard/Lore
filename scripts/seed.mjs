/**
 * Lightweight seed script using only fetch (no heavy SDKs).
 * Usage: node scripts/seed.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// Load env manually (no dotenv needed)
const envContent = readFileSync(resolve(rootDir, ".env.local"), "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...valueParts] = trimmed.split("=");
    env[key.trim()] = valueParts.join("=").trim();
});

const OPENAI_API_KEY = env.OPENAI_API_KEY;
const QDRANT_URL = env.QDRANT_URL;
const QDRANT_API_KEY = env.QDRANT_API_KEY;

const EMBEDDING_DIM = 1536;

// ---- Helpers ----

async function embed(text) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: "text-embedding-3-small",
            input: text,
        }),
    });
    const data = await res.json();
    if (!data.data || !data.data[0]) {
        throw new Error(`Embedding failed: ${JSON.stringify(data)}`);
    }
    return data.data[0].embedding;
}

async function qdrantRequest(method, path, body) {
    const res = await fetch(`${QDRANT_URL}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "api-key": QDRANT_API_KEY,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return res.json();
}

async function ensureCollection(name) {
    // Try to delete first
    await qdrantRequest("DELETE", `/collections/${name}`).catch(() => { });
    console.log(`  Reset collection: ${name}`);

    // Create
    await qdrantRequest("PUT", `/collections/${name}`, {
        vectors: { size: EMBEDDING_DIM, distance: "Cosine" },
    });
    console.log(`  Created collection: ${name}`);
}

async function upsert(collection, id, vector, payload) {
    await qdrantRequest("PUT", `/collections/${collection}/points`, {
        points: [{ id, vector, payload }],
    });
}

// ---- Seeders ----

async function seedOralKnowledge() {
    console.log("\n📚 Seeding Marc's oral knowledge...");

    const data = JSON.parse(
        readFileSync(resolve(rootDir, "data/marc-knowledge.json"), "utf-8")
    );

    for (let i = 0; i < data.length; i++) {
        const entry = data[i];
        const text = `${entry.knowledge} | Aircraft: ${entry.aircraft} | Component: ${entry.component} | Conditions: ${entry.conditions}`;
        const vector = await embed(text);
        const id = crypto.randomUUID();

        await upsert("oral_knowledge", id, vector, {
            knowledge: entry.knowledge,
            technician: entry.technician,
            aircraft: entry.aircraft,
            component: entry.component,
            conditions: entry.conditions,
            confidence: entry.confidence,
            date: entry.date,
        });

        console.log(`  ✓ [${i + 1}/${data.length}] ${entry.aircraft} — ${entry.component}`);
    }

    console.log(`  Done: ${data.length} entries.`);
}

function chunkText(text, chunkSize = 800) {
    const chunks = [];
    // Split by sections (double newline) instead of character count for better semantics
    const sections = text.split(/\n\n+/);
    let current = "";

    for (const section of sections) {
        if (current.length + section.length > chunkSize && current.length > 0) {
            chunks.push(current.trim());
            current = section;
        } else {
            current += "\n\n" + section;
        }
    }
    if (current.trim().length > 20) {
        chunks.push(current.trim());
    }

    return chunks;
}

async function seedSOPs() {
    console.log("\n📋 Seeding SOP chunks...");

    const sopFiles = [
        { path: "data/sops/cfm56-5b-72-21.txt", id: "72-21-00" },
        { path: "data/sops/cfm56-5b-72-00.txt", id: "72-00-00" },
    ];

    let total = 0;

    for (const sop of sopFiles) {
        const content = readFileSync(resolve(rootDir, sop.path), "utf-8");
        const chunks = chunkText(content);
        console.log(`  SOP ${sop.id}: ${chunks.length} chunks`);

        for (let i = 0; i < chunks.length; i++) {
            const vector = await embed(chunks[i]);
            await upsert("sop_chunks", crypto.randomUUID(), vector, {
                text: chunks[i],
                sop_id: sop.id,
                chunk_index: i,
            });
            total++;
            console.log(`    ✓ ${i + 1}/${chunks.length}`);
        }
    }

    console.log(`  Done: ${total} chunks.`);
}

// ---- Main ----

async function main() {
    console.log("🚀 Lore Seed Script (lightweight)\n");

    console.log("📦 Collections...");
    await ensureCollection("oral_knowledge");
    await ensureCollection("aircraft_history");
    await ensureCollection("sop_chunks");

    await seedOralKnowledge();
    await seedSOPs();

    console.log("\n✅ Done!");
}

main().catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
});
