/**
 * Seed Script — Populates Qdrant with Marc's oral knowledge and SOP chunks.
 *
 * Usage: npx tsx scripts/seed.ts
 *
 * Requires: OPENAI_API_KEY, QDRANT_URL, QDRANT_API_KEY in .env.local
 */

import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";

// Load .env.local
config({ path: resolve(process.cwd(), ".env.local") });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL!,
    apiKey: process.env.QDRANT_API_KEY!,
});

const EMBEDDING_DIM = 1536;

const COLLECTIONS = {
    ORAL_KNOWLEDGE: "oral_knowledge",
    AIRCRAFT_HISTORY: "aircraft_history",
    SOP_CHUNKS: "sop_chunks",
};

async function embed(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
    });
    return response.data[0].embedding;
}

async function ensureCollection(name: string) {
    const exists = await qdrant
        .getCollection(name)
        .then(() => true)
        .catch(() => false);

    if (exists) {
        // Delete and recreate for clean seed
        await qdrant.deleteCollection(name);
        console.log(`  Deleted existing collection: ${name}`);
    }

    await qdrant.createCollection(name, {
        vectors: {
            size: EMBEDDING_DIM,
            distance: "Cosine",
        },
    });
    console.log(`  Created collection: ${name}`);
}

async function seedOralKnowledge() {
    console.log("\n📚 Seeding Marc's oral knowledge...");

    const data = JSON.parse(
        readFileSync(resolve(process.cwd(), "data/marc-knowledge.json"), "utf-8")
    );

    for (let i = 0; i < data.length; i++) {
        const entry = data[i];
        const text = `${entry.knowledge} | Aircraft: ${entry.aircraft} | Component: ${entry.component} | Conditions: ${entry.conditions}`;
        const vector = await embed(text);

        await qdrant.upsert(COLLECTIONS.ORAL_KNOWLEDGE, {
            points: [
                {
                    id: crypto.randomUUID(),
                    vector,
                    payload: {
                        knowledge: entry.knowledge,
                        technician: entry.technician,
                        aircraft: entry.aircraft,
                        component: entry.component,
                        conditions: entry.conditions,
                        confidence: entry.confidence,
                        date: entry.date,
                    },
                },
            ],
        });

        console.log(
            `  ✓ [${i + 1}/${data.length}] ${entry.aircraft} — ${entry.component}`
        );
    }

    console.log(`  Done: ${data.length} knowledge entries seeded.`);
}

function chunkText(text: string, chunkSize: number = 800, overlap: number = 50): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push(text.slice(start, end).trim());
        start = end - overlap;
        if (start >= text.length) break;
    }

    return chunks.filter((c) => c.length > 20);
}

async function seedSOPs() {
    console.log("\n📋 Seeding SOP chunks...");

    const sopFiles = [
        { path: "data/sops/cfm56-5b-72-21.txt", id: "72-21-00" },
        { path: "data/sops/cfm56-5b-72-00.txt", id: "72-00-00" },
    ];

    let totalChunks = 0;

    for (const sop of sopFiles) {
        const content = readFileSync(resolve(process.cwd(), sop.path), "utf-8");
        const chunks = chunkText(content);
        console.log(`  Processing SOP ${sop.id}: ${chunks.length} chunks...`);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const vector = await embed(chunk);

            await qdrant.upsert(COLLECTIONS.SOP_CHUNKS, {
                points: [
                    {
                        id: crypto.randomUUID(),
                        vector,
                        payload: {
                            text: chunk,
                            sop_id: sop.id,
                            chunk_index: i,
                            source_file: sop.path,
                        },
                    },
                ],
            });

            totalChunks++;
            console.log(`    ✓ chunk ${i + 1}/${chunks.length}`);
            // Small delay to help with memory pressure
            await new Promise((r) => setTimeout(r, 100));
        }

        console.log(`  ✓ SOP ${sop.id}: ${chunks.length} chunks done`);
    }

    console.log(`  Done: ${totalChunks} SOP chunks seeded.`);
}

async function main() {
    console.log("🚀 Lore Seed Script");
    console.log("===================\n");

    // Ensure collections exist
    console.log("📦 Setting up Qdrant collections...");
    await ensureCollection(COLLECTIONS.ORAL_KNOWLEDGE);
    await ensureCollection(COLLECTIONS.AIRCRAFT_HISTORY);
    await ensureCollection(COLLECTIONS.SOP_CHUNKS);

    // Seed data
    await seedOralKnowledge();
    await seedSOPs();

    console.log("\n✅ All data seeded successfully!");
    console.log(
        "   Run your query endpoint to test: curl -X POST http://localhost:3000/api/query -H 'Content-Type: application/json' -d '{\"transcript\": \"N1 vibration on F-GKXA CFM56 fan section\", \"tail\": \"F-GKXA\"}'"
    );
}

main().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
