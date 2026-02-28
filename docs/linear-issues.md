# Linear Issues — Lore Hackathon

Team: LOR · Workspace: loreapp
Sprint: Hackathon Day (Feb 28 – Mar 1, 2026)

---

## Epic 1 — Setup & Infrastructure

### LOR-1: Initialize Next.js project
**Priority:** Urgent
**Label:** Setup
Create Next.js 14 App Router project with TypeScript and Tailwind CSS. Run `npx create-next-app@latest`. Install dependencies from package.json. Verify `npm run dev` works.

### LOR-2: Configure API clients and environment
**Priority:** Urgent
**Label:** Setup
Set up typed API clients for: Speechmatics, OpenAI, Qdrant, ElevenLabs. Create `lib/` folder with one file per integration. Copy `.env.example` to `.env.local` and fill in keys.

### LOR-3: Deploy to Vercel (staging)
**Priority:** High
**Label:** Setup
Connect repo to Vercel. Add env vars. Get a public URL for judges. Do this early — easier than last minute.

---

## Epic 2 — Voice Pipeline

### LOR-4: Browser audio recording
**Priority:** Urgent
**Label:** Voice
Implement `useAudioRecorder` hook using browser MediaRecorder API. Start/stop on button press. Output: audio blob (WAV or WebM). Test in Chrome.

### LOR-5: Speechmatics real-time STT
**Priority:** Urgent
**Label:** Voice
Integrate Speechmatics real-time transcription API. Send audio chunks as recorded. Return transcript text. Handle errors gracefully. API docs: https://docs.speechmatics.com

### LOR-6: TTS voice output
**Priority:** High
**Label:** Voice
Integrate ElevenLabs TTS (or OpenAI TTS as fallback). Input: text string. Output: audio played in browser. Choose a voice that sounds calm and professional (not robotic).

### LOR-7: Waveform visualizer
**Priority:** Low
**Label:** UI
Animated waveform using Web Audio API AnalyserNode. Shows while recording (input) and while Lore responds (output). Dark background, orange accent (brand color).

---

## Epic 3 — Memory & Intelligence

### LOR-8: Qdrant vector DB setup
**Priority:** Urgent
**Label:** Memory
Create Qdrant Cloud account. Create two collections: `lore_knowledge` (senior oral expertise) and `lore_aircraft_history` (per-airframe logs). Configure in `lib/qdrant.ts`.

### LOR-9: Knowledge capture endpoint
**Priority:** Urgent
**Label:** Memory
`POST /api/capture`
Input: transcript text, technician name, aircraft tail, component, conditions.
Process: LLM extracts structured knowledge → embed → store in Qdrant with metadata.
Return: confirmation + knowledge ID.

### LOR-10: Knowledge query endpoint
**Priority:** Urgent
**Label:** Memory
`POST /api/query`
Input: transcript text (junior's question), aircraft tail.
Process: embed query → semantic search Qdrant → RAG on mock SOP → LLM synthesis.
Return: text response + sources cited.

### LOR-11: Intervention log endpoint
**Priority:** High
**Label:** Memory
`POST /api/log`
Input: transcript text, aircraft tail, technician name.
Process: LLM extracts log entry → store in aircraft history collection.
Return: confirmation + total intervention count.

---

## Epic 4 — Demo Data

### LOR-12: Mock SOP data
**Priority:** High
**Label:** Demo
Create `data/sops/cfm56-5b-72-21.txt` with realistic-looking SOP excerpts for CFM56-5B N1 vibration procedures. Keep it short (5-10 entries). This is the RAG source.

### LOR-13: Seed Marc's oral knowledge
**Priority:** Urgent
**Label:** Demo
Create `scripts/seed.ts`. Pre-populate Qdrant with Marc's captured knowledge:
- F-GKXA cold weather N1 harmonic resonance
- At least 3-4 other entries for variety
Run: `npx tsx scripts/seed.ts`

### LOR-14: Demo scenario validation
**Priority:** High
**Label:** Demo
End-to-end test of the exact demo script. Thomas's question → correct Lore response. Tune the LLM prompt until the response matches the demo script verbatim within 1-2 rehearsals.

---

## Epic 5 — UI & Polish

### LOR-15: Main demo UI
**Priority:** High
**Label:** UI
Two-mode interface: **Capture** (senior) / **Query** (junior).
- Dark background (#0a0a0a), orange accent (#f97316)
- Large "Hold to speak" button
- Transcript display
- Lore's response text + voice
- Aircraft tail input field
Keep it minimal — judges should focus on the interaction, not the UI.

### LOR-16: End-to-end rehearsal
**Priority:** Urgent
**Label:** Demo
Run the full 3-minute demo script 3 times before final presentation. Fix any latency, audio, or LLM response issues. Have a fallback plan (pre-recorded audio) if Speechmatics fails live.

### LOR-17: Pitch deck final review
**Priority:** Medium
**Label:** Pitch
Review slides against jury objections. Add one slide: "Why not just RAG?" with the knowledge graph / active elicitation differentiator. Rehearse closing line: "Tacit knowledge has always died with retirement. Lore makes it immortal."

---

## Timeline

| Time | Milestone |
|------|-----------|
| Feb 28, 15h | Team aligned, scope locked, Epic 1 done |
| Feb 28, 20h | Voice pipeline working (LOR-4 to LOR-6) |
| Mar 1, 02h | Memory layer working (LOR-8 to LOR-11) |
| Mar 1, 08h | Demo data seeded, end-to-end loop works |
| Mar 1, 14h | UI polished, demo rehearsals begin |
| Mar 1, 19h | Presentation |
