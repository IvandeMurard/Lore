# Lore — 3-Minute Pitch

*Speaker notes. Read at natural pace. Timing marks are approximate.*

---

## [0:00 — 0:30] The Problem

(Analogy to pyramids?)

Every year in France, 8,000 senior aviation technicians retire.

Each one of them carries 20, 25, 30 years of knowledge that is not in any manual.

Not because they're hiding it. Because nobody ever asked.

Marc Delaunay, 26 years on CFM56 engines. He knows that tail number F-GKXA vibrates at 2.4 units on the N1 shaft when it's cold outside. He knows it looks like a fault. He knows it's not.

That's not in any SOP. That's not in any document. That's in Marc's head.

Marc retired three months ago.

*(pause)*

Thomas is 24. Two years in. Tonight, alone at 11pm, he's staring at the same reading. 2.4 units. The SOP says investigate above 2.0. Does he ground a plane that's fine? Or does he let it go and hope?

He needs Marc. Marc is gone.

---

## [0:30 — 1:00] The Product

We built Lore. A voice AI that captures what Marc knows before he leaves — and puts it in Thomas's ear when he needs it.

Three interactions. All voice. No screen, no keyboard, no typing. Thomas has grease on his hands and an engine in front of him.

**Capture** — Marc speaks for 45 seconds. Lore structures, classifies, and stores his knowledge. Linked to the aircraft, the component, the conditions. Attributed to Marc by name and date.

**Query** — Thomas holds a button and asks his question. Lore answers with the official procedure first — always — then adds Marc's context on top. "Marc Delaunay, 26 years on CFM56, noted in October that this is a known characteristic of this airframe. Monitor across two cycles."

**Log** — Thomas logs his intervention by voice. One sentence. Done. The aircraft's memory is updated.

Marc spoke once. Thomas benefits forever. And so does the next technician after Thomas.

---

## [1:00 — 1:40] The Tech — Speechmatics Integration

This product does not work without real-time voice. We needed STT that works in a hangar — not a quiet meeting room. Jet engines, pneumatic tools, echoes off metal walls.

Speechmatics was the obvious choice. Real-time WebSocket connection, browser-side. The technician speaks, the transcript appears word by word. No upload, no wait, no batch processing.

Integration experience: we had real-time transcription running in the browser within two hours. The SDK is clean — open a WebSocket, send audio chunks, get results back. We added a server-side fallback for reliability: if the real-time connection drops in a noisy environment, we catch the audio locally and send it to the batch endpoint. Belt and suspenders.

What surprised us: the accuracy on technical vocabulary. "CFM56-5B", "N1 shaft", "harmonic resonance" — it got them right out of the box, especially when using the custom dictionary feature.

The real-time aspect is what makes Lore feel like a conversation, not a search engine. Thomas speaks, he sees his words appear, Lore answers. It's a dialogue. Speechmatics makes that possible.

---

## [1:40 — 2:20] What Makes This Different

You could say this is RAG. It is not.

RAG retrieves documents that already exist. Lore captures knowledge that has never been written down. There is no document to retrieve. The document is Marc's memory.

When Marc debriefs, Lore doesn't just store a transcript. It asks follow-up questions like an auditor: "Is that what the SOP says, or is this your own method?" It classifies what it hears: is this a trick that works but isn't in the book? A risk where a beginner would get it wrong? A gap between the procedure and reality?

And then it generates a draft SOP section from oral input. Marc speaks for 45 seconds. Lore produces a structured procedure — title, preconditions, safety checks, step-by-step instructions, escalation conditions. Unvalidated, pending expert review. But it's there. Marc's 26 years, structured, in 45 seconds.

The knowledge loop closes: oral becomes structured. Structured becomes institutional. One technician's experience becomes the entire team's baseline.

---

## [2:20 — 2:50] Trust and Safety

Aviation is the most regulated industry in the world. We know.

Rule number one: Lore never contradicts a SOP. The official procedure is always cited first, always takes priority. That's structural — it's in the system prompt, not a preference.

Oral knowledge is always attributed. "Marc Delaunay noted..." — not "a source suggests." The technician hearing the answer knows exactly where it comes from and can weigh it accordingly.

Captured knowledge enters the system with a validation flag. In production, a lead technician reviews it before it goes live. The system captures everything, but it doesn't trust everything.

And at the end of every response, Lore reminds Thomas what Marc would remind him: check the procedure before you act.

---

## [2:50 — 3:00] Close

Every airline in the world has a Marc who is about to leave.

Every hangar has a Thomas who will be alone at 11pm with a reading he doesn't recognize.

The knowledge is there. It just needs a voice.

That's Lore.
