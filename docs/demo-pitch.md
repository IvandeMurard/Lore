# Lore — Pitch Demo (3 minutes)

*Hackathon: Activate Your Voice · Speechmatics x AI Collective Paris*
*Track: Communication & Human Experience*

---

## Before you go on stage

- App open full screen, **Auto mode** (orange tab)
- Sound on, volume up — judges must hear TTS
- Mic tested, permissions granted
- Particle sphere idle
- Vercel URL ready on a second device as backup

---

## THE PITCH

### [0:00 – 0:25] The story

*Walk to center. No rush.*

In every airline, there is a technician named Marc. 26 years on the CFM56 engine. He knows things no manual has ever captured — that one specific aircraft vibrates a certain way when it's cold. Looks like a fault. It's not.

Marc retired three months ago.

*Beat.*

Tonight, Thomas — two years in — is alone in the hangar at 11pm. Same aircraft, same reading. 2.4 units on the N1 shaft. The procedure says investigate above 2.0. He's never seen this.

Does he ground a perfectly fine plane? Or let it go and hope?

He needs Marc. Marc is gone. Unless his knowledge didn't leave with him.

---

### [0:25 – 0:35] Introduce Lore

We built Lore. A voice AI that captures what seniors know — knowledge that's never in any document — and gives it back to juniors when they need it. All voice. No screen. Thomas has grease on his hands. He just talks.

*Gesture toward the app.*

Let me show you.

---

### [0:35 – 1:30] LIVE DEMO — Thomas asks his question

*Face the mic. You are Thomas — slightly uncertain, alone at 11pm.*

> "I'm on F-GKXA, CFM56-5B, fan section. I'm getting an unusual low-frequency vibration on the N1 shaft. It's not in the job card. What do I know about this?"

*Release. Step back. Let the audience watch the full cycle:*
*Transcript appears live → sphere pulses → "query" badge → response with sources → TTS reads it aloud.*

*Wait for TTS to finish. Then to audience:*

Lore gave Thomas the official SOP first — always. Then Marc's knowledge on top: this airframe has a known harmonic resonance in cold weather. Marc saw it four times in eight years. Monitor it, don't ground the plane.

And every response ends with: "Always verify the AMM procedure before intervening." That's structural. Lore never lets you skip the book.

---

### [1:30 – 2:00] The loop — how the knowledge got there

*Direct address. No live demo — narrate.*

But how did Marc's knowledge get into the system? Same way. Three months ago, Marc held the same button and talked for 45 seconds.

He said: "This airframe has a harmonic pattern in cold weather. Looks like a fault, it's not. I've seen it four times in eight years."

Lore didn't store a transcript. It structured his words — component, conditions, observation, recommendation. Attributed to Marc by name and date. And it generated a draft SOP section from oral input — steps, safety checks, escalation conditions. Ready for review.

And when Thomas finishes tonight, he logs his intervention by voice too. One sentence. The aircraft's memory is updated. The next technician benefits from both Marc and Thomas.

That's the loop. Capture, query, log. Oral becomes structured. Structured becomes institutional.

---

### [2:00 – 2:30] Why this works — Speechmatics + trust

This doesn't work without real-time voice. A technician in a hangar can't type. Can't search.

Speechmatics gives us real-time transcription in the browser over WebSocket. What surprised us: the accuracy on technical jargon — "CFM56-5B", "N1 shaft", "harmonic resonance" — correct out of the box. If the connection drops, we fall back to Speechmatics batch. Belt and suspenders.

On trust: Lore never contradicts a SOP. Official procedure first, always. Oral knowledge is attributed — "Marc noted in October..." — not anonymous. Every piece enters the system flagged for review. The technician decides. Lore advises.

---

### [2:30 – 3:00] Close

*Slow down.*

You could call this RAG. It's not. RAG retrieves documents that already exist. Marc's knowledge was never a document. There was nothing to retrieve.

Every airline has a Marc who is about to leave. Every hangar has a Thomas who will be alone tonight with a reading he doesn't recognize.

The knowledge is there. It just needs a voice.

That's Lore.

---

## POST-DEMO: Jury Q&A cheat sheet

**"Isn't this just RAG?"**
> RAG retrieves what you put in. Lore extracts what seniors never thought to write down — through voice, not documents. The capture step is the innovation.

**"What about EASA regulations?"**
> Lore never contradicts a SOP. Official procedure always cited first — that's structural, enforced in the system prompt. Oral knowledge is always attributed by name and date, enters with a validation flag. In production, a lead tech reviews before activation. Every response ends with: verify the AMM procedure.

**"How do you handle incorrect knowledge?"**
> Every piece is attributed: name, date, component, conditions. Enters flagged as unvalidated. In production, a review queue sits between capture and deployment. The system captures everything but doesn't trust everything blindly.

**"What about hallucination?"**
> Temperature is low. Synthesis is constrained to 4 sentences with strict source priority. If Lore has nothing, it says so. The mandatory AMM disclaimer is hardcoded. No LLM eliminates hallucination — that's why the final sentence exists.

**"Why voice?"**
> Because the user has grease on his hands. A hangar is not a desk. Voice is the only interface that works here. It's not a feature — it's the product.

**"Noisy environments?"**
> Speechmatics is built for real-world audio. We have dual-path: real-time WebSocket + batch API fallback.

**"Business model?"**
> Per-seat SaaS for MRO organizations. Tenant-isolated. Every retired technician costs millions in lost knowledge. Lore makes that cost zero.

**"Outside aviation?"**
> Capture, query, log — that loop applies anywhere experienced people leave and juniors arrive. Oil & gas, nuclear, rail, pharma. Aviation is our beachhead because the stakes force rigor.

---

## Fallback plans

| Failure | What to do |
|---------|-----------|
| STT fails | Type the transcript manually. Say: "The voice you're not hearing is Speechmatics in production." |
| TTS fails | Read the response aloud. Text always appears on screen. |
| Backboard timeout | Switch to manual Query tab to bypass orchestrator. |
| Running long | Cut the "Why this works" section — weave one Speechmatics line into the close. |
| Mic denied | Open Vercel URL on phone. |

---

## Flow

```
[0:00] Story — Marc retired, Thomas is alone
        │
        ▼
[0:25] Introduce Lore — "He just talks"
        │
        ▼
[0:35] ★ LIVE DEMO — Query ★
        │  STT → Orchestrator → Backboard RAG → Synthesis → TTS
        ▼
[1:30] Narrate — Capture (Marc, 3 months ago) + Log (Thomas, tonight)
        │
        ▼
[2:00] Speechmatics + Trust — real-time voice, SOP primacy
        │
        ▼
[2:30] Close — "The knowledge is there. It just needs a voice."
```
