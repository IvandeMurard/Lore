/**
 * LORE — Backboard Knowledge Seeder
 *
 * Seeds Marc's oral knowledge into Backboard threads via /api/capture.
 * Run AFTER setup-backboard.ts and AFTER the dev server is running.
 *
 * Usage:
 *   npm run dev        (in one terminal)
 *   npm run seed-backboard  (in another terminal)
 */

import marcKnowledge from "../data/marc-knowledge.json";

const API_BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

async function seedEntry(entry: {
  technician: string;
  date: string;
  aircraft: string;
  component: string;
  conditions: string;
  knowledge: string;
}) {
  const res = await fetch(`${API_BASE}/api/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript: entry.knowledge,
      technician: entry.technician,
      tail: entry.aircraft,
      component: entry.component,
      conditions: entry.conditions,
    }),
  });

  if (!res.ok) {
    throw new Error(`Seed failed for ${entry.aircraft}/${entry.component}: ${res.status}`);
  }

  const data = await res.json();
  return data.confirmation;
}

async function main() {
  console.log(`Seeding ${marcKnowledge.length} knowledge entries into Backboard...\n`);

  for (const entry of marcKnowledge) {
    try {
      const confirmation = await seedEntry(entry);
      console.log(`✓ ${entry.aircraft} / ${entry.component}`);
      console.log(`  → ${confirmation}\n`);
    } catch (err) {
      console.error(`✗ ${entry.aircraft} / ${entry.component}: ${err}\n`);
    }
  }

  console.log("Seeding complete.");
  console.log("Test it: POST /api/query { transcript: 'N1 vibration on F-GKXA', tail: 'F-GKXA' }");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
