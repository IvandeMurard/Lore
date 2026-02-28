# Lore — Trust & Safety

## What Lore is not

Lore is not a certified documentation system. It does not replace AMM procedures, EASA Part-145 approved maintenance data, or any regulatory-compliant source of truth. It is an operational memory layer — it captures what experienced technicians know that never makes it into any document, and surfaces it as context when a junior needs it most.

Lore completes the SOP. It never contradicts it.

---

## 1. Regulatory positioning

**Applicable framework:** EASA Part-145 (MRO organisation approval), EASA Part-66 (certifying staff)

**Lore's position:**
- All responses cite the SOP threshold or rule first (PRIORITY 1, enforced in system prompt)
- Oral knowledge is presented as context, not instruction: "Marc Fontaine noted in [date] that..." — not "you must"
- The technician remains the certifying agent. Lore is advisory.
- Every response ends with: *"Vérifie toujours la procédure AMM avant d'intervenir."* (hardcoded in synthesis prompt, non-removable)

**What this means in a Part-145 audit:**
Lore is not part of the approved maintenance data system. It is equivalent to a technician consulting a senior colleague — permitted, common practice, and not regulated — as long as the official procedure governs the final action.

---

## 2. Knowledge evaluation

**The problem:** oral knowledge can be wrong, outdated, or context-specific. A note from Marc about F-GKXA in 2019 may not apply to a different airframe today.

**Mitigations in the current build:**
- Every piece of knowledge is attributed with: technician name, date captured, component, operating conditions
- Attribution is mandatory in the synthesis prompt — vague sourcing ("a senior noted") is rejected
- Knowledge is stored with `validated: false` flag — signals that a review step exists

**Production roadmap (not in demo scope):**
- Validation queue: captured knowledge enters a pending state, reviewed by a lead technician or MRO quality manager before activation
- Expiry rules: knowledge older than N months triggers a re-validation request
- Confidence scoring: LLM extracts a confidence score at capture time; low-confidence entries are flagged automatically

---

## 3. Aviation safety

**Core risk:** the LLM synthesises a plausible-sounding but technically incorrect response. Thomas acts on it. An airworthiness issue follows.

**Mitigations in the current build:**
- SOP primacy is structurally enforced — the synthesis prompt places regulatory procedure above all other sources
- Lore never fabricates: if no relevant information exists, the prompt instructs it to say so explicitly
- The mandatory disclaimer at end of every response anchors the advisory-only status
- Temperature is set low for synthesis (0.3–0.5) to reduce hallucination drift
- Knowledge captured from Marc is structured at ingestion — the LLM extracts facts, not paraphrase

**Residual risk (acknowledged):**
No automated system eliminates hallucination risk at the current state of LLM technology. Lore is not suitable for critical-path interventions without a human validation layer. The demo scope (tacit knowledge retrieval, not procedural instruction) is chosen deliberately to stay in low-stakes territory.

---

## 4. Confidentiality

### Technician data (GDPR)

Voice recordings and transcripts of Marc's debrief sessions are personal data.

- Explicit written consent must be obtained before any capture session
- The recording is transcribed by Speechmatics STT and discarded — raw audio is never stored
- Stored data: structured text only (component, conditions, knowledge summary, technician name)
- Right to erasure (GDPR Art. 17): a `DELETE /api/knowledge/:id` endpoint is planned for production. Deletion propagates to both aircraft thread and technician thread in Backboard.

### Operational data

Aircraft intervention history (tail F-GKXA, fault patterns, recurring anomalies) is commercially sensitive for the airline operator.

- In production, Lore is deployed per-tenant: one Backboard assistant per airline, threads isolated by organisation
- No knowledge crosses tenant boundaries
- The tail number → thread mapping is resolved from environment variables, not shared state

### Audit trail

Every capture and log event stores: technician identifier, aircraft tail, timestamp, component. This supports traceability requirements under Part-145 quality assurance without requiring Lore to be part of the approved documentation system.

---

## 5. Cybersecurity

| Surface | Current state | Production target |
|---------|--------------|-------------------|
| API keys | Env vars (Vercel) | Secret manager (e.g. Doppler) |
| Backboard threads | Isolated by env var mapping | Per-tenant deployment |
| Voice transmission | HTTPS / WSS (Speechmatics) | Same |
| LLM requests | OpenAI API over HTTPS | Same |
| No auth on API routes | Demo only | Auth middleware (JWT or SSO) |

The absence of authentication on API routes is a deliberate demo scope decision. All API routes are protected by Vercel deployment — not public in production.

---

## 6. Scope boundary (demo vs. production)

The hackathon build uses mock data only. No real EASA-regulated documents, no real aircraft tail numbers, no real technician personal data.

| Feature | Demo | Production |
|---------|------|------------|
| SOP source | Mock text files | AMM sections, OEM documents (airline-approved) |
| Knowledge | Synthetic (Daria's entries) | Real debrief sessions, consent captured |
| Validation | `validated: false` flag | Human review queue |
| Auth | None | Part-145 organisation-scoped auth |
| Deployment | Vercel (shared) | On-premise or private cloud tenant |
| Data deletion | Not implemented | DELETE endpoint + Backboard purge |
