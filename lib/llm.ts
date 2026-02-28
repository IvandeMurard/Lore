// ─────────────────────────────────────────────
// LORE — LLM Configuration
// Central config for all LLM calls.
// ─────────────────────────────────────────────

import OpenAI from "openai";
import {
  ORCHESTRATOR_PROMPT,
  ELICITATION_PROMPT,
  SYNTHESIS_PROMPT,
  LOG_PROMPT,
} from "./prompts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── LLM PARAMETERS ───────────────────────────
// Temperature controls creativity vs determinism.
// 0 = always the same answer (good for classification/extraction)
// 1 = creative (good for natural speech)

const LLM_CONFIG = {
  model: "gpt-4o",

  orchestrator: { temperature: 0,   max_tokens: 150  }, // deterministic classification
  elicitation:  { temperature: 0.3, max_tokens: 200  }, // structured but natural
  synthesis:    { temperature: 0.5, max_tokens: 300  }, // natural spoken response
  log:          { temperature: 0,   max_tokens: 200  }, // deterministic extraction
};

// ── ORCHESTRATOR ─────────────────────────────
export async function classifyIntent(transcript: string) {
  const res = await openai.chat.completions.create({
    model: LLM_CONFIG.model,
    temperature: LLM_CONFIG.orchestrator.temperature,
    max_tokens: LLM_CONFIG.orchestrator.max_tokens,
    messages: [
      { role: "system", content: ORCHESTRATOR_PROMPT },
      { role: "user", content: transcript },
    ],
    response_format: { type: "json_object" },
  });

  return JSON.parse(res.choices[0].message.content ?? "{}");
}

// ── SYNTHESIS (Query response) ────────────────
export async function synthesizeResponse(
  question: string,
  sources: { sop: string[]; oral: string[]; history: string[] }
) {
  const context = `
SOP EXCERPTS:
${sources.sop.join("\n---\n") || "No relevant SOP found."}

SENIOR ORAL KNOWLEDGE:
${sources.oral.join("\n---\n") || "No relevant senior knowledge found."}

AIRCRAFT HISTORY:
${sources.history.join("\n---\n") || "No relevant aircraft history found."}

TECHNICIAN QUESTION:
${question}
`.trim();

  const res = await openai.chat.completions.create({
    model: LLM_CONFIG.model,
    temperature: LLM_CONFIG.synthesis.temperature,
    max_tokens: LLM_CONFIG.synthesis.max_tokens,
    messages: [
      { role: "system", content: SYNTHESIS_PROMPT },
      { role: "user", content: context },
    ],
  });

  return res.choices[0].message.content ?? "";
}

// ── ELICITATION (Capture knowledge) ──────────
export async function elicitKnowledge(transcript: string, technicianName: string) {
  const res = await openai.chat.completions.create({
    model: LLM_CONFIG.model,
    temperature: LLM_CONFIG.elicitation.temperature,
    max_tokens: LLM_CONFIG.elicitation.max_tokens,
    messages: [
      { role: "system", content: ELICITATION_PROMPT },
      {
        role: "user",
        content: `Technician: ${technicianName}\nStatement: ${transcript}`,
      },
    ],
  });

  return res.choices[0].message.content ?? "";
}

// ── LOG EXTRACTION ────────────────────────────
export async function extractLogEntry(transcript: string) {
  const res = await openai.chat.completions.create({
    model: LLM_CONFIG.model,
    temperature: LLM_CONFIG.log.temperature,
    max_tokens: LLM_CONFIG.log.max_tokens,
    messages: [
      { role: "system", content: LOG_PROMPT },
      { role: "user", content: transcript },
    ],
    response_format: { type: "json_object" },
  });

  return JSON.parse(res.choices[0].message.content ?? "{}");
}
