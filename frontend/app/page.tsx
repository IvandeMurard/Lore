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
    "eu1.rt.speechmatics.com",
    "eu.rt.speechmatics.com",
    "us2.rt.speechmatics.com",
    "us1.rt.speechmatics.com",
    "us.rt.speechmatics.com",
  ].filter(Boolean);

  const urls: string[] = [];
  for (const host of hosts) {
    urls.push(`wss://${host}/v2?jwt=${encodedJwt}`);
    urls.push(`wss://${host}/v2/${language}?jwt=${encodedJwt}`);
  }
  return [...new Set(urls)];
}

export default function LorePage() {
  const [mode, setMode] = useState<LoreMode>("query");
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
        setTranscript("I'm on F-GKXA, CFM56-5B. Unusual N1 vibration, not in the job card…");
      }
    } catch (error) {
      console.error("Capture transcription failed:", error);
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Transcription failed.";
      setTranscript(`Transcription error: ${message}`);
    }
  }, [isRecording, stopRealtimeTranscription, stopVoiceMeter]);

  const handleStartQuery = useCallback(async () => {
    if (isRecording || isLoading) return;
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
      setTranscript(finalTranscript || "What do I know about N1 vibration on this engine?");

      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        setResponse(
          "According to SOP 72-21-00, N1 vibration above 4 units requires escalation. Marc noted in October that F-GKXA shows harmonic resonance between 2–3 units in cold conditions — below 8°C. It's a known characteristic, not a defect. He recommended logging and monitoring over the next two cycles before escalating."
        );
        setSources([
          { type: "sop", label: "SOP 72-21-00" },
          { type: "oral", label: "Marc Delaunay, Oct 2025" },
          { type: "history", label: "F-GKXA history" },
        ]);
      }, 1500);
    } catch (error) {
      console.error("Query transcription failed:", error);
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Transcription failed.";
      setTranscript(`Transcription error: ${message}`);
      setIsLoading(false);
    }
  }, [isRecording, stopRealtimeTranscription, stopVoiceMeter]);

  useEffect(() => {
    return () => {
      shouldRecordRef.current = false;
      void stopRealtimeTranscription();
      stopVoiceMeter();
    };
  }, [stopRealtimeTranscription, stopVoiceMeter]);

  const onStart = mode === "capture" ? handleStartCapture : handleStartQuery;
  const onEnd = mode === "capture" ? handleEndCapture : handleEndQuery;

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
