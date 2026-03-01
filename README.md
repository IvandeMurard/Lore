# Lore

> The knowledge retiring technicians carry isn't in any manual.

**Lore** is a voice AI mentor that captures the tacit expertise of senior technicians and delivers it to junior technicians on the shop floor. Hands dirty, no screen. Just ask.

Built at the **Activate Your Voice Hackathon** — Speechmatics × The AI Collective Paris
Track 1: Communication & Human Experience · February 28 – March 1, 2026

---

## The Problem

By 2033, 1 in 5 aviation maintenance jobs will go unfilled. Every retiring senior technician takes decades of contextual knowledge that was never written down — the exceptions, the quirks of specific airframes, the patterns that manuals can't capture.

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

## Team

Built in 24 hours by a team of 4.

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
