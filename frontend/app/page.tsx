"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ModeToggle, type LoreMode } from "@/components/mode-toggle";
import { HoldToSpeakButton } from "@/components/hold-to-speak-button";
import { TranscriptPanel } from "@/components/transcript-panel";
import { ResponsePanel, type LoreSource } from "@/components/response-panel";
import { ParticleSphere } from "@/components/particle-sphere";
import { Badge } from "@/components/ui/badge";

interface SpeechmaticsResult {
  type?: string;
  alternatives?: Array<{ content?: string }>;
}

interface SpeechmaticsRealtimeMessage {
  message?: string;
  metadata?: {
    transcript?: string;
  };
  results?: SpeechmaticsResult[];
  error?: string;
  reason?: string;
}

function parseServerTiming(header: string | null): Record<string, number> {
  if (!header) return {};
  const output: Record<string, number> = {};
  const metrics = header.split(",");

  for (const metric of metrics) {
    const [namePart, ...rest] = metric.trim().split(";");
    const name = namePart.trim();
    const durToken = rest.find((token) => token.trim().startsWith("dur="));
    if (!name || !durToken) continue;
    const value = Number(durToken.trim().slice(4));
    if (Number.isFinite(value)) {
      output[name] = value;
    }
  }

  return output;
}

function parseRealtimeMessage(raw: string): SpeechmaticsRealtimeMessage | null {
  try {
    return JSON.parse(raw) as SpeechmaticsRealtimeMessage;
  } catch {
    return null;
  }
}

function mergeTranscript(base: string, fragment: string): string {
  const left = base.trim();
  const right = fragment.trim();
  if (!left) return right;
  if (!right) return left;
  const startsWithPunctuation = /^[,.;:!?)]/.test(right);
  return startsWithPunctuation ? `${left}${right}` : `${left} ${right}`;
}

function resultsToText(results: SpeechmaticsResult[] | undefined): string {
  if (!results || results.length === 0) return "";
  let text = "";
  for (const result of results) {
    const token = result.alternatives?.[0]?.content?.trim() ?? "";
    if (!token) continue;
    text = mergeTranscript(text, token);
  }
  return text;
}

function getTranscriptFragment(data: SpeechmaticsRealtimeMessage): string {
  const metaTranscript = data.metadata?.transcript?.trim();
  if (metaTranscript) return metaTranscript;
  return resultsToText(data.results);
}

function buildSpokenTtsText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const maxChars = 240;
  const maxWords = 55;
  const maxSentences = 2;
  const sentenceMatches = normalized.match(/[^.!?]+[.!?]?/g) ?? [normalized];

  let spoken = "";
  let sentenceCount = 0;

  for (const sentenceRaw of sentenceMatches) {
    const sentence = sentenceRaw.trim();
    if (!sentence) continue;

    const candidate = spoken ? `${spoken} ${sentence}` : sentence;
    const words = candidate.split(/\s+/).filter(Boolean).length;

    if (candidate.length > maxChars || words > maxWords) {
      break;
    }

    spoken = candidate;
    sentenceCount += 1;

    if (sentenceCount >= maxSentences) {
      break;
    }
  }

  if (spoken) return spoken;
  return normalized.slice(0, maxChars);
}

function getRealtimeWsCandidates(jwt: string, language: string): string[] {
  const encodedJwt = encodeURIComponent(jwt);
  const endpointOverride = (process.env.NEXT_PUBLIC_SPEECHMATICS_RT_WS_ENDPOINT ?? "").trim();
  const hosts = [
    endpointOverride,
    "eu2.rt.speechmatics.com",
    "eu.rt.speechmatics.com",
    "us2.rt.speechmatics.com",
    "us.rt.speechmatics.com",
  ].filter(Boolean);

  const urls: string[] = [];
  for (const host of hosts) {
    urls.push(`wss://${host}/v2?jwt=${encodedJwt}`);
    urls.push(`wss://${host}/v2/${language}?jwt=${encodedJwt}`);
  }
  return Array.from(new Set(urls));
}

