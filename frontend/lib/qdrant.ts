import { QdrantClient } from "@qdrant/js-client-rest";

// Initialize Qdrant client
const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL!,
    apiKey: process.env.QDRANT_API_KEY!,
});

// Collection names
export const COLLECTIONS = {
    ORAL_KNOWLEDGE: "oral_knowledge",
    AIRCRAFT_HISTORY: "aircraft_history",
    SOP_CHUNKS: "sop_chunks",
} as const;

// Embedding dimension (OpenAI text-embedding-3-small)
const EMBEDDING_DIM = 1536;

/**
 * Ensure all required collections exist in Qdrant.
 */
export async function ensureCollections() {
    for (const name of Object.values(COLLECTIONS)) {
        const exists = await qdrant
            .getCollection(name)
            .then(() => true)
            .catch(() => false);

        if (!exists) {
            await qdrant.createCollection(name, {
                vectors: {
                    size: EMBEDDING_DIM,
                    distance: "Cosine",
                },
            });
            console.log(`Created collection: ${name}`);
        }
    }
}

/**
 * Upsert a point into a Qdrant collection.
 */
export async function upsertPoint(
    collection: string,
    id: string,
    vector: number[],
    payload: Record<string, unknown>
) {
    await qdrant.upsert(collection, {
        points: [
            {
                id,
                vector,
                payload,
            },
        ],
    });
}

/**
 * Semantic search in a Qdrant collection.
 */
export async function searchPoints(
    collection: string,
    vector: number[],
    limit: number = 5,
    filter?: Record<string, unknown>
) {
    const results = await qdrant.search(collection, {
        vector,
        limit,
        with_payload: true,
        ...(filter ? { filter } : {}),
    });
    return results;
}

/**
 * Count points in a collection (with optional filter).
 */
export async function countPoints(
    collection: string,
    filter?: Record<string, unknown>
) {
    const result = await qdrant.count(collection, {
        exact: true,
        ...(filter ? { filter } : {}),
    });
    return result.count;
}

export default qdrant;
