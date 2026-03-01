# Linear Issues — Lore (Current Architecture)

Team: LOR
Sprint: Hackathon Day (Feb 28 – Mar 1, 2026)

---

## Epic 1 — Setup & Infrastructure

### LOR-1: Initialize frontend runtime
**Priority:** Urgent  
**Label:** Setup  
Use root scripts as wrappers for `frontend/` (`npm run dev/build/start`). Ensure no parallel root app runtime remains.

### LOR-2: Configure env and API clients
**Priority:** Urgent  
**Label:** Setup  
Use `frontend/.env.local` as source of truth for Speechmatics, OpenAI, and Backboard keys.

### LOR-3: Backboard assistant + thread bootstrap
**Priority:** Urgent  
**Label:** Setup  
Run `npm run setup-backboard` to ensure `BACKBOARD_ASSISTANT_ID`, `BACKBOARD_THREAD_F_GKXA`, `BACKBOARD_THREAD_F_HBXA`, `BACKBOARD_THREAD_MARC_DELAUNAY` are valid.

---

## Epic 2 — Voice Pipeline

### LOR-4: Browser hold-to-speak recording
**Priority:** Urgent  
**Label:** Voice  
Capture mic audio with press-and-hold UX. Keep waveform/reactive sphere active during recording.

### LOR-5: Speechmatics real-time STT
**Priority:** Urgent  
**Label:** Voice  
Use realtime token mint endpoint + WS failover hosts. Handle partial and final transcript events.

### LOR-6: OpenAI TTS latency tuning
**Priority:** High  
**Label:** Voice  
Use short spoken response shaping before synthesis and instrument timing (`Server-Timing`, client logs).

---

## Epic 3 — Memory & Intelligence

### LOR-7: Backboard reliability policy
**Priority:** Urgent  
**Label:** Memory  
Apply shared query policy (`timeout=12s`, `maxAttempts=2`, transient retry only for 429/5xx/network timeout).

### LOR-8: Capture endpoint persistence status
**Priority:** Urgent  
**Label:** Memory  
`POST /api/capture` must await persistence and return `stored`, `stored_targets`, `failed_targets`, `retryable`.

### LOR-9: Query endpoint reliability metadata
**Priority:** Urgent  
**Label:** Memory  
`POST /api/query` should return friendly 503 on transient failures and include `retryable` + `degraded`.

### LOR-10: Log endpoint persistence status
**Priority:** High  
**Label:** Memory  
`POST /api/log` must avoid fire-and-forget writes and include explicit persistence outcome fields.

### LOR-11: Auto orchestrator parity
**Priority:** High  
**Label:** Agentic  
`POST /api/orchestrate` should mirror query reliability metadata and capture/log persistence metadata.

---

## Epic 4 — Safety & Compliance

### LOR-12: Enforce mandatory AMM disclaimer
**Priority:** Urgent  
**Label:** Safety  
All advisory responses must end with: `Vérifie toujours la procédure AMM avant d'intervenir.` Prompt + server-side guard.

### LOR-13: Keep advisory boundaries explicit
**Priority:** High  
**Label:** Safety  
Never provide instruction that can override SOP. Keep response attribution (SOP / oral / history) visible.

---

## Epic 5 — Demo Data & QA

### LOR-14: Seed Marc oral knowledge
**Priority:** Urgent  
**Label:** Demo  
Use `npm run seed-backboard` with `data/marc-knowledge.json` and verify query retrieval on `F-GKXA`.

### LOR-15: Repeatable smoke checks
**Priority:** Urgent  
**Label:** Demo  
Run STT token, orchestrate query/capture/log, and TTS playback checks before each demo rehearsal.

### LOR-16: Root build gate
**Priority:** Urgent  
**Label:** Demo  
`npm run build` from root must pass before merge.

### LOR-17: End-to-end rehearsal
**Priority:** High  
**Label:** Demo  
Run the 3-minute script 3 consecutive times with no manual recovery.
