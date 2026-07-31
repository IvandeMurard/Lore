// ─────────────────────────────────────────────
// LORE — LLM Configuration
// Central config for all LLM calls.
// ─────────────────────────────────────────────

import OpenAI from "openai";
import { enforceSopPrimacy } from "./sop-primacy";
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
/**
 * `temperature` is overridable so evals can run deterministically without
 * changing what production does. At the default 0.5 the pass rate moves
 * run to run, which makes a prompt fix indistinguishable from sampling
 * noise; the eval harness passes 0.
 */
export async function synthesizeResponse(
  question: string,
  sources: { sop: string[]; oral: string[]; history: string[] },
  options: { temperature?: number } = {}
) {
  // Deliberately NOT injecting lib/bands.ts output here. Tried and reverted:
  // stating the computed band in the context fixed the boundary cases and
  // broke others, because a long normative block perturbs every answer rather
  // than the one property it targets. Measured: 61/64 with a bare band, then
  // 58/64 once the conditional caveats were added, against 53/53 at baseline.
  //
  // Bands are used as a grading oracle instead — see evals/graders.ts
  // gradeBandClassification. Guaranteeing that a wrong band is *detected* is
  // worth more than hoping a longer prompt prevents it.
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

  const temperature = options.temperature ?? LLM_CONFIG.synthesis.temperature;

  const res = await openai.chat.completions.create({
    model: LLM_CONFIG.model,
    temperature,
    max_tokens: LLM_CONFIG.synthesis.max_tokens,
    messages: [
      { role: "system", content: SYNTHESIS_PROMPT },
      { role: "user", content: context },
    ],
  });

  const draft = res.choices[0].message.content ?? "";

  // SOP primacy is enforced here rather than requested in the prompt. Only
  // answers that actually contradict a computable AMM rule are touched, so
  // the other cases are left exactly as generated — the mistake made by
  // injecting a normative block before generation.
  const outcome = await enforceSopPrimacy(question, draft, async (correction) => {
    const retry = await openai.chat.completions.create({
      model: LLM_CONFIG.model,
      temperature,
      max_tokens: LLM_CONFIG.synthesis.max_tokens,
      messages: [
        { role: "system", content: SYNTHESIS_PROMPT },
        { role: "user", content: context },
        { role: "assistant", content: draft },
        { role: "user", content: correction },
      ],
    });
    return retry.choices[0].message.content ?? "";
  });

  if (outcome.status !== "clean") {
    console.warn(
      `[synthesis] SOP primacy ${outcome.status}: ${outcome.contradictions.join(" | ")}`
    );
  }

  return outcome.response;
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
