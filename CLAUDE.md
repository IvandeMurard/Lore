# Lore — CLAUDE.md

## Project

Voice AI mentor for industrial knowledge transfer. Captures tacit expertise from senior technicians and delivers it to juniors on the shop floor — hands dirty, no screen.

**Hackathon:** Activate Your Voice · Speechmatics × AI Collective Paris
**Track:** Communication & Human Experience
**Demo context:** Aviation MRO (Maintenance, Repair & Overhaul) — CFM56-5B engine, Airbus A320

## Stack

- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind CSS (lives in `frontend/`)
- **Voice In:** Speechmatics real-time STT (browser-side WebSocket)
- **LLM:** OpenAI GPT-4o
- **Memory:** Backboard — thread-per-aircraft + thread-per-technician, `memory="Auto"`
- **RAG:** Backboard auto-indexed SOP documents (uploaded via dashboard)
- **Voice Out:** OpenAI TTS (`gpt-4o-mini-tts`, fallback `tts-1`)
- **Deploy:** Vercel

## Architecture

Three API routes in `frontend/app/api/` drive the core loop:

1. `POST /api/capture` — Senior debriefs → LLM extracts structured knowledge → stores in Backboard (aircraft + technician threads)
2. `POST /api/query` — Junior asks → Backboard RAG (SOP + oral + history) → response + TTS
3. `POST /api/log` — Junior logs intervention → LLM extracts → stores in Backboard aircraft thread

Supporting routes:
- `POST /api/tts` — OpenAI TTS synthesis
- `POST /api/speechmatics-token` — JWT for browser-side STT
- `POST /api/transcribe` — Server-side STT fallback

## Key Design Rules

- **Lore never contradicts a SOP.** SOP always takes precedence (Priority 1 in synthesis prompt).
- Knowledge is attributed to the source technician by full name, date, and conditions.
- Aircraft history is linked by tail number (e.g., `F-GKXA`) via Backboard thread mapping.
- Every response ends with: "Vérifie toujours la procédure AMM avant d'intervenir."
- Demo uses mock data only — no real EASA-regulated documents.

## Demo Persona

- **Thomas** — Junior technician, 2 years experience, on Airbus A320 F-GKXA
- **Marc** — Retired senior, 26 years on CFM56, pre-captured in the system

## Key Files

| File | Purpose |
|------|---------|
| `frontend/app/page.tsx` | Main UI with STT + API + TTS wiring |
| `frontend/lib/backboard.ts` | Backboard client with retry logic |
| `frontend/lib/openai.ts` | OpenAI embed + chatCompletion |
| `frontend/lib/llm.ts` | classifyIntent, synthesize, elicit, extractLog |
| `frontend/lib/prompts.ts` | All system prompts |
| `docs/trust-safety.md` | EASA/GDPR/safety framework |

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # Lint
```
