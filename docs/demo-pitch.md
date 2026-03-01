# Lore — Pitch Demo

*Hackathon: Activate Your Voice · Speechmatics x AI Collective Paris*
*Track: Communication & Human Experience*
*Duration: ~4 minutes (flexible)*

---

## Before you go on stage

- App open at full screen, **Auto mode** (orange tab selected)
- Sound on, volume up — judges must hear TTS responses
- Mic tested, permissions granted
- Tail badge shows **F-GKXA** in header
- Particle sphere idle (floating particles, calm)
- Have the Vercel URL as backup on a second device

---

## THE PITCH

### [0:00 – 0:30] Open — The story

*Walk to center. No rush. Look at the audience.*

In every airline in the world, there is a technician named Marc.

Marc has spent 26 years on the same engine. The CFM56. He knows things no manual has ever captured. He knows that one specific aircraft — tail F-GKXA — vibrates a certain way when it's cold outside. He knows it looks like a fault. He knows it's not.

That knowledge is not written anywhere. It's in Marc's hands, in his ears, in his memory.

Marc retired three months ago.

*Pause. One beat.*

Tonight, a junior named Thomas is alone in the hangar at 11pm. He looks at the same vibration reading — 2.4 units on the N1 shaft. The procedure says investigate above 2.0. He's never seen this before.

Does he ground a perfectly fine aircraft? Or does he let it go and hope?

He needs Marc. Marc is gone.

*Turn slightly toward the screen.*

Unless Marc's knowledge didn't leave with him.

---

### [0:30 – 0:45] Introduce Lore

We built Lore. A voice AI that captures what senior technicians know — the kind of knowledge that's never in any document — and gives it back to juniors when they need it.

No screen. No keyboard. No typing. Thomas has engine grease on his hands and a flashlight between his teeth. He just talks.

*Gesture toward the app on screen.*

Let me show you.

---

### [0:45 – 1:45] LIVE DEMO — Thomas asks a question

*Face the mic. You are now Thomas. Natural voice, slightly uncertain — a junior at 11pm alone in a hangar.*

> "I'm on F-GKXA, CFM56-5B, fan section. I'm getting an unusual low-frequency vibration on the N1 shaft. It's not in the job card. What do I know about this?"

*Release the button. Step back. Let the audience watch:*

1. **Transcript** appears word by word (Speechmatics real-time STT)
2. **Particle sphere** pulses — Lore is thinking
3. **"query"** intent badge appears
4. **Response** renders with source attribution
5. **TTS voice** reads the answer aloud

*Wait for TTS to finish. Let it land.*

*Then address the audience:*

You heard that. Lore gave Thomas the official SOP first — vibration above 4 units requires escalation, he's below that. Then it added Marc's knowledge on top: this specific aircraft has a known harmonic resonance in cold weather. Marc saw it four times in eight years. Monitor it, don't ground the plane.

And notice the last line — every single response ends with: "Always verify the AMM procedure before intervening." That's not optional. It's structural. Lore never lets a technician skip the book.

---

### [1:45 – 2:15] LIVE DEMO — Thomas logs his intervention

*Back to the mic. You're Thomas again. This time confident — he knows what to do now.*

> "Logging: vibration at 2.4 units, temperature 6 degrees. Fan section inspection complete, no escalation needed. Returning to service."

*Release. Let it process.*

**Audience sees:** "log" intent detected, confirmation appears, intervention count updates.

*To audience:*

Done. One sentence. F-GKXA's memory is updated. The next technician who works on this aircraft will have Thomas's observation as context — on top of Marc's, on top of the SOP.

The aircraft's history gets richer every time someone speaks to it.

---

### [2:15 – 3:00] Rewind — How Marc's knowledge got there

*Change tone. You're telling the backstory now.*

Now let me rewind. Three months ago, Marc is about to retire. His manager asks for a knowledge debrief. Marc has done this before — a printed form, two hours, forgotten in a filing cabinet. This time, it's different.

Marc holds a button and talks for 45 seconds.

*Hold the button. You are now Marc — calm, experienced, matter-of-fact.*

> "Debrief on F-GKXA. CFM56 fan section, N1 vibration. This airframe has a specific harmonic pattern in cold weather, below 8 degrees. Reads 2 to 3 units. Looks like a fault but it's not. I've seen it four times in eight years. Monitor across two cycles before you do anything."

*Release. Let it process.*

**Audience sees:** "capture" intent detected, knowledge structured and stored, SOP draft generated.

*To audience:*

45 seconds. That's all it took. Lore didn't just store a transcript. It structured Marc's words — component, conditions, observation, recommendation. It linked them to this specific aircraft. It attributed them to Marc by name and date. And it generated a draft SOP section from oral input — preconditions, steps, safety checks, escalation conditions. Ready for review.

Marc spoke once. Thomas benefits tonight. And every technician after Thomas benefits too.

---

### [3:00 – 3:30] What makes this different

*Step forward. Direct address.*

You could call this RAG. It's not.

RAG retrieves documents that already exist. Marc's knowledge was never a document. There was nothing to retrieve. The document was Marc's memory.

