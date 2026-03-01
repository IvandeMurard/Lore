# Lore

> *"Marc knows why this engine hums funny in winter. Marc retired in November. You're alone in the hangar at 11pm. Good luck."*

**Lore is a voice AI mentor that rescues expert knowledge from retirement — and puts it in your ear at exactly the right moment.**

Built at **Activate Your Voice** · Speechmatics × AI Collective Paris · Feb 28 – Mar 1, 2026

---

## The Knowledge Cliff

Picture this: a senior aviation technician spends 26 years on CFM56 engines. He knows that *this specific aircraft* — tail F-GKXA — shows a weird harmonic vibration below 8°C that looks like a fault but isn't. He knows because he saw it four times. He never wrote it down because, honestly, why would he? It's just *obvious* once you've been there.

Then he retires.

And on a cold Tuesday night in November, a 2-year junior named Thomas finds that vibration, alone, at 11pm, with a 6am departure slot and 200 passengers expecting to board.

**By 2033, 1 in 5 aviation maintenance jobs will go unfilled.** Every expert who walks out the door takes a warehouse of contextual knowledge that no manual ever captured. Standard tools (RAG on documents, knowledge bases, wikis) only retrieve what someone already thought to write down. **None of them can capture what wasn't.**

---

## Enter Lore

Lore is a three-mode voice system that turns expert brains into persistent institutional memory — and delivers it hands-free on the shop floor.

### Mode 1 — Capture (The Debrief)
After an intervention, the senior talks to Lore. Lore doesn't just record: it **actively interviews** — probing for conditions, exceptions, contradictions, edge cases. It structures the knowledge and links it to the specific aircraft, component, and environmental context. Marc's 26 years become a searchable, attributable memory.

### Mode 2 — Query (The Mentor in Your Ear)
Thomas, hands covered in grease, asks: *"Lore, what do I know about N1 vibration on F-GKXA?"*

Lore responds in three layers:
- **SOP first** — what the manual says (always, no exceptions)
- **Marc's wisdom** — what the expert actually observed about this component
- **F-GKXA's history** — what happened *on this specific airframe* before

The answer isn't just correct. It's contextual.

### Mode 3 — Log (The Persistent Record)
*"Lore, log: vibration 2.4 units, 6°C, no escalation per Marc's note."*

Done. Aircraft memory updated. Future Thomas — or Thomas in 3 years — has one more data point.

**Rule #1: Lore never contradicts a SOP. It completes it.**

---

## The Demo

```
Thomas (11pm, hangar, F-GKXA, hands in the fan section):

  "Lore, I'm on F-GKXA, CFM56-5B, fan section. I'm getting an unusual
   low-frequency vibration on the N1 shaft. It's not in the job card.
   What do I know about this?"

Lore:

  "According to SOP 72-21-00, N1 vibration above 4 units requires escalation.
   However, Marc Delaunay noted in October that F-GKXA specifically shows a
   harmonic resonance between 2–3 units in cold conditions — below 8°C.
   It's a known characteristic of this airframe, not a defect.
   He recommended monitoring across the next two cycles before escalating.
   Vérifie toujours la procédure AMM avant d'intervenir."

Thomas:

  "Got it. Logging: vibration at 2.4 units, temperature 6°C, no escalation
   per Marc's note."

Lore:

  "Logged. F-GKXA memory updated."
```

Thomas makes the right call. The aircraft departs on time. Marc's knowledge lived past his retirement.

---

## Why Not Just RAG?

RAG retrieves what you put in. Lore **extracts what seniors never thought to put anywhere.**

The difference:
- Standard RAG → *"Here's what SOP 72-21-00 says."*
- Lore → *"Here's what the SOP says, here's what Marc actually observed, and here's what happened on this specific jet the last 3 times someone saw this."*

Plus:
- **Contradiction detection** — if Marc and Jean-Pierre disagree, Lore flags it rather than averaging them into slop
- **Confidence scoring** — an observation confirmed by 4 technicians over 3 years outweighs an isolated note
- **Full attribution** — every piece of knowledge carries a name, date, and conditions. Nothing is anonymous. Nothing is taken on blind trust.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Voice In | Speechmatics real-time STT | Purpose-built for noise. Hangars are loud. |
| LLM | OpenAI GPT-4o | Synthesis, elicitation, intent detection |
| Memory + RAG | Backboard (threads + docs) | Per-aircraft × per-technician persistent memory |
| Voice Out | OpenAI TTS `gpt-4o-mini-tts` | Hands-free response — no screen needed |
| Frontend | Next.js 14, TypeScript, Tailwind | |
| Deploy | Vercel | |

---

## Safety, Because Aviation

- Lore **never overrides a SOP**. Official documentation is always Priority 1.
- Every response ends with: *"Vérifie toujours la procédure AMM avant d'intervenir."*
- Oral knowledge enters with a `validated: false` flag — a lead technician reviews before activation in production.
- Full GDPR traceability. Every contribution is attributed and auditable.

Demo uses mock data only — no real EASA-regulated documents.

---

## The Line That Matters

> SOPs tell Thomas what to do.
> Lore tells him what Marc would have said.
>
> **Tacit knowledge has always died with retirement. Lore makes it immortal.**

---

## Team

Built in 24 hours by a team of 4 at the AI Collective Paris.

---

## Getting Started

```bash
# Install dependencies
npm install

# Configure environment
cp frontend/.env.example frontend/.env.local
# Fill in: OPENAI_API_KEY, SPEECHMATICS_API_KEY, BACKBOARD_API_KEY + thread IDs

# Create/validate Backboard assistant + threads
npm run setup-backboard

# Optional: seed demo memory (Marc's 26 years, pre-compressed)
npm run seed-backboard

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
