# Lore — User Journey

Two users. Three moments. One knowledge loop.

---

## The Setup

**Marc Delaunay** — 26 years on CFM56. He has seen every variant of this engine behave in ways that never made it into a manual. He is retiring in 3 months. His team knows it.

**Thomas Remy** — 2 years in. Sharp, methodical, by-the-book. He knows the procedures. He does not yet know what Marc knows — the patterns, the exceptions, the things that only come from years of watching the same engines on the same routes in the same weather.

**F-GKXA** — Airbus A320, in service 11 years. Fleet average in most metrics. Not in all.

---

## Journey 1 — Marc captures (3 months ago)

### Trigger
It is Marc's last week on the CFM56 line. His manager asks him to do a knowledge debrief before he leaves. Marc has done this before — a printed form, two hours, forgotten in a filing cabinet. This time it is different.

### The moment
Marc is standing next to F-GKXA after a cold morning inspection. It is 6°C. He just saw the N1 vibration reading — 2.4 units. He knows exactly what it means. He presses hold on the tablet mounted at the entrance to the hangar bay.

> *"Lore, debrief on F-GKXA. CFM56 fan section, N1 vibration. This airframe has a specific harmonic pattern in cold weather — below 8 degrees. It reads 2 to 3 units. Looks like a fault but it's not. I've seen it 4 times in 8 years. Monitor it across two cycles before you do anything. Do not ground the aircraft for this alone."*

He releases.

### What Lore does
- Transcribes in real time (Marc sees his words appear as he speaks)
- Classifies intent automatically: **capture**
- Structures the knowledge: technician, aircraft, component, conditions, observation, recommendation
- Stores in F-GKXA's memory thread and Marc's technician thread
- Generates a draft SOP section from the oral input
- Responds: *"Got it, Marc. Linked to CFM56 fan section on F-GKXA, cold weather conditions. The team will have access to this."*

### Outcome
Marc nods. 45 seconds. He walks away.

His 26 years are now in the system, attributed to him by name, linked to this specific airframe, tagged by date and conditions. Not in a filing cabinet. Not in someone's memory. Queryable.

---

## Journey 2 — Thomas queries (tonight)

### Trigger
It is 11pm. Thomas is alone in the hangar. He is doing a pre-departure check on F-GKXA before a 6am departure. Temperature: 6°C.

He checks the N1 vibration reading. **2.4 units.** It is not in the job card. It is not in the threshold that would trigger an automatic escalation. But it is not zero, and he has never seen it on this airframe before.

He has two options: ground the aircraft and wake someone up, or let it go and hope. Neither feels right.

### The moment
He holds the button. His hands are dirty. He does not look at the screen.

> *"I'm on F-GKXA, CFM56-5B, fan section. I'm getting an unusual low-frequency vibration on the N1 shaft. It's not in the job card. What do I know about this?"*

He releases. He keeps his eyes on the engine.

### What Lore does
- Transcribes in real time
- Classifies intent automatically: **query**
- Queries F-GKXA's memory thread — retrieves Marc's note from October, the SOP threshold from 72-21-00, and the airframe's intervention history
- Synthesizes a response in strict priority: SOP first, then Marc's oral knowledge, then aircraft history
- Reads the answer aloud via TTS

**Thomas hears:**

> *"According to SOP 72-21-00, N1 vibration above 4 units requires escalation. You are below that threshold. Marc Delaunay — 26 years on CFM56 — noted in October that F-GKXA specifically shows a harmonic resonance between 2 and 3 units in cold conditions below 8 degrees. It is a known characteristic of this airframe, not a defect. Monitor across two cycles before escalating."*

### Outcome
Thomas does not ground the aircraft. He completes his check, documents his reading, and logs it. The 6am departure happens on time.

He made the right call — not by guessing, not by waking someone up, but because Marc told him. Three months after Marc left.

**This is the moment Lore exists for.**

---

## Journey 3 — Thomas logs (same night, 5 minutes later)

### Trigger
Intervention complete. Thomas needs to log it. He could fill in a paper form or open a system on a workstation across the hangar. He does not move.

### The moment
He holds the button again.

> *"Logging: N1 vibration at 2.4 units on F-GKXA, temperature 6 degrees. Fan section inspection complete, no escalation per Marc's note. Returning to service."*

He releases.

### What Lore does
- Classifies intent automatically: **log**
- Extracts structured data: aircraft, component, observation, action taken, escalation status
- Stores in F-GKXA's history thread
- Responds immediately (fire-and-forget persistence so there is no wait): *"Logged. F-GKXA memory updated. 7 interventions on record."*

### Outcome
The intervention is logged. Attributed to Thomas, dated, linked to F-GKXA. The next technician who queries this airframe will have this history as context.

The loop closes.

---

## The knowledge lifecycle

```
Marc debrief          Thomas query           Thomas log
    │                      │                     │
    ▼                      ▼                     ▼
Oral knowledge  ──►  Contextual answer  ──►  Aircraft history
stored in              synthesized from        added to
F-GKXA thread          SOP + Marc's note       F-GKXA thread
                                                    │
                                                    ▼
                                           Next technician's
                                           query includes this
```

Every interaction enriches the aircraft's memory. Every query draws from it. The system gets more useful every time someone uses it — without anyone managing it.

---

## What does not happen

Thomas does not open a manual. He does not call anyone. He does not search a document system. He does not type anything.

Marc does not fill in a form. He does not prepare a presentation. He does not write a document.

The knowledge transfer happens in 45 seconds of Marc speaking and 10 seconds of Thomas listening. The rest is Lore.

---

## Edge cases the journey surfaces

**What if Marc's note is wrong?**
It is attributed to him by name, date, and conditions. The next technician sees the source, not just the claim. In production, a lead technician reviews captured knowledge before it is fully activated. The system is designed for traceability, not blind trust.

**What if Thomas's question has no match?**
Lore says so. It does not fabricate. An honest "I don't have anything on this" is more valuable than a plausible-sounding wrong answer.

**What if the SOP and Marc disagree?**
The SOP wins. Always. Marc's knowledge is context — it never overrides a certified procedure. That constraint is structural, not a preference.

**What if Thomas is in a noisy hangar?**
Speechmatics is purpose-built for real-world audio environments. The fallback transcription path (server-side) activates if the real-time WebSocket degrades.
