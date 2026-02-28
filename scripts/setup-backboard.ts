/**
 * LORE — Backboard Setup Script
 *
 * Run ONCE to create the Lore assistant and all aircraft/technician threads.
 * Outputs the env vars to add to .env.local and Vercel.
 *
 * Usage:
 *   npx tsx scripts/setup-backboard.ts
 */

import { createAssistant, createThread } from "../lib/backboard";
import { SYNTHESIS_PROMPT } from "../lib/prompts";

const AIRCRAFT = ["F-GKXA", "F-HBXA"];
const TECHNICIANS = ["Marc", "Default"];

async function main() {
  console.log("Setting up Backboard for Lore...\n");

  // 1. Create the Lore assistant
  console.log("Creating Lore assistant...");
  const assistantId = await createAssistant(
    "Lore",
    SYNTHESIS_PROMPT,
    "gpt-4o"
  );
  console.log(`  BACKBOARD_ASSISTANT_ID=${assistantId}`);

  // 2. Create threads for each aircraft
  const envLines: string[] = [
    `BACKBOARD_ASSISTANT_ID=${assistantId}`,
    "",
    "# Aircraft threads",
  ];

  for (const tail of AIRCRAFT) {
    console.log(`Creating thread for aircraft ${tail}...`);
    const threadId = await createThread(assistantId);
    const envKey = `BACKBOARD_THREAD_${tail.replace(/-/g, "_")}`;
    envLines.push(`${envKey}=${threadId}`);
    console.log(`  ${envKey}=${threadId}`);
  }

  // 3. Create threads for each technician
  envLines.push("", "# Technician threads");

  for (const tech of TECHNICIANS) {
    console.log(`Creating thread for technician ${tech}...`);
    const threadId = await createThread(assistantId);
    const envKey = `BACKBOARD_THREAD_${tech.toUpperCase().replace(/ /g, "_")}`;
    envLines.push(`${envKey}=${threadId}`);
    console.log(`  ${envKey}=${threadId}`);
  }

  // 4. Print env vars to add
  console.log("\n─────────────────────────────────────");
  console.log("Add these to .env.local AND Vercel:\n");
  console.log(envLines.join("\n"));
  console.log("─────────────────────────────────────\n");
  console.log("Done. Now run: npm run seed-backboard to populate Marc's knowledge.");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
