# Lore — Demo Script (3 minutes)

## Setup before judging

1. Pre-seed Marc's knowledge into Qdrant (run `npm run seed`)
2. Open app in full screen, dark mode
3. Sound on — judges must hear Lore's voice response

---

## [0:00 – 0:20] Narrative setup (presenter to jury)

> "It's 11pm. Thomas is a junior technician, 2 years experience, alone in the hangar.
> He's inspecting the CFM56 engine on Airbus A320, tail number F-GKXA.
> He finds something the job card doesn't cover — an unusual vibration pattern he's never seen.
> His senior, Marc — 26 years on CFM56 — retired 3 months ago.
> But Marc's knowledge didn't leave with him."

*[Switch to app — Query mode active, waveform visible]*

---

## [0:20 – 1:30] Live Demo — Query Mode

**Presenter speaks into mic (as Thomas):**

> "Lore, I'm on F-GKXA, CFM56-5B, fan section. I'm getting an unusual
> low-frequency vibration on the N1 shaft. It's not in the job card.
> What do I know about this?"

**Expected Lore response (TTS):**

> "According to SOP 72-21-00, N1 vibration above 4 units requires escalation.
> However, Marc noted in October that F-GKXA specifically shows a harmonic
> resonance between 2-3 units in cold conditions — below 8°C. It's a known
> characteristic of this airframe, not a defect. He recommended logging it
> and monitoring across the next two cycles before escalating."

**Presenter (as Thomas):**

> "Got it. Logging: vibration at 2.4 units, temperature 6°C, no escalation
> per Marc's note. Lore, add this to F-GKXA's memory."

**Lore:**

> "Logged. F-GKXA memory updated. 14 interventions on record."

---

## [1:30 – 2:00] Capture Mode (30 seconds)

*[Switch to Capture mode]*

> "This is how Marc's knowledge got there in the first place — three months ago."

**Presenter speaks (as Marc):**

> "Lore, debrief on F-GKXA. CFM56 fan section, N1 vibration. This airframe
> has a specific harmonic pattern in cold weather. Looks like a fault but it's not —
> I've seen it 4 times in 8 years. Log this under F-GKXA cold weather behavior."

**Lore:**

> "Captured. Linked to F-GKXA, CFM56-5B, cold weather conditions.
> Accessible to all certified technicians on this airframe."

---

## [2:00 – 2:30] Closing to jury

> "Lore doesn't replace the manual. It completes it.
> SOPs tell Thomas what to do. Lore tells him what Marc would have said.
>
> That's the difference between a junior who grounds an aircraft unnecessarily
> at 11pm — and one who makes the right call with confidence.
>
> Tacit knowledge has always died with retirement. Lore makes it immortal."

---

## Jury Q&A Prep

**"Isn't this just RAG?"**
> "RAG retrieves what you put in. Lore extracts what seniors never thought to write down — through active dialogue, not passive ingestion."

**"What about EASA regulations?"**
> "Lore never contradicts a SOP. Official docs take precedence. The oral layer is context, not prescription. Responsibility stays human."

**"Why not Zymbly?"**
> "Zymbly queries documents. Lore captures what's never in any document. Complementary, not competitive."

**"What about noisy hangars?"**
> "Speechmatics is purpose-built for noisy environments — that's their core positioning, and why they're sponsoring this hackathon."
