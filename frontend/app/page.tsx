"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ModeToggle, type LoreMode } from "@/components/mode-toggle";
import { HoldToSpeakButton } from "@/components/hold-to-speak-button";
import { TranscriptPanel } from "@/components/transcript-panel";
import { ResponsePanel, type LoreSource } from "@/components/response-panel";
import { ParticleSphere } from "@/components/particle-sphere";
import { Badge } from "@/components/ui/badge";
import { buildSpokenTtsText } from "@/lib/tts";

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

interface ResolvedTranscript {
  transcript: string;
  fallbackError?: string;
}

const RT_MAX_DELAY_SEC = 3;
const RT_STOP_WAIT_PADDING_MS = 1200;

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
  const [loadingMessage, setLoadingMessage] = useState("Thinking…");
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<BlobPart[]>([]);
  const realtimeAvailableRef = useRef(false);

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

  const startBackupRecorder = useCallback((stream: MediaStream) => {
    if (typeof MediaRecorder === "undefined") {
      console.warn("MediaRecorder is not available in this browser.");
      return false;
    }

    recorderChunksRef.current = [];
    const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    const supportedMime = mimeCandidates.find((mime) => MediaRecorder.isTypeSupported(mime));

    const recorder = supportedMime
      ? new MediaRecorder(stream, { mimeType: supportedMime })
      : new MediaRecorder(stream);

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recorderChunksRef.current.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      console.error("Backup recorder error:", event);
    };

    recorder.start(250);
    mediaRecorderRef.current = recorder;
    return true;
  }, []);

  const stopBackupRecorder = useCallback(async (): Promise<File | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return null;

    if (recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        const cleanup = () => {
          recorder.removeEventListener("stop", cleanup);
          resolve();
        };
        recorder.addEventListener("stop", cleanup);
        try {
          recorder.requestData();
        } catch {
          // Some browsers may reject requestData while stopping; ignore and continue.
        }
        recorder.stop();
      });
    }

    mediaRecorderRef.current = null;
    const chunks = recorderChunksRef.current;
    recorderChunksRef.current = [];
    if (!chunks.length) return null;

    const blobType = recorder.mimeType || "audio/webm";
    const blob = new Blob(chunks, { type: blobType });
    if (blob.size === 0) return null;

    const extension = blobType.includes("mp4") ? "mp4" : "webm";
    return new File([blob], `fallback-stt.${extension}`, { type: blobType });
  }, []);

  const transcribeFallbackAudio = useCallback(async (audioFile: File): Promise<string> => {
    const formData = new FormData();
    formData.append("audio", audioFile);
    formData.append("language", "en");

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let message = `Fallback transcription failed (${response.status}).`;
      try {
        const payload = (await response.json()) as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        const body = await response.text();
        if (body) message = `${message} ${body}`;
      }
      throw new Error(message);
    }

    const payload = (await response.json()) as {
      transcript?: string;
      provider?: string;
      degraded?: boolean;
    };
    if (payload.provider) {
      console.log("[stt] fallback-transcribe", {
        provider: payload.provider,
        degraded: Boolean(payload.degraded),
      });
    }
    return (payload.transcript ?? "").trim();
  }, []);

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
                    max_delay: RT_MAX_DELAY_SEC,
                    operating_point: "enhanced",
                    enable_entities: true,
                    punctuation_overrides: {
                      permitted_marks: [".", ",", "?"],
                    },
                    additional_vocab: [
                      { content: "CFM56", sounds_like: ["CFM 56", "CFM fifty-six"] },
                      { content: "CFM56-5B", sounds_like: ["CFM 56 5B", "CFM fifty-six five B"] },
                      { content: "F-GKXA", sounds_like: ["foxtrot golf kilo x-ray alpha", "F G K X A"] },
                      { content: "N1", sounds_like: ["N one", "en one"] },
                      { content: "N2", sounds_like: ["N two", "en two"] },
                      { content: "borescope", sounds_like: ["bore scope"] },
                      { content: "AMM", sounds_like: ["A M M"] },
                      { content: "SOP", sounds_like: ["S O P", "standard operating procedure"] },
                      { content: "EASA", sounds_like: ["E A S A"] },
                      { content: "Lore" },
                      { content: "Airbus A320", sounds_like: ["A 320", "airbus 320", "airbus A three twenty"] },
                    ],
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

      // Start capturing audio IMMEDIATELY into a pre-buffer
      // so the first words aren't lost during JWT + WebSocket setup
      const preBuffer: Float32Array[] = [];
      let socketReady = false;

      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      const sink = audioContext.createGain();
      sink.gain.value = 0;
      source.connect(processor);
      processor.connect(sink);
      sink.connect(audioContext.destination);

      processor.onaudioprocess = (event) => {
        if (sessionId !== realtimeSessionRef.current) return;
        const channel = event.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(channel.length);
        chunk.set(channel);

        if (!socketReady) {
          // Buffer audio while socket connects
          preBuffer.push(chunk);
          return;
        }

        const liveSocket = realtimeSocketRef.current;
        if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return;
        realtimeSeqNoRef.current += 1;
        liveSocket.send(chunk.buffer);
      };

      realtimeProcessorRef.current = processor;
      realtimeSinkRef.current = sink;

      // Now connect (JWT + WebSocket) while audio is being buffered
      const jwt = await fetchRealtimeJwt();
      const socket = await connectRealtimeSocket(jwt, "en", audioContext.sampleRate, sessionId);
      attachRealtimeHandlers(socket, sessionId);
      realtimeSocketRef.current = socket;

      // Flush pre-buffer to catch the first words
      for (const buffered of preBuffer) {
        if (socket.readyState !== WebSocket.OPEN) break;
        realtimeSeqNoRef.current += 1;
        socket.send(buffered.buffer);
      }
      preBuffer.length = 0;
      socketReady = true;
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
        window.setTimeout(
          resolve,
          Math.max(1200, RT_MAX_DELAY_SEC * 1000 + RT_STOP_WAIT_PADDING_MS)
        );
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

  const resolveFinalTranscript = useCallback(async (): Promise<ResolvedTranscript> => {
    const realtimeTranscript = (await stopRealtimeTranscription()).trim();
    const backupAudio = await stopBackupRecorder();

    if (realtimeTranscript) {
      realtimeAvailableRef.current = true;
      return { transcript: realtimeTranscript };
    }

    if (!backupAudio) {
      if (!realtimeAvailableRef.current) {
        return {
          transcript: "",
          fallbackError:
            "Fallback STT failed: backup audio was not captured. Check mic permissions and browser recording support.",
        };
      }
      return { transcript: "" };
    }

    try {
      const fallbackTranscript = await transcribeFallbackAudio(backupAudio);
      if (fallbackTranscript) {
        setTranscript(fallbackTranscript);
      }
      return { transcript: fallbackTranscript };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown fallback transcription error.";
      const fallbackError = `Fallback STT failed: ${message}`;
      console.error(fallbackError, error);
      return { transcript: "", fallbackError };
    }
  }, [stopBackupRecorder, stopRealtimeTranscription, transcribeFallbackAudio]);

  const startSpeechCaptureSession = useCallback(
    async (modeLabel: string) => {
      const stream = await startVoiceMeter();
      if (!stream) throw new Error("Microphone stream unavailable.");

      startBackupRecorder(stream);

      if (!shouldRecordRef.current) {
        // Release may have happened while setup was in progress.
        // Let the end handler perform teardown exactly once.
        return;
      }

      try {
        await startRealtimeTranscription(stream);
        realtimeAvailableRef.current = true;
      } catch (error) {
        realtimeAvailableRef.current = false;
        console.warn(
          `Realtime Speechmatics failed for ${modeLabel}; using fallback transcription on release.`,
          error
        );
        setTranscript("Realtime STT unavailable. Release to transcribe from recorded audio.");
      }
      // Cleanup is handled by the release/end handlers.
    },
    [
      startBackupRecorder,
      startRealtimeTranscription,
      startVoiceMeter,
    ]
  );

  const handleStartCapture = useCallback(async () => {
    if (isRecording || isLoading) return;
    stopResponseAudio();
    shouldRecordRef.current = true;
    realtimeAvailableRef.current = false;
    setIsRecording(true);
    setLoadingMessage("Thinking…");
    setTranscript("");
    setResponse("");
    setSources([]);

    try {
      await startSpeechCaptureSession("capture");
    } catch (error) {
      console.error("Failed to start capture recording:", error);
      setIsRecording(false);
      shouldRecordRef.current = false;
      void stopBackupRecorder();
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Unable to start transcription.";
      setTranscript(`Transcription error: ${message}`);
    }
  }, [
    isLoading,
    isRecording,
    startSpeechCaptureSession,
    stopResponseAudio,
    stopBackupRecorder,
    stopVoiceMeter,
  ]);

  const handleEndCapture = useCallback(async () => {
    if (!isRecording) return;
    shouldRecordRef.current = false;
    setIsRecording(false);

    try {
      const { transcript: finalTranscript, fallbackError } = await resolveFinalTranscript();
      stopVoiceMeter();
      if (!finalTranscript) {
        setTranscript(fallbackError ?? "No speech detected. Try again.");
        return;
      }

      setIsLoading(true);
      setLoadingMessage("Captured information. Drafting SOP...");
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

      const data = (await res.json()) as {
        error?: string;
        confirmation?: string;
        sop_generated?: boolean;
        sop_draft_markdown?: string;
        sop_generation_warning?: string | null;
      };
      if (!res.ok) throw new Error(data.error || "Capture failed.");

      const confirmation = data.confirmation || "Knowledge captured.";
      const sopMarkdown = (data.sop_draft_markdown || "").trim();
      setResponse(sopMarkdown || confirmation);

      const captureSources: LoreSource[] = [
        {
          type: "oral",
          label: "Captured just now",
          details: `Captured transcript:\n${finalTranscript}`,
        },
      ];
      if (data.sop_generated) {
        captureSources.push({
          type: "sop",
          label: "SOP draft generated",
          details: sopMarkdown || "SOP draft generated successfully.",
        });
      } else if (data.sop_generation_warning) {
        captureSources.push({
          type: "system",
          label: "SOP draft fallback",
          details: data.sop_generation_warning,
        });
      }
      setSources(captureSources);

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
      setLoadingMessage("Thinking…");
    }
  }, [isRecording, playTtsResponse, resolveFinalTranscript, stopVoiceMeter]);

  const handleStartQuery = useCallback(async () => {
    if (isRecording || isLoading) return;
    stopResponseAudio();
    shouldRecordRef.current = true;
    realtimeAvailableRef.current = false;
    setIsRecording(true);
    setLoadingMessage("Thinking…");
    setTranscript("");
    setResponse("");
    setSources([]);

    try {
      await startSpeechCaptureSession("query");
    } catch (error) {
      console.error("Failed to start query recording:", error);
      setIsRecording(false);
      shouldRecordRef.current = false;
      void stopBackupRecorder();
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Unable to start transcription.";
      setTranscript(`Transcription error: ${message}`);
    }
  }, [
    isLoading,
    isRecording,
    startSpeechCaptureSession,
    stopResponseAudio,
    stopBackupRecorder,
    stopVoiceMeter,
  ]);

  const handleEndQuery = useCallback(async () => {
    if (!isRecording) return;
    shouldRecordRef.current = false;
    setIsRecording(false);

    try {
      const { transcript: finalTranscript, fallbackError } = await resolveFinalTranscript();
      stopVoiceMeter();

      if (!finalTranscript) {
        setTranscript(fallbackError ?? "No speech detected. Try again.");
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
  }, [isRecording, playTtsResponse, resolveFinalTranscript, stopVoiceMeter]);

  const handleStartLog = useCallback(async () => {
    if (isRecording || isLoading) return;
    stopResponseAudio();
    shouldRecordRef.current = true;
    realtimeAvailableRef.current = false;
    setIsRecording(true);
    setLoadingMessage("Thinking…");
    setTranscript("");
    setResponse("");
    setSources([]);

    try {
      await startSpeechCaptureSession("log");
    } catch (error) {
      console.error("Failed to start log recording:", error);
      setIsRecording(false);
      shouldRecordRef.current = false;
      void stopBackupRecorder();
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Unable to start transcription.";
      setTranscript(`Transcription error: ${message}`);
    }
  }, [
    isLoading,
    isRecording,
    startSpeechCaptureSession,
    stopResponseAudio,
    stopBackupRecorder,
    stopVoiceMeter,
  ]);

  const handleEndLog = useCallback(async () => {
    if (!isRecording) return;
    shouldRecordRef.current = false;
    setIsRecording(false);

    try {
      const { transcript: finalTranscript, fallbackError } = await resolveFinalTranscript();
      stopVoiceMeter();

      if (!finalTranscript) {
        setTranscript(fallbackError ?? "No speech detected. Try again.");
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
          details: `Logged transcript:\n${finalTranscript}`,
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
  }, [isRecording, playTtsResponse, resolveFinalTranscript, stopVoiceMeter]);

  // ── Auto mode handlers ────────────────────────────
  const handleStartAuto = useCallback(async () => {
    if (isRecording || isLoading) return;
    stopResponseAudio();
    shouldRecordRef.current = true;
    realtimeAvailableRef.current = false;
    setIsRecording(true);
    setLoadingMessage("Thinking…");
    setTranscript("");
    setResponse("");
    setSources([]);

    try {
      await startSpeechCaptureSession("auto");
    } catch (error) {
      console.error("Failed to start auto recording:", error);
      setIsRecording(false);
      shouldRecordRef.current = false;
      void stopBackupRecorder();
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Unable to start transcription.";
      setTranscript(`Transcription error: ${message}`);
    }
  }, [
    isLoading,
    isRecording,
    startSpeechCaptureSession,
    stopResponseAudio,
    stopBackupRecorder,
    stopVoiceMeter,
  ]);

  const handleEndAuto = useCallback(async () => {
    if (!isRecording) return;
    shouldRecordRef.current = false;
    setIsRecording(false);

    try {
      const { transcript: finalTranscript, fallbackError } = await resolveFinalTranscript();
      stopVoiceMeter();

      if (!finalTranscript) {
        setTranscript(fallbackError ?? "No speech detected. Try again.");
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
        {
          type: "intent",
          label: intentLabel,
          details: `Detected intent from transcript:\n${finalTranscript}`,
        },
        ...(data.sources && Array.isArray(data.sources) ? data.sources : []),
      ];
      if (data.intervention_count !== undefined) {
        autoSources.push({
          type: "history",
          label: `${data.intervention_count} intervention${data.intervention_count !== 1 ? "s" : ""} on record`,
        });
      }
      setSources(autoSources);

      void playTtsResponse(buildSpokenTtsText(answer)).catch((error) => {
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
  }, [isRecording, playTtsResponse, resolveFinalTranscript, stopVoiceMeter]);

  useEffect(() => {
    return () => {
      shouldRecordRef.current = false;
      void stopRealtimeTranscription();
      void stopBackupRecorder();
      stopResponseAudio();
      stopVoiceMeter();
    };
  }, [stopBackupRecorder, stopRealtimeTranscription, stopResponseAudio, stopVoiceMeter]);

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
          loadingMessage={loadingMessage}
        />
      </div>
    </main>
  );
}
