# Lore — Execution Plan (24h)

Hackathon: Feb 28 15:00 → Mar 1 20:00
Team: Ivan · Timothé · Saheil · Soheil · Daria

---

## Team Assignments

| Person | Role | Primary ownership |
|--------|------|-------------------|
| Timothé | API · Speechmatics · Agentic | Voice pipeline, multi-agent orchestration |
| Saheil | Back-end · Front-end | API routes, Qdrant, deployment |
| Soheil | Front · Back · Design | UI/UX, waveform, polish |
| Daria | Audit · QSM · E-learning | Demo data, SOPs, knowledge seeding, QA |
| Ivan | Product · Design · API · Agentic | Architecture decisions, prompt engineering, pitch |

---

## Architecture

```
Browser
  └── MediaRecorder (audio blob)
        └── Speechmatics RT STT
              └── Orchestrator Agent (LLM)
                    ├── Capture path → Elicitation Agent → Qdrant (oral_knowledge)
                    └── Query path  → Research Agent
                                        ├── Qdrant semantic search (oral_knowledge)
                                        ├── RAG on SOP docs (vector store)
                                        └── Synthesis Agent → TTS → Audio out
```

### Collections (Qdrant)
- `oral_knowledge` — senior expertise, tagged: technician · aircraft · component · conditions · date
- `aircraft_history` — per-tail intervention logs, tagged: tail · component · technician · timestamp
- `sop_chunks` — mock SOP excerpts, chunked + embedded

### Multi-agent layer (bonus — build after core loop works)
1. **Orchestrator** — classifies intent: Capture / Query / Log
2. **Elicitation Agent** (Capture) — interviews senior, asks follow-ups, structures output
3. **Research Agent** (Query) — parallel: Qdrant search + SOP RAG
4. **Synthesis Agent** — merges layers, enforces SOP > oral > history priority
5. **Memory Agent** — writes to Qdrant, returns confirmation + count

---

## Phase 0 — Setup (15:00–17:00, Feb 28)

**Everyone together.**

- [ ] Clone repo, `npm install`
- [ ] Share `.env.local` with all API keys (Speechmatics, OpenAI/Claude, Qdrant, ElevenLabs)
- [ ] Create Qdrant Cloud account → 3 collections
- [ ] Saheil: deploy to Vercel → get staging URL
- [ ] Timothé: confirm Speechmatics API key works (test call)
- [ ] Ivan: walk team through demo script and 3-min scenario

**Exit criteria:** Everyone has dev server running, API keys working, staging URL exists.

---

## Phase 1 — Voice Pipeline (17:00–20:00)

**Owner: Timothé + Soheil**

### Timothé
- `lib/speechmatics.ts` — real-time STT via WebSocket
  - Stream audio chunks → accumulate transcript
  - Handle `final` vs `partial` transcript events
  - Return full transcript on silence detection
- `app/api/transcribe/route.ts` — proxy endpoint for browser → Speechmatics

### Soheil
- `hooks/useAudioRecorder.ts` — MediaRecorder, start/stop, output blob
- Basic UI skeleton: two-mode layout (Capture / Query), hold-to-speak button
- `components/Waveform.tsx` — Web Audio API AnalyserNode visualization

**Exit criteria:** Browser mic → Speechmatics → transcript text displayed on screen.

---

## Phase 2 — Memory Core (20:00–01:00)

**Owner: Saheil + Ivan**

### Saheil
- `lib/qdrant.ts` — typed Qdrant client, embed + upsert + search helpers
- `app/api/capture/route.ts`
  ```
  POST /api/capture
  body: { transcript, technician, tail, component, conditions }
  → LLM extracts structured knowledge
  → embed → upsert oral_knowledge collection
  → return { id, confirmation }
  ```
- `app/api/query/route.ts`
  ```
  POST /api/query
  body: { transcript, tail }
  → embed query
  → parallel: Qdrant search oral_knowledge + Qdrant search sop_chunks
  → LLM synthesis (SOP > oral > history)
  → return { response, sources }
  ```
- `app/api/log/route.ts`
  ```
  POST /api/log
  body: { transcript, tail, technician }
  → LLM extracts log entry
  → upsert aircraft_history
  → return { confirmation, intervention_count }
  ```

### Ivan
- System prompt engineering for each agent role
- SOP priority enforcement in synthesis prompt
- Test each endpoint with curl / Postman

**Exit criteria:** Postman confirms all 3 endpoints return correct responses.

---

## Phase 3 — Full Loop Integration (01:00–05:00)

**Owner: Timothé (agent orchestration) + Saheil (wiring)**

### Timothé
- `lib/orchestrator.ts` — Orchestrator Agent
  - Input: raw transcript + context
  - Classifies: `capture | query | log`
  - Routes to correct endpoint
- `lib/elicitation-agent.ts` — Capture mode
  - After senior speaks, generates 1 follow-up question
  - Re-records answer, structures final knowledge object
- `lib/tts.ts` — ElevenLabs TTS
  - Input: text string
  - Output: audio blob → autoplay in browser

### Saheil
- Wire full loop in `app/page.tsx`:
  `hold button → record → STT → orchestrator → endpoint → TTS → play`
- Error handling: API failures → graceful fallback text response