Lore captures what has never been written down. It structures it. It attributes it. And it synthesizes it with the official procedure — always SOP first, always.

The knowledge loop closes: oral becomes structured. Structured becomes institutional. One technician's 26 years become the entire team's baseline.

---

### [3:30 – 3:50] Speechmatics — why voice is the product

*This matters. The hackathon is theirs.*

This product doesn't work without real-time voice. A technician in a hangar can't type. He can't search. He can barely look at a screen.

Speechmatics gives us real-time transcription over WebSocket, directly in the browser. Thomas speaks, his words appear instantly. No upload, no batch processing, no waiting.

What surprised us most: the accuracy on technical jargon. "CFM56-5B", "N1 shaft", "harmonic resonance" — correct out of the box. In a domain where one wrong word changes everything, that matters.

And if the real-time connection drops in a noisy hangar, we catch the audio locally and fall back to Speechmatics batch. Belt and suspenders.

Real-time voice is what makes Lore feel like a conversation, not a search engine. Speechmatics makes that possible.

---

### [3:50 – 4:00] Close

*Slow down. Final beat.*

Every airline in the world has a Marc who is about to leave.

Every hangar has a Thomas who will be alone tonight with a reading he doesn't recognize.

The knowledge is there. It just needs a voice.

That's Lore.

---

## POST-DEMO: Jury Q&A cheat sheet

**"Isn't this just RAG?"**
> RAG retrieves what you put in. Lore extracts what seniors never thought to write down — through voice, not documents. The capture step is the innovation. There is no document to retrieve.

**"What about regulations? This is aviation."**
> Lore never contradicts a SOP. The official procedure is always cited first, always takes priority. That's structural — it's enforced in the system prompt, not a preference. Oral knowledge is always attributed by name and date, and enters the system with a validation flag. In production, a lead tech reviews before activation. And every response ends with: verify the AMM procedure.

**"How do you handle incorrect knowledge from a senior?"**
> Every piece is attributed: technician name, date, component, conditions. It enters flagged as unvalidated. The technician hearing the answer knows exactly where it comes from. In production, a review queue sits between capture and deployment. The system captures everything, but it doesn't trust everything blindly.

**"What about hallucination?"**
> Temperature is set low. The synthesis prompt is constrained to 4 sentences max with strict source priority. If Lore has nothing relevant, it says so — it does not fabricate. And the mandatory AMM disclaimer is hardcoded. But honestly, no LLM system eliminates hallucination completely. That's why the final sentence exists: always verify.

**"Why voice and not a search interface?"**
> Because the user has grease on his hands. A hangar is not a desk. The technician can't type, can't scroll, can barely look at a screen. Voice is the only interface that works in this context. It's not a feature — it's the product.

**"What about noisy environments?"**
> Speechmatics is built for real-world audio — not quiet meeting rooms. And we have a dual-path architecture: real-time WebSocket for low latency, batch API fallback if the connection degrades. The system adapts.

**"What's your business model?"**
> Per-seat SaaS for MRO organizations. One Backboard assistant per airline, tenant-isolated. The value prop is simple: every retired technician costs the industry millions in lost knowledge. Lore makes that cost zero.

**"Can this work outside aviation?"**
> The architecture is domain-agnostic. Capture, query, log — that loop applies to any field where experienced people leave and juniors arrive. Oil & gas, nuclear, rail, pharma manufacturing. Aviation is our beachhead because the stakes are highest and the regulatory framework forces us to build with rigor.

---

## Timing backup plans

| Scenario | Adjustment |
|----------|-----------|
| Running long (>4 min) | Cut the "Speechmatics" section — weave one line into the close instead |
| Running short (<3 min) | Expand the rewind/capture section with a second Marc quote |
| STT fails live | Type transcript into input, call API manually. Say: "Let me type what Thomas would say — the voice you're not hearing is Speechmatics in production." |
| TTS fails live | Read the response text aloud yourself. The text always appears on screen. |
| Backboard timeout | Switch to manual mode tabs (Query/Capture/Log) to bypass orchestrator |
| Mic denied | Open Vercel URL on phone, hold it near the laptop speaker |

---

## Demo flow diagram

```
[Narrative: Thomas is alone]
        │
        ▼
[LIVE: Query — "What do I know about N1 vibration?"]
        │  ← STT → Orchestrator → Backboard RAG → Synthesis → TTS
        ▼
[Explain: SOP first, then Marc's knowledge, sources shown]
        │
        ▼
[LIVE: Log — "Logging: 2.4 units, 6°C, no escalation"]
        │  ← STT → Orchestrator → Log extraction → Backboard persist
        ▼
[Explain: Aircraft memory grows with every interaction]
        │
        ▼
[Rewind: "Three months ago, this is how Marc's knowledge got there"]
        │
        ▼
[LIVE: Capture — Marc debriefs for 45 seconds]
        │  ← STT → Orchestrator → Elicitation → SOP draft → Backboard persist
        ▼
[Explain: Oral → Structured → Institutional]
        │
        ▼
[Close: "The knowledge is there. It just needs a voice."]
```
