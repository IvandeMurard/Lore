# Lore — CLAUDE.md

## Project

Voice AI mentor for industrial knowledge transfer. Captures tacit expertise from senior technicians and delivers it to juniors on the shop floor — hands dirty, no screen.

**Hackathon:** Activate Your Voice · Speechmatics × AI Collective Paris
**Track:** Communication & Human Experience
**Demo context:** Aviation MRO (Maintenance, Repair & Overhaul) — CFM56-5B engine, Airbus A320

## Stack

- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind CSS
- **Voice In:** Speechmatics real-time STT API
- **LLM:** OpenAI GPT-4o (or Claude Sonnet)
- **Memory:** Qdrant vector DB (episodic + semantic)
- **RAG:** LangChain on mock SOP documents
- **Voice Out:** ElevenLabs TTS (or OpenAI TTS)
- **Deploy:** Vercel

## Architecture

Three API routes drive the core loop:

1. `POST /api/capture` — Senior debriefs → LLM extracts structured knowledge → stores in Qdrant
2. `POST /api/query` — Junior asks → RAG on SOPs + Qdrant semantic search → LLM synthesizes → TTS
3. `POST /api/log` — Junior logs intervention → stores in aircraft history collection

## Key Design Rules

- **Lore never contradicts a SOP.** RAG on official docs always takes precedence.
- Knowledge is attributed to the source technician (name, date, conditions).
- Aircraft history is linked by tail number (e.g., `F-GKXA`).
- Demo uses mock data only — no real EASA-regulated documents.

## Demo Persona

- **Thomas** — Junior technician, 2 years experience, on Airbus A320 F-GKXA
- **Marc** — Retired senior, 26 years on CFM56, pre-captured in the system

## Scope for Hackathon (24h)

Build ONLY what makes the 3-minute demo work:
1. Browser audio capture → Speechmatics STT
2. Query endpoint with RAG + Qdrant
3. Capture endpoint (seed Marc's knowledge)
4. TTS voice response
5. Minimal waveform UI (Capture mode / Query mode toggle)

Do NOT build: user auth, real SOP ingestion, multi-aircraft management, admin panel, analytics.

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # Lint
```
