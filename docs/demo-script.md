# Lore — Demo Script (3 minutes)

## Setup before demo

1. Verify Backboard threads are seeded: check that `BACKBOARD_THREAD_F_GKXA` and `BACKBOARD_THREAD_MARC_DELAUNAY` exist in `.env.local`
2. Verify SOPs are uploaded to Backboard dashboard (cfm56-5b-72-21.txt, cfm56-5b-72-00.txt)
3. Open the app full screen (dark mode is default)
4. Select **Auto** mode (orange tab — default)
5. Sound on — judges must hear Lore's voice response

### Quick smoke test (30 seconds before going live)
```bash
curl -s http://localhost:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"transcript":"What do I know about N1 vibration on F-GKXA?","tail":"F-GKXA"}' | jq .intent
# Expected: "query"
```

### Repeatable smoke checklist (run 3 times)
```bash
# 1) Speechmatics realtime token mint
curl -s -X POST http://localhost:3000/api/speechmatics-token | jq .

# 2) Auto mode query path
curl -s -X POST http://localhost:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"transcript":"What do I know about N1 vibration on F-GKXA?","tail":"F-GKXA","technician":"Marc Delaunay"}' | jq .

# 3) Capture persistence fields
curl -s -X POST http://localhost:3000/api/capture \
  -H "Content-Type: application/json" \
  -d '{"transcript":"F-GKXA shows recurring low-frequency N1 harmonic pattern in cold weather under 8C.","tail":"F-GKXA","technician":"Marc Delaunay","component":"CFM56 fan section","conditions":"cold weather"}' | jq .

# 4) Log persistence fields
curl -s -X POST http://localhost:3000/api/log \
  -H "Content-Type: application/json" \
  -d '{"transcript":"Logging 2.4 N1 vibration at 6C, no escalation.","tail":"F-GKXA","technician":"Marc Delaunay"}' | jq .

# 5) TTS endpoint timing + payload headers
curl -s -D - -o /tmp/lore-tts.opus -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"According to SOP 72-21-00, monitor this trend. Always verify the AMM procedure before intervening."}' | sed -n '1,40p'
```

Expected outcome on all three runs:
- No 500 responses
- Query/orchestrate transient outages return 503 + `retryable: true`
- Capture/log always include `stored`, `stored_targets`, `failed_targets`
- Advisory responses end with `Always verify the AMM procedure before intervening.`

---

## [0:00 – 0:20] Narrative setup (presenter to jury)

> "It's 11pm. Thomas is a junior technician, 2 years experience, alone in the hangar.
> He's inspecting the CFM56 engine on Airbus A320, tail number F-GKXA.
> He finds something the job card doesn't cover — an unusual vibration pattern he's never seen.
> His senior, Marc — 26 years on CFM56 — retired 3 months ago.
> But Marc's knowledge didn't leave with him."

*[App is open in Auto mode — particle sphere visible, F-GKXA badge in header]*

---

## [0:20 – 1:30] Live Demo — Query (Auto mode)

**Presenter speaks into mic (as Thomas):**

> "Lore, I'm on F-GKXA, CFM56-5B, fan section. I'm getting an unusual
> low-frequency vibration on the N1 shaft. It's not in the job card.
> What do I know about this?"

**What the audience sees:**
1. Particle sphere animates while speaking (voice level)
2. Live transcript appears in real time (Speechmatics STT)
3. On release: sphere pulses (loading), "Detected: query (90%)" badge appears
4. Lore's text response appears with source attribution
5. TTS voice reads the response aloud

**Expected Lore response (TTS):**

> "According to SOP 72-21-00, N1 vibration above 4 units requires escalation.
> Marc Fontaine noted in October that F-GKXA specifically shows a harmonic
> resonance between 2-3 units in cold conditions — below 8°C. It's a known
> characteristic of this airframe, not a defect. Always verify the AMM procedure
> before intervening."

**Sources shown:** SOP documents (RAG) · Senior oral knowledge · F-GKXA memory

---

## [1:30 – 2:00] Live Demo — Log (Auto mode)

**Presenter (as Thomas) — stay in Auto mode, Lore auto-detects "log":**

> "Logging: vibration at 2.4 units, temperature 6°C. Fan section inspection
> complete, no escalation needed per Marc's note. Returning to service."

**Expected Lore response:**

> "Logged. F-GKXA memory updated. [N] interventions on record."

**What the audience sees:** "Detected: log (85%)" badge + confirmation

---

## [2:00 – 2:30] Capture Mode (30 seconds)

*[Presenter addresses the jury directly:]*

> "This is how Marc's knowledge got there in the first place — three months ago."

**Presenter speaks (as Marc) — still in Auto mode:**

> "Lore, debrief on F-GKXA. CFM56 fan section, N1 vibration. This airframe
> has a specific harmonic pattern in cold weather. Looks like a fault but it's not —
> I've seen it 4 times in 8 years. Log this under F-GKXA cold weather behavior."

**Expected Lore response:**

> "Knowledge captured from Marc Delaunay for F-GKXA. Linked to CFM56 fan section,
> cold weather conditions. Accessible to all certified technicians on this airframe."

**What the audience sees:** "Detected: capture (92%)" badge + confirmation

---

## [2:30 – 3:00] Closing to jury

> "Lore doesn't replace the manual. It completes it.
> SOPs tell Thomas what to do. Lore tells him what Marc would have said.
>
> That's the difference between a junior who grounds an aircraft unnecessarily
> at 11pm — and one who makes the right call with confidence.
>
> Tacit knowledge has always died with retirement. Lore makes it immortal."

---

## Fallback Plan

| Failure | Fallback |
|---------|----------|
| Speechmatics STT fails | Type the transcript manually into dev console, call `/api/orchestrate` |
| Backboard timeout | Switch to manual Query/Capture/Log tabs (avoids orchestrator overhead) |
| TTS fails | Response text is always displayed — read it to the judges |
| Mic permission denied | Use a second device with the Vercel URL |

## Jury Q&A Prep

**"Isn't this just RAG?"**
> "RAG retrieves what you put in. Lore extracts what seniors never thought to write down — through active dialogue, not passive ingestion."

**"What about EASA regulations?"**
> "Lore never contradicts a SOP. Official docs take precedence. The oral layer is context, not prescription. Responsibility stays human. Every response ends with: verify the AMM procedure."

**"Why not Zymbly?"**
> "Zymbly queries documents. Lore captures what's never in any document. Complementary, not competitive."

**"What about noisy hangars?"**
> "Speechmatics is purpose-built for noisy environments — that's their core positioning, and why they're sponsoring this hackathon."

**"How do you handle incorrect knowledge?"**
> "Every piece of knowledge is attributed by name, date, and conditions. It enters with a validated:false flag. In production, a lead technician reviews before activation. The system is designed for traceability, not blind trust."
