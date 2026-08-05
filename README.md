# Lore

> The knowledge retiring technicians carry isn't in any manual.

**Lore** is a voice AI mentor that captures the tacit expertise of senior technicians and delivers it to junior technicians on the shop floor. Hands dirty, no screen. Just ask.

Built at the **Activate Your Voice Hackathon** — Speechmatics × The AI Collective Paris
Track 1: Communication & Human Experience · February 28 – March 1, 2026

---

## Status

**V1 was built in 24 hours** by a team of 4 — 43 commits, from 2026-02-28 17:47 to 2026-03-01 16:37, first line of code to final demo.

That build is frozen at the [`v0.1-hackathon`](../../releases/tag/v0.1-hackathon) tag. Run `git checkout v0.1-hackathon` to get exactly what was demoed on stage.

Development continues on `main`, so `main` may diverge from the demo above.

**This is a prototype, not production software.** It runs on synthetic SOPs and mock aircraft data — no real EASA-regulated documents, no real tail numbers, no real technician data. API routes have no authentication. Features described below as differentiators (contradiction detection, multi-source confidence scoring) are design intent, not shipped code. See [docs/trust-safety.md](docs/trust-safety.md) for the full demo-vs-production boundary.

---

## The Problem

The pipeline replaces the headcount. It does not replace the experience. The FAA issued around 9,000 new mechanic certificates in 2024, while more than 68,000 certificated mechanics — one in three — reach retirement age within ten years, about 6,800 a year ([ATEC Pipeline Report](https://www.atec-amt.org/pipeline-report), United States). The numbers roughly balance. What does not balance is what each side carries: thirty years on an engine type leaves, zero arrives.

Every retiring senior takes decades of contextual knowledge that was never written down — the exceptions, the quirks of specific airframes, the patterns that manuals can't capture.

Existing tools (Zymbly, LexX, AWS Q) do RAG on explicit documents: manuals, SOPs, service bulletins. **None capture what seniors never thought to write down.**

---

## The Solution

Lore operates in three modes:

### 1. Capture Mode (Senior)
After an intervention, the senior debriefs Lore by voice. Lore actively interviews — asks follow-up questions, flags ambiguities, and stores contextual knowledge linked to the specific airframe, component, and conditions.

### 2. Query Mode (Junior)
A junior technician, hands in the machine, asks a question by voice. Lore responds with:
- **Layer 1** — Relevant SOP/manual excerpt (RAG on official docs)
- **Layer 2** — Contextual wisdom from senior's oral knowledge base
- **Layer 3** — This specific aircraft's maintenance history

### 3. Log Mode
Voice-first intervention logging: "Lore, log: N1 vibration 2.4 units, temperature 6°C, no escalation." Adds to the aircraft's persistent memory.

**Rule #1: Lore never contradicts a SOP. It completes it.**

---

## Demo Scenario

**Scene:** Hangar, 23h. Thomas (junior, 2 yrs experience) alone on Airbus A320, tail F-GKXA, CFM56-5B engine. He finds an anomaly not in the job card.

```
Thomas: "Lore, I'm on F-GKXA, CFM56-5B, fan section. I'm getting an unusual
         low-frequency vibration on the N1 shaft. It's not in the job card.
         What do I know about this?"

Lore:   "According to SOP 72-21-00, N1 vibration above 4 units requires
         escalation. However, Marc noted in October that F-GKXA specifically
         shows a harmonic resonance between 2-3 units in cold conditions —
         below 8°C. It's a known characteristic of this airframe, not a defect.
         He recommended logging it and monitoring across the next two cycles
         before escalating."

Thomas: "Got it. Logging: vibration at 2.4 units, temperature 6°C, no
         escalation per Marc's note. Lore, add this to F-GKXA's memory."

Lore:   "Logged. F-GKXA memory updated."
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Voice Input | Speechmatics (real-time STT, noise-robust) |
| LLM | OpenAI GPT-4o |
| Memory + RAG | Backboard (threads + document retrieval) |
| Voice Output | OpenAI TTS (`gpt-4o-mini-tts`) |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Deploy | Vercel |

---

## Why We're Different

- **RAG retrieves what you put in. Lore extracts what seniors never thought to write down** — through active dialogue, not passive ingestion.
- Knowledge graph relationships between airframe × component × condition × expert
- Contradiction detection: if Marc and Jean-Pierre disagree, Lore flags it rather than averaging
- Confidence scoring: observations confirmed by 4 technicians over 3 years outweigh isolated notes

---

## How the answers are checked

The failure mode here is not a crash. It is a well-formed answer carrying the wrong threshold, and test coverage cannot see that. So the answers are graded, not just the code.

**64 cases across 12 categories, 9 graders, every one a pure function.** A grader that needs a model to decide cannot gate a safety property, because it fails in the same way as the thing it grades.

Not every failure is equal, so they are tiered:

| Tier | Threshold | What it covers |
|---|---|---|
| safety | **100%**, no budget | invented figures, a refusal followed by a guess, contradicting the procedure, manufactured consensus |
| trust | 95% | named attribution, procedure cited first |
| form | 90% | wording and closing discipline |

One run scored 52 of 53 and was declared a failure, because the single miss sat in tier 1.

```bash
npm run check   # offline gate: tests, golden answers, regressions. No API keys, no cost.
```

CI runs the offline gate on every pull request and blocks on failure. The live target costs tokens and a third-party API, so it runs only when a pull request carries the `run-live-eval` label: CI should not be able to spend money on its own initiative.

See [`frontend/evals/README.md`](frontend/evals/README.md) for the invariants and [`frontend/evals/ACCEPTANCE.md`](frontend/evals/ACCEPTANCE.md) for what "green" means. The protocol behind it, and where it came from, is written up in [Harnesses, graders, closed loops](https://ivandemurard.com/journal/harnesses-graders-closed-loops).

---

## Author

**Ivan de Murard** — [@IvandeMurard](https://github.com/IvandeMurard)

V1 (`v0.1-hackathon`) was built in 24 hours by a team of 4. Development since the hackathon is mine. See [AUTHORS.md](AUTHORS.md) for the full contributor list.

---

## Getting Started

```bash
# Install dependencies
npm install

# Configure environment
cp frontend/.env.example frontend/.env.local
# Fill in API keys in frontend/.env.local

# Create/validate Backboard assistant + threads
npm run setup-backboard

# Optional: seed demo memory
npm run seed-backboard

# Run frontend dev server from root
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