export default function LorePage() {
  const [mode, setMode] = useState<LoreMode>("auto");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [sources, setSources] = useState<LoreSource[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);

  const meterAnimationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterSessionRef = useRef(0);

  const realtimeSessionRef = useRef(0);
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const realtimeProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const realtimeSinkRef = useRef<GainNode | null>(null);
  const realtimeSeqNoRef = useRef(0);
  const realtimePartialRef = useRef("");
  const realtimeFinalRef = useRef("");
  const endOfTranscriptResolverRef = useRef<(() => void) | null>(null);
  const shouldRecordRef = useRef(false);
  const responseAudioRef = useRef<HTMLAudioElement | null>(null);
  const responseAudioUrlRef = useRef<string | null>(null);

  const stopVoiceMeter = useCallback(() => {
    meterSessionRef.current += 1;

    if (meterAnimationRef.current !== null) {
      cancelAnimationFrame(meterAnimationRef.current);
      meterAnimationRef.current = null;
    }

    analyserRef.current?.disconnect();
    analyserRef.current = null;

    mediaSourceRef.current?.disconnect();
    mediaSourceRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setVoiceLevel(0);
  }, []);

  const stopResponseAudio = useCallback(() => {
    const audio = responseAudioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
      responseAudioRef.current = null;
    }

    const audioUrl = responseAudioUrlRef.current;
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      responseAudioUrlRef.current = null;
    }
  }, []);

  const playTtsResponse = useCallback(
    async (text: string) => {
      const cleanText = text.trim().replace(/\s+/g, " ");
      if (!cleanText) return;

      const tStart = performance.now();
      stopResponseAudio();

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText }),
      });
      const tAfterFetch = performance.now();

      if (!response.ok) {
        let message = `TTS failed (${response.status}).`;
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) message = payload.error;
        } catch {
          const body = await response.text();
          if (body) message = `${message} ${body}`;
        }
        throw new Error(message);
      }

      const audioBlob = await response.blob();
      const tAfterBlob = performance.now();
      if (!audioBlob.size) {
        throw new Error("TTS returned empty audio.");
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      responseAudioRef.current = audio;
      responseAudioUrlRef.current = audioUrl;

      const serverTiming = parseServerTiming(response.headers.get("server-timing"));
      const model = response.headers.get("x-tts-model");
      const textLength = response.headers.get("x-tts-text-length");
      const audioBytes = response.headers.get("x-tts-audio-bytes");
      const timingSnapshot = {
        model,
        textLength: textLength ? Number(textLength) : cleanText.length,
        audioBytes: audioBytes ? Number(audioBytes) : audioBlob.size,
        clientFetchMs: Number((tAfterFetch - tStart).toFixed(1)),
        clientBlobMs: Number((tAfterBlob - tAfterFetch).toFixed(1)),
        serverTiming,
      };

      console.log("[tts] response-ready", timingSnapshot);

      const clearAudioRefs = () => {
        if (responseAudioRef.current === audio) {
          responseAudioRef.current = null;
        }
        if (responseAudioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          responseAudioUrlRef.current = null;
        }
      };

      audio.onended = clearAudioRefs;
      audio.onerror = clearAudioRefs;

      try {
        await audio.play();
        const tAfterPlay = performance.now();
        console.log("[tts] playback-started", {
          ...timingSnapshot,
          clientPlayStartMs: Number((tAfterPlay - tAfterBlob).toFixed(1)),
          clientTotalMs: Number((tAfterPlay - tStart).toFixed(1)),
        });
      } catch (error) {
        // This is expected if user starts recording or we replace audio mid-playback.
        if (error instanceof DOMException && error.name === "AbortError") {
          console.log("[tts] playback-aborted");
          return;
        }
        throw error;
      }
    },
    [stopResponseAudio]
  );

  const startVoiceMeter = useCallback(async () => {
    stopVoiceMeter();
    const session = meterSessionRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (session !== meterSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }

      const AudioContextCtor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("AudioContext is not supported in this browser.");
      }

      const audioContext = new AudioContextCtor();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      if (session !== meterSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        void audioContext.close();
        return null;
      }

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      mediaStreamRef.current = stream;
      audioContextRef.current = audioContext;
      mediaSourceRef.current = source;
      analyserRef.current = analyser;

      const sample = () => {
        if (session !== meterSessionRef.current) return;
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i += 1) {
          const normalized = (data[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }

        const rms = Math.sqrt(sumSquares / data.length);
        const nextLevel = Math.min(1, Math.max(0, (rms - 0.015) * 12));
        setVoiceLevel((prev) => prev * 0.72 + nextLevel * 0.28);
        meterAnimationRef.current = requestAnimationFrame(sample);
      };

      sample();
      return stream;
    } catch (error) {
      console.error("Failed to access microphone for level metering:", error);
      setIsRecording(false);
      stopVoiceMeter();
      return null;
    }
  }, [stopVoiceMeter]);

  const fetchRealtimeJwt = useCallback(async (): Promise<string> => {
    const response = await fetch("/api/speechmatics-token", { method: "POST" });
    if (!response.ok) {
      let message = `Failed to get Speechmatics realtime token (${response.status}).`;
      try {
        const payload = (await response.json()) as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        const body = await response.text();
        if (body) message = `${message} ${body}`;
      }
      throw new Error(message);
    }

    const payload = (await response.json()) as { token?: string };
    if (!payload.token) {
      throw new Error("Speechmatics token response was empty.");
    }
    return payload.token;
  }, []);

  const connectRealtimeSocket = useCallback(
    async (jwt: string, language: string, sampleRate: number, sessionId: number) => {
      let lastError: Error | null = null;
      const urls = getRealtimeWsCandidates(jwt, language);

      for (const url of urls) {
        try {
          const socket = await new Promise<WebSocket>((resolve, reject) => {
            const ws = new WebSocket(url);
            let settled = false;
            const timeout = window.setTimeout(() => {
              if (settled) return;
              settled = true;
              ws.close();
              reject(new Error(`Speechmatics realtime timeout for ${url}`));
            }, 6000);

            ws.onopen = () => {
              ws.send(
                JSON.stringify({
                  message: "StartRecognition",
                  audio_format: {
                    type: "raw",
                    encoding: "pcm_f32le",
                    sample_rate: Math.round(sampleRate),
                  },
                  transcription_config: {
                    language,
                    enable_partials: true,
                    max_delay: 1,
                    operating_point: "enhanced",
                  },
                })
              );
            };

            ws.onmessage = (event) => {
              if (settled) return;
              const data = parseRealtimeMessage(String(event.data));
              if (!data?.message) return;

              if (data.message === "RecognitionStarted") {
                settled = true;
                clearTimeout(timeout);
                resolve(ws);
                return;
              }

              if (data.message === "Error") {
                settled = true;
                clearTimeout(timeout);
                reject(new Error(data.error || data.reason || `Realtime error at ${url}`));
              }
            };

            ws.onerror = () => {
              if (settled) return;
              settled = true;
              clearTimeout(timeout);
              reject(new Error(`Speechmatics realtime connection error at ${url}`));
            };

            ws.onclose = () => {
              if (settled) return;
              settled = true;
              clearTimeout(timeout);
              reject(new Error(`Speechmatics realtime closed before start at ${url}`));
            };
          });

          if (sessionId !== realtimeSessionRef.current) {
            socket.close();
            throw new Error("Speechmatics realtime session changed.");
          }

          return socket;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }

      throw lastError ?? new Error("Unable to connect to Speechmatics realtime.");
    },
    []
  );

  const attachRealtimeHandlers = useCallback((socket: WebSocket, sessionId: number) => {
    socket.onmessage = (event) => {
      if (sessionId !== realtimeSessionRef.current) return;
      const data = parseRealtimeMessage(String(event.data));
      if (!data?.message) return;

      if (data.message === "AddPartialTranscript") {
        realtimePartialRef.current = getTranscriptFragment(data);
        setTranscript(mergeTranscript(realtimeFinalRef.current, realtimePartialRef.current));
        return;
      }

      if (data.message === "AddTranscript") {
        const fragment = getTranscriptFragment(data);
        realtimeFinalRef.current = mergeTranscript(realtimeFinalRef.current, fragment);
        realtimePartialRef.current = "";
        setTranscript(realtimeFinalRef.current);
        return;
      }

      if (data.message === "EndOfTranscript") {
        const resolver = endOfTranscriptResolverRef.current;
        endOfTranscriptResolverRef.current = null;
        resolver?.();
        return;
      }

      if (data.message === "Error") {
        const message = data.error || data.reason || "Speechmatics realtime error.";
        console.error("Speechmatics realtime error:", message);
      }
    };

    socket.onclose = () => {
      const resolver = endOfTranscriptResolverRef.current;
      endOfTranscriptResolverRef.current = null;
      resolver?.();
      if (realtimeSocketRef.current === socket) {
        realtimeSocketRef.current = null;
      }
    };
  }, []);

  const startRealtimeTranscription = useCallback(
    async (stream: MediaStream) => {
      const audioContext = audioContextRef.current;
      const source = mediaSourceRef.current;
      if (!audioContext || !source) {
        throw new Error("Audio context is not ready for realtime transcription.");
      }

      const sessionId = realtimeSessionRef.current + 1;
      realtimeSessionRef.current = sessionId;
      realtimeSeqNoRef.current = 0;
      realtimeFinalRef.current = "";
      realtimePartialRef.current = "";

      const jwt = await fetchRealtimeJwt();
      const socket = await connectRealtimeSocket(jwt, "en", audioContext.sampleRate, sessionId);
      attachRealtimeHandlers(socket, sessionId);
      realtimeSocketRef.current = socket;

      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      const sink = audioContext.createGain();
      sink.gain.value = 0;
      source.connect(processor);
      processor.connect(sink);
      sink.connect(audioContext.destination);

      processor.onaudioprocess = (event) => {
        if (sessionId !== realtimeSessionRef.current) return;
        const liveSocket = realtimeSocketRef.current;
        if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return;

        const channel = event.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(channel.length);
        chunk.set(channel);
        realtimeSeqNoRef.current += 1;
        liveSocket.send(chunk.buffer);
      };

      realtimeProcessorRef.current = processor;
      realtimeSinkRef.current = sink;
    },
    [attachRealtimeHandlers, connectRealtimeSocket, fetchRealtimeJwt]
  );

  const stopRealtimeTranscription = useCallback(async (): Promise<string> => {
    const processor = realtimeProcessorRef.current;
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
      realtimeProcessorRef.current = null;
    }

    const sink = realtimeSinkRef.current;
    if (sink) {
      sink.disconnect();
      realtimeSinkRef.current = null;
    }

    const socket = realtimeSocketRef.current;
    if (socket) {
      const waitForEnd = new Promise<void>((resolve) => {
        endOfTranscriptResolverRef.current = resolve;
        window.setTimeout(resolve, 1200);
      });

      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(
            JSON.stringify({
              message: "EndOfStream",
              last_seq_no: realtimeSeqNoRef.current,
            })
          );
          await waitForEnd;
        } catch {
          // ignore and close below
        }
      }

      socket.close();
      realtimeSocketRef.current = null;
    }

    endOfTranscriptResolverRef.current = null;
    const finalTranscript = mergeTranscript(realtimeFinalRef.current, realtimePartialRef.current);
    realtimeFinalRef.current = finalTranscript;
    realtimePartialRef.current = "";
    if (finalTranscript) {
      setTranscript(finalTranscript);
    }
    return finalTranscript;
  }, []);

  const handleStartCapture = useCallback(async () => {
    if (isRecording || isLoading) return;
    stopResponseAudio();
    shouldRecordRef.current = true;
    setIsRecording(true);
    setTranscript("");
    setResponse("");
    setSources([]);

    try {
      const stream = await startVoiceMeter();
      if (!stream) throw new Error("Microphone stream unavailable.");
      if (!shouldRecordRef.current) {
        stopVoiceMeter();
        return;
      }
      await startRealtimeTranscription(stream);
      if (!shouldRecordRef.current) {
        await stopRealtimeTranscription();
        stopVoiceMeter();
      }
    } catch (error) {
      console.error("Failed to start capture recording:", error);
      setIsRecording(false);
      shouldRecordRef.current = false;
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Unable to start transcription.";
      setTranscript(`Transcription error: ${message}`);
    }
  }, [
    isLoading,
    isRecording,
    startRealtimeTranscription,
    startVoiceMeter,
    stopResponseAudio,
    stopRealtimeTranscription,
    stopVoiceMeter,
  ]);

  const handleEndCapture = useCallback(async () => {
    if (!isRecording) return;
    shouldRecordRef.current = false;
    setIsRecording(false);

    try {
      const finalTranscript = await stopRealtimeTranscription();
      stopVoiceMeter();
      if (!finalTranscript) {
        setTranscript("No speech detected. Try again.");
        return;
      }

      setIsLoading(true);
      setResponse("");
      setSources([]);

      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: finalTranscript,
          technician: "Marc Delaunay",
          tail: "F-GKXA",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Capture failed.");

      const confirmation = data.confirmation || "Knowledge captured.";
      setResponse(confirmation);
      setSources([{ type: "oral", label: "Captured just now" }]);
      void playTtsResponse(confirmation).catch((error) => {
        console.error("TTS failed for capture:", error);
      });
    } catch (error) {
      console.error("Capture failed:", error);
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Capture failed.";
      setResponse(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [isRecording, playTtsResponse, stopRealtimeTranscription, stopVoiceMeter]);

  const handleStartQuery = useCallback(async () => {
    if (isRecording || isLoading) return;
    stopResponseAudio();
    shouldRecordRef.current = true;
    setIsRecording(true);
    setTranscript("");
    setResponse("");
    setSources([]);

    try {
      const stream = await startVoiceMeter();
      if (!stream) throw new Error("Microphone stream unavailable.");
      if (!shouldRecordRef.current) {
        stopVoiceMeter();
        return;
      }
      await startRealtimeTranscription(stream);
      if (!shouldRecordRef.current) {
        await stopRealtimeTranscription();
        stopVoiceMeter();
      }
    } catch (error) {
      console.error("Failed to start query recording:", error);
      setIsRecording(false);
      shouldRecordRef.current = false;
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Unable to start transcription.";
      setTranscript(`Transcription error: ${message}`);
    }
  }, [
    isLoading,
    isRecording,
    startRealtimeTranscription,
    startVoiceMeter,
    stopResponseAudio,
    stopRealtimeTranscription,
    stopVoiceMeter,
  ]);

  const handleEndQuery = useCallback(async () => {
    if (!isRecording) return;
    shouldRecordRef.current = false;
    setIsRecording(false);

    try {
      const finalTranscript = await stopRealtimeTranscription();
      stopVoiceMeter();

      if (!finalTranscript) {
        setTranscript("No speech detected. Try again.");
        return;
      }

      setIsLoading(true);
      setResponse("");
      setSources([]);

      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: finalTranscript,
          tail: "F-GKXA",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Query failed.");

      const answer = data.response || "No answer found.";
      setResponse(answer);
      if (data.sources && Array.isArray(data.sources)) {
        setSources(data.sources);
      }
      void playTtsResponse(buildSpokenTtsText(answer)).catch((error) => {
        console.error("TTS failed for query:", error);
      });
    } catch (error) {
      console.error("Query failed:", error);
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Query failed.";
      setResponse(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [isRecording, playTtsResponse, stopRealtimeTranscription, stopVoiceMeter]);

  const handleStartLog = useCallback(async () => {
    if (isRecording || isLoading) return;
    stopResponseAudio();
    shouldRecordRef.current = true;
    setIsRecording(true);
    setTranscript("");
    setResponse("");
    setSources([]);

    try {
      const stream = await startVoiceMeter();
      if (!stream) throw new Error("Microphone stream unavailable.");
      if (!shouldRecordRef.current) {
        stopVoiceMeter();
        return;
      }
      await startRealtimeTranscription(stream);
      if (!shouldRecordRef.current) {
        await stopRealtimeTranscription();
        stopVoiceMeter();
      }
    } catch (error) {
      console.error("Failed to start log recording:", error);
      setIsRecording(false);
      shouldRecordRef.current = false;
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Unable to start transcription.";
      setTranscript(`Transcription error: ${message}`);
    }
  }, [
    isLoading,
    isRecording,
    startRealtimeTranscription,
    startVoiceMeter,
    stopResponseAudio,
    stopRealtimeTranscription,
    stopVoiceMeter,
  ]);

  const handleEndLog = useCallback(async () => {
    if (!isRecording) return;
    shouldRecordRef.current = false;
    setIsRecording(false);

    try {
      const finalTranscript = await stopRealtimeTranscription();
      stopVoiceMeter();

      if (!finalTranscript) {
        setTranscript("No speech detected. Try again.");
        return;
      }

      setIsLoading(true);
      setResponse("");
      setSources([]);

      const tail = "F-GKXA";
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: finalTranscript,
          tail,
          technician: "Marc Delaunay",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Log failed.");

      const confirmation = data.confirmation || "Log saved.";
      setResponse(confirmation);
      const count =
        typeof data.intervention_count === "number" ? data.intervention_count : null;
      setSources([
        {
          type: "history",
          label: count === null ? `${tail} history` : `${tail} history (${count})`,
        },
      ]);
      void playTtsResponse(confirmation).catch((error) => {
        console.error("TTS failed for log:", error);
      });
    } catch (error) {
      console.error("Log failed:", error);
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Log failed.";
      setResponse(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [isRecording, playTtsResponse, stopRealtimeTranscription, stopVoiceMeter]);

  // ── Auto mode handlers ────────────────────────────
  const handleStartAuto = useCallback(async () => {
    if (isRecording || isLoading) return;
    stopResponseAudio();
    shouldRecordRef.current = true;
    setIsRecording(true);
    setTranscript("");
    setResponse("");
    setSources([]);

    try {
      const stream = await startVoiceMeter();
      if (!stream) throw new Error("Microphone stream unavailable.");
      if (!shouldRecordRef.current) {
        stopVoiceMeter();
        return;
      }
      await startRealtimeTranscription(stream);
      if (!shouldRecordRef.current) {
        await stopRealtimeTranscription();
        stopVoiceMeter();
      }
    } catch (error) {
      console.error("Failed to start auto recording:", error);
      setIsRecording(false);
      shouldRecordRef.current = false;
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Unable to start transcription.";
      setTranscript(`Transcription error: ${message}`);
    }
  }, [
    isLoading,
    isRecording,
    startRealtimeTranscription,
    startVoiceMeter,
    stopResponseAudio,
    stopRealtimeTranscription,
    stopVoiceMeter,
  ]);

  const handleEndAuto = useCallback(async () => {
    if (!isRecording) return;
    shouldRecordRef.current = false;
    setIsRecording(false);

    try {
      const finalTranscript = await stopRealtimeTranscription();
      stopVoiceMeter();

      if (!finalTranscript) {
        setTranscript("No speech detected. Try again.");
        return;
      }

      setIsLoading(true);
      setResponse("");
      setSources([]);

      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: finalTranscript,
          technician: "Marc Delaunay",
          tail: "F-GKXA",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Orchestration failed.");

      const answer = data.response || "No response.";
      setResponse(answer);

      // Show detected intent + sources
      const intentLabel = data.intent
        ? `Detected: ${data.intent}${data.confidence ? ` (${Math.round(data.confidence * 100)}%)` : ""}`
        : "auto";
      const autoSources: LoreSource[] = [
        { type: "intent", label: intentLabel },
        ...(data.sources && Array.isArray(data.sources) ? data.sources : []),
      ];
      if (data.intervention_count !== undefined) {
        autoSources.push({
          type: "history",
          label: `${data.intervention_count} intervention${data.intervention_count !== 1 ? "s" : ""} on record`,
        });
      }
      setSources(autoSources);

      void playTtsResponse(answer).catch((error) => {
        console.error("TTS failed for auto:", error);
      });
    } catch (error) {
      console.error("Auto orchestration failed:", error);
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Orchestration failed.";
      setResponse(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [isRecording, playTtsResponse, stopRealtimeTranscription, stopVoiceMeter]);

  useEffect(() => {
    return () => {
      shouldRecordRef.current = false;
      void stopRealtimeTranscription();
      stopResponseAudio();
      stopVoiceMeter();
    };
  }, [stopRealtimeTranscription, stopResponseAudio, stopVoiceMeter]);

  const onStart =
    mode === "auto"
      ? handleStartAuto
      : mode === "capture"
        ? handleStartCapture
        : mode === "query"
          ? handleStartQuery
          : handleStartLog;
  const onEnd =
    mode === "auto"
      ? handleEndAuto
      : mode === "capture"
        ? handleEndCapture
        : mode === "query"
          ? handleEndQuery
          : handleEndLog;

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Lore</h1>
        <Badge variant="secondary" className="font-mono text-xs">
          F-GKXA
        </Badge>
      </header>

      <div className="flex-1 container max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        <ModeToggle value={mode} onValueChange={setMode} />

        <div className="flex flex-col items-center gap-6">
          <div className="relative flex items-center justify-center w-[280px] h-[280px] rounded-full">
            <ParticleSphere
              level={voiceLevel}
              particleCount={700}
              isResponding={isLoading}
              className="absolute inset-0"
            />
          </div>
          <HoldToSpeakButton
            onStart={onStart}
            onEnd={onEnd}
            isRecording={isRecording}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground text-center">
            Hold to speak · Release to send
          </p>
        </div>

        <TranscriptPanel transcript={transcript} isLive={isRecording} />

        <ResponsePanel
          response={response}
          sources={sources}
          isLoading={isLoading}
        />
      </div>
    </main>
  );
}