**Exit criteria:** Full loop works end-to-end: speak → transcribe → route → respond → voice out.

---

## Phase 4 — Demo Data (20:00–01:00 parallel)

**Owner: Daria + Ivan**

### Daria
- `data/sops/cfm56-5b-72-21.txt` — N1 vibration SOP excerpt (realistic, 10-15 entries)
- `data/sops/cfm56-5b-72-00.txt` — Fan section general inspection SOP
- `data/marc-knowledge.json` — Marc's pre-captured oral knowledge:
  ```json
  [
    {
      "technician": "Marc Delaunay",
      "date": "2025-10-14",
      "aircraft": "F-GKXA",
      "component": "CFM56-5B fan section",
      "conditions": "cold weather, T < 8°C",
      "knowledge": "F-GKXA shows N1 harmonic resonance 2-3 units in cold. Known characteristic. Not a defect. Monitor 2 cycles before escalating.",
      "confidence": 0.95
    },
    {
      "technician": "Marc Delaunay",
      "date": "2025-08-22",
      "aircraft": "F-GKXA",
      "component": "CFM56-5B HP compressor",
      "conditions": "standard",
      "knowledge": "Blade inspection on F-GKXA HPC stage 3: slight leading edge erosion, within limits. Mark for tracking every 200 cycles.",
      "confidence": 0.90
    }
  ]
  ```
- At least 6 entries total across 2 aircraft

### Ivan
- `scripts/seed.ts` — reads JSON files, embeds, upserts to Qdrant
- `scripts/seed-sops.ts` — chunks SOPs, embeds, upserts `sop_chunks`
- Run both seeds, confirm data is in Qdrant

**Exit criteria:** `npm run seed` populates Qdrant. Query endpoint returns Marc's note when asked about F-GKXA N1 vibration.

---

## Phase 5 — UI Polish (05:00–11:00)

**Owner: Soheil + Ivan**

### Design system
- Background: `#0a0a0a`
- Accent: `#f97316` (orange)
- Text: `#f5f5f5` / `#9ca3af`
- Font: Geist or Inter
- No rounded-pill buttons — sharp industrial aesthetic

### Components
- `WaveformVisualizer` — animated bars during recording and TTS playback
- `ModeToggle` — Capture / Query tab, visually distinct
- `TranscriptPanel` — shows live transcript as you speak
- `ResponsePanel` — shows Lore's text response with source attribution
  - "SOP 72-21-00 · Marc Delaunay, Oct 2025 · F-GKXA history"
- `AircraftBadge` — shows active tail number (F-GKXA)
- Loading state — pulsing waveform while processing

### Exit criteria:** Demo runs on Vercel, looks polished, no layout glitches.

---

## Phase 6 — End-to-End QA (11:00–14:00)

**Owner: Daria + all**

- Run exact demo script 3 times
- Document every failure mode
- Fix latency issues (target: < 3s response time)
- Prepare fallback: if Speechmatics fails live → pre-recorded audio file
- Confirm Vercel deployment is stable

---

## Phase 7 — Pitch Prep (14:00–19:00)

**Owner: Ivan + Daria**

### Slides (8 slides max)
1. **Title** — Lore. "The knowledge retiring technicians carry isn't in any manual."
2. **Problem** — 1 in 5 jobs unfilled by 2033. $84B market. Tacit knowledge dies at retirement.
3. **Existing solutions** — Zymbly, LexX, AWS Q: all RAG on documents. None capture what was never written.
4. **Our insight** — "RAG retrieves what you put in. Lore extracts what seniors never thought to write down."
5. **Solution** — 3 modes: Capture, Query, Log. SOP always takes precedence.
6. **Architecture** — Multi-agent diagram. Speechmatics → Orchestrator → Memory → TTS.
7. **Demo** — (live, not on slide)
8. **Closing** — "Tacit knowledge has always died with retirement. Lore makes it immortal."

### Jury objections (rehearse answers)
- "Isn't this RAG?" → Active elicitation, not passive ingestion. Knowledge graph, not vector similarity.
- "EASA regulations?" → Lore never prescribes. SOP > oral. Responsibility stays human.
- "Why not Zymbly?" → They query documents. We capture what's never been documented.
- "Noisy hangar?" → Speechmatics is purpose-built for this. That's why they sponsor.
- "Earpiece required?" → Phone in pocket. At scale, earpiece. We remove the screen, not the choice.

---

## Scope Lock — Do NOT build

- User authentication
- Real EASA document ingestion
- Multi-aircraft management dashboard
- Analytics / usage metrics
- Admin panel
- Mobile app
- Sound analysis / anomaly detection
- Real-time collaboration between technicians

Every feature request goes through: **"Does this make the 3-minute demo better?"** If no → reject.

---

## Risk Register

| Risk | Probability | Mitigation |
|------|-------------|------------|
| Speechmatics fails live | Medium | Pre-recorded audio fallback ready |
| Qdrant latency > 3s | Low | Cache Marc's notes in memory at startup |
| TTS sounds robotic | Low | Test 3 voices, pick best before demo |
| Scope creep | High | Ivan enforces scope lock continuously |
| Team energy crash 3-5am | Medium | Sleep rotation: 2 devs sleep, 2 work |
