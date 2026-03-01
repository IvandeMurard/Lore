"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ModeToggle, type LoreMode } from "@/components/mode-toggle";
import { HoldToSpeakButton } from "@/components/hold-to-speak-button";
import { TranscriptPanel } from "@/components/transcript-panel";
import { ResponsePanel, type LoreSource } from "@/components/response-panel";
import { ParticleSphere } from "@/components/particle-sphere";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SetupScreen, type OrgConfig } from "@/components/setup-screen";

interface SpeechmaticsResult {
  type?: string;
  speaker?: string;
  alternatives?: Array<{
    content?: string;
    speaker?: string;
    speaker_name?: string;
    speaker_tag?: string;
  }>;
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
  speakerFilter?: SpeakerFilterPayload;
  fullTranscript?: string;
  teacherTranscript?: string;
  inferredTeacherSpeakerLabel?: string | null;
}

interface TeacherSpeakerProfileResponse {
  configured: boolean;
  teacher_key: string;
  display_name?: string | null;
  identifier_count?: number;
  updated_at?: string | null;
}

type SpeakerFilterMode = "teacher_filtered" | "degraded_full" | "no_profile";
type CaptureScope = "teacher_only" | "full_conversation";

interface SpeakerFilterPayload {
  mode: SpeakerFilterMode;
  teacher_key: string;
  teacher_ratio: number;
  teacher_words: number;
  full_words: number;
  reason?: string;
}

interface PlayTtsOptions {
  truncate?: boolean;
  onEnded?: () => void;
}

const RT_MAX_DELAY_SEC = 3;
const RT_STOP_WAIT_PADDING_MS = 1200;
const TEACHER_KEY = "primary-expert";
const TEACHER_DISPLAY_NAME = "Primary Expert";
const TEACHER_MIN_WORDS = 6;
const TEACHER_MIN_RATIO = 0.25;
const DIARIZATION_MAX_SPEAKERS = 4;
const DIARIZATION_SPEAKER_SENSITIVITY = 0.6;
const HANDSFREE_SILENCE_MS = 1400;
const HANDSFREE_NO_SPEECH_MS = 6000;
const HANDSFREE_MAX_TURN_MS = 18000;
const HANDSFREE_ACTIVITY_LEVEL = 0.14;

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

function getSpeakerLabel(result: SpeechmaticsResult): string | null {
  if (typeof result.speaker === "string" && result.speaker.trim()) {
    return result.speaker.trim().toLowerCase();
  }
  const alt = result.alternatives?.[0];
  if (!alt) return null;
  const candidate = alt.speaker ?? alt.speaker_name ?? alt.speaker_tag;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim().toLowerCase();
  }
  return null;
}

function isUsableSpeakerLabel(label: string | null): label is string {
  if (!label) return false;
  return label !== "uu";
}

function findFirstUsableSpeakerLabel(
  results: SpeechmaticsResult[] | undefined
): string | null {
  if (!results || results.length === 0) return null;
  for (const result of results) {
    const label = getSpeakerLabel(result);
    if (isUsableSpeakerLabel(label)) {
      return label;
    }
  }
  return null;
}

function resultsToText(
  results: SpeechmaticsResult[] | undefined,
  speakerFilter?: string
): string {
  if (!results || results.length === 0) return "";
  let text = "";
  for (const result of results) {
    if (speakerFilter) {
      const speakerLabel = getSpeakerLabel(result);
      if (speakerLabel !== speakerFilter) {
        continue;
      }
    }
    const token = result.alternatives?.[0]?.content?.trim() ?? "";
    if (!token) continue;
    text = mergeTranscript(text, token);
  }
  return text;
}

function getTranscriptFragment(
  data: SpeechmaticsRealtimeMessage,
  speakerFilter?: string
): string {
  if (!speakerFilter) {
  const metaTranscript = data.metadata?.transcript?.trim();
  if (metaTranscript) return metaTranscript;
  }
  return resultsToText(data.results, speakerFilter);
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tag === "input" ||
    tag === "textarea" ||
    tag === "select"
  );
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
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [isEnrollingTeacher, setIsEnrollingTeacher] = useState(false);
  const [isEnrollmentRecording, setIsEnrollmentRecording] = useState(false);
  const [teacherProfile, setTeacherProfile] = useState<TeacherSpeakerProfileResponse>({
    configured: false,
    teacher_key: TEACHER_KEY,
  });
  const [sttSpeakerMode, setSttSpeakerMode] = useState<SpeakerFilterMode>("no_profile");
  const [sttSpeakerReason, setSttSpeakerReason] = useState<string | undefined>(undefined);
  const [captureScope, setCaptureScope] = useState<CaptureScope>("teacher_only");
  const [conversationLoopEnabled, setConversationLoopEnabled] = useState(true);
  const [orgConfig, setOrgConfig] = useState<OrgConfig | null | undefined>(undefined);

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
  const realtimeTeacherPartialRef = useRef("");
  const realtimeTeacherFinalRef = useRef("");
  const inferredTeacherSpeakerLabelRef = useRef<string | null>(null);
  const currentRealtimeModeRef = useRef<LoreMode>("auto");
  const currentSpeakerProfileRef = useRef<TeacherSpeakerProfileResponse | null>(null);
  const endOfTranscriptResolverRef = useRef<(() => void) | null>(null);
  const shouldRecordRef = useRef(false);
  const responseAudioRef = useRef<HTMLAudioElement | null>(null);
  const responseAudioUrlRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<BlobPart[]>([]);
  const realtimeAvailableRef = useRef(false);
  const handsFreeMonitorRef = useRef<number | null>(null);
  const lastSpeechActivityAtRef = useRef(0);
  const speechDetectedRef = useRef(false);
  const modeRef = useRef<LoreMode>("auto");
  const isRecordingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const isEnrollingTeacherRef = useRef(false);
  const isTtsPlayingRef = useRef(false);
  const conversationLoopEnabledRef = useRef(true);
  const conversationCycleRef = useRef(0);
  const startCaptureHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const endCaptureHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const startQueryHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const endQueryHandlerRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    isEnrollingTeacherRef.current = isEnrollingTeacher;
  }, [isEnrollingTeacher]);

  useEffect(() => {
    isTtsPlayingRef.current = isTtsPlaying;
  }, [isTtsPlaying]);

  useEffect(() => {
    conversationLoopEnabledRef.current = conversationLoopEnabled;
  }, [conversationLoopEnabled]);

  const clearHandsFreeMonitor = useCallback(() => {
    if (handsFreeMonitorRef.current !== null) {
      window.clearInterval(handsFreeMonitorRef.current);
      handsFreeMonitorRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!conversationLoopEnabled || (mode !== "capture" && mode !== "query")) {
      clearHandsFreeMonitor();
    }
  }, [clearHandsFreeMonitor, conversationLoopEnabled, mode]);

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
    speechDetectedRef.current = false;
    lastSpeechActivityAtRef.current = 0;
  }, []);

  const stopResponseAudio = useCallback(() => {
    clearHandsFreeMonitor();
    isTtsPlayingRef.current = false;
    setIsTtsPlaying(false);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
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
  }, [clearHandsFreeMonitor]);

  const playTtsResponse = useCallback(
    async (text: string, options?: PlayTtsOptions) => {
      const cleanText = text.trim().replace(/\s+/g, " ");
      if (!cleanText) return;

      const tStart = performance.now();
      stopResponseAudio();

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleanText,
          truncate: options?.truncate ?? true,
        }),
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

      const clearAudioRefs = (triggerEndedCallback: boolean) => {
        isTtsPlayingRef.current = false;
        setIsTtsPlaying(false);
        if (responseAudioRef.current === audio) {
          responseAudioRef.current = null;
        }
        if (responseAudioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          responseAudioUrlRef.current = null;
        }
        if (triggerEndedCallback) {
          options?.onEnded?.();
        }
      };

      audio.onplay = () => {
        isTtsPlayingRef.current = true;
        setIsTtsPlaying(true);
      };
      audio.onpause = () => {
        isTtsPlayingRef.current = false;
        setIsTtsPlaying(false);
      };
      audio.onended = () => clearAudioRefs(true);
      audio.onerror = () => clearAudioRefs(false);

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

  const armHandsFreeAutoEnd = useCallback(
    (targetMode: "capture" | "query", cycle: number) => {
      const endHandler =
        targetMode === "capture" ? endCaptureHandlerRef.current : endQueryHandlerRef.current;
      if (!endHandler) return;
      if (!isRecordingRef.current) return;

      const startedAt = Date.now();
      clearHandsFreeMonitor();

      handsFreeMonitorRef.current = window.setInterval(() => {
        if (conversationCycleRef.current !== cycle) {
          clearHandsFreeMonitor();
          return;
        }
        if (!conversationLoopEnabledRef.current || modeRef.current !== targetMode) {
          clearHandsFreeMonitor();
          return;
        }
        if (!isRecordingRef.current) {
          clearHandsFreeMonitor();
          return;
        }

        const now = Date.now();
        const elapsed = now - startedAt;
        const silenceElapsed = now - Math.max(lastSpeechActivityAtRef.current, startedAt);
        const noSpeechTimeout =
          !speechDetectedRef.current && elapsed >= HANDSFREE_NO_SPEECH_MS;
        const silenceTimeout =
          speechDetectedRef.current && silenceElapsed >= HANDSFREE_SILENCE_MS;
        const hardTimeout = elapsed >= HANDSFREE_MAX_TURN_MS;

        if (noSpeechTimeout || silenceTimeout || hardTimeout) {
          clearHandsFreeMonitor();
          shouldRecordRef.current = false;
          void endHandler();
        }
      }, 180);
    },
    [clearHandsFreeMonitor]
  );

  const maybeStartHandsFreeLoop = useCallback((targetMode: "capture" | "query") => {
    if (!conversationLoopEnabledRef.current) return;
    if (modeRef.current !== targetMode) return;
    if (
      isLoadingRef.current ||
      isRecordingRef.current ||
      isEnrollingTeacherRef.current ||
      isTtsPlayingRef.current
    ) {
      return;
    }

    const cycle = conversationCycleRef.current;
    const startHandler =
      targetMode === "capture" ? startCaptureHandlerRef.current : startQueryHandlerRef.current;

    if (!startHandler) return;

    speechDetectedRef.current = false;
    lastSpeechActivityAtRef.current = Date.now();

    void startHandler().then(() => {
      if (conversationCycleRef.current !== cycle) return;
      armHandsFreeAutoEnd(targetMode, cycle);
    }).catch((error) => {
      console.error(`Failed to auto-start ${targetMode} follow-up turn:`, error);
      clearHandsFreeMonitor();
    });
  }, [armHandsFreeAutoEnd, clearHandsFreeMonitor]);

  const playConversationalTurn = useCallback(
    (text: string, targetMode: "capture" | "query") => {
      conversationCycleRef.current += 1;
      const cycle = conversationCycleRef.current;

      void playTtsResponse(text, {
        truncate: false,
        onEnded: () => {
          if (conversationCycleRef.current !== cycle) return;
          maybeStartHandsFreeLoop(targetMode);
        },
      }).catch((error) => {
        console.error(`TTS failed for ${targetMode}:`, error);
      });
    },
    [maybeStartHandsFreeLoop, playTtsResponse]
  );

  const speakInstantFeedback = useCallback(
    (text: string) => {
      const cleanText = text.trim().replace(/\s+/g, " ");
      if (!cleanText) return;

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          const utterance = new SpeechSynthesisUtterance(cleanText);
          utterance.rate = 1.03;
          utterance.pitch = 1;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
          return;
        } catch (error) {
          console.warn("Instant speech feedback failed, falling back to API TTS:", error);
        }
      }

      void playTtsResponse(cleanText).catch((error) => {
        console.error("Fallback TTS feedback failed:", error);
      });
    },
    [playTtsResponse]
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
      analyser.smoothingTimeConstant = 0.92;
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
        const noiseFloor = 0.015;
        const preGain = 9.5;
        const compression = 0.95;
        const rawLevel = Math.max(0, (rms - noiseFloor) * preGain);
        const compressedLevel = rawLevel / (1 + rawLevel * compression);
        const nextLevel = Math.min(1, compressedLevel * 1.22);
        if (nextLevel > HANDSFREE_ACTIVITY_LEVEL) {
          lastSpeechActivityAtRef.current = Date.now();
          speechDetectedRef.current = true;
        }
        setVoiceLevel((prev) => {
          const smoothing = nextLevel > prev ? 0.16 : 0.1;
          return prev + (nextLevel - prev) * smoothing;
        });
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

  const fetchTeacherProfileStatus = useCallback(async (): Promise<TeacherSpeakerProfileResponse> => {
    const response = await fetch(`/api/speakers/profile?teacher_key=${encodeURIComponent(TEACHER_KEY)}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      let message = `Failed to load teacher profile (${response.status}).`;
      try {
        const payload = (await response.json()) as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        const body = await response.text();
        if (body) message = `${message} ${body}`;
      }
      throw new Error(message);
    }

    const payload = (await response.json()) as TeacherSpeakerProfileResponse;
    return {
      configured: Boolean(payload.configured),
      teacher_key: payload.teacher_key || TEACHER_KEY,
      display_name: payload.display_name ?? TEACHER_DISPLAY_NAME,
      identifier_count: typeof payload.identifier_count === "number" ? payload.identifier_count : 0,
      updated_at: payload.updated_at ?? null,
    };
  }, []);

  const recordEnrollmentSample = useCallback(async (durationMs = 10_000): Promise<File> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone API is not available in this browser.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    if (typeof MediaRecorder === "undefined") {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("MediaRecorder is not supported in this browser.");
    }

    const chunks: BlobPart[] = [];
    const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    const supportedMime = mimeCandidates.find((mime) => MediaRecorder.isTypeSupported(mime));
    let recorder: MediaRecorder;
    try {
      recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);
    } catch {
      // Retry without explicit mime in case browser rejects options.
      recorder = new MediaRecorder(stream);
    }

    return await new Promise<File>((resolve, reject) => {
      let settled = false;
      let stopTimer: number | null = null;
      let hardTimeout: number | null = null;
      const cleanup = () => {
        if (stopTimer !== null) window.clearTimeout(stopTimer);
        if (hardTimeout !== null) window.clearTimeout(hardTimeout);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };

      recorder.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Teacher enrollment recording failed."));
      };

      recorder.onstop = () => {
        if (settled) return;
        settled = true;
        cleanup();
        const blobType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: blobType });
        if (!blob.size) {
          reject(new Error("Enrollment recording was empty."));
          return;
        }
        const extension = blobType.includes("mp4") ? "mp4" : "webm";
        resolve(new File([blob], `teacher-enrollment.${extension}`, { type: blobType }));
      };

      try {
        recorder.start();
      } catch (error) {
        settled = true;
        cleanup();
        const message = error instanceof Error ? error.message : "Unable to start enrollment recording.";
        reject(new Error(message));
        return;
      }

      stopTimer = window.setTimeout(() => {
        if (recorder.state !== "inactive") {
          try {
            recorder.requestData();
          } catch {
            // ignore
          }
          recorder.stop();
        }
      }, durationMs);

      hardTimeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Enrollment recording timed out."));
      }, durationMs + 5_000);
    });
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

  const handleEnrollTeacher = useCallback(async () => {
    if (isRecording || isLoading || isEnrollingTeacher) return;
    stopResponseAudio();
    setIsEnrollingTeacher(true);
    setIsEnrollmentRecording(true);
    setIsRecording(true);
    setIsLoading(true);
    setLoadingMessage("Recording teacher voice sample (10s)...");
    setTranscript("Recording teacher voice sample... speak now.");
    setResponse("Recording teacher sample for enrollment.");
    setSources([]);

    try {
      const sample = await recordEnrollmentSample(10_000);
      setIsEnrollmentRecording(false);
      setIsRecording(false);
      setLoadingMessage("Enrolling teacher voice profile...");

      const formData = new FormData();
      formData.append("audio", sample);
      formData.append("teacher_key", TEACHER_KEY);
      formData.append("display_name", TEACHER_DISPLAY_NAME);

      const response = await fetch("/api/speakers/enroll", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
        identifier_count?: number;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ||
          `Teacher enrollment failed${payload.code ? ` (${payload.code})` : ""}.`
        );
      }

      const profile = await fetchTeacherProfileStatus();
      currentSpeakerProfileRef.current = profile;
      setTeacherProfile(profile);

      const detailLines = [
        `Teacher key: ${profile.teacher_key}`,
        "Mode: realtime speaker diarization",
        profile.updated_at ? `Updated: ${profile.updated_at}` : null,
      ].filter(Boolean);

      setResponse("Teacher diarization profile configured. Capture now filters to teacher speech when confidence is sufficient.");
      setSources([
        {
          type: "system",
          label: "Teacher profile configured",
          details: detailLines.join("\n"),
        },
      ]);
      speakInstantFeedback("Teacher profile configured.");
    } catch (error) {
      setIsEnrollmentRecording(false);
      setIsRecording(false);
      let message = error instanceof Error ? error.message : "Teacher enrollment failed.";
      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") {
          message = "Microphone permission denied. Allow microphone access and retry enrollment.";
        } else if (error.name === "NotFoundError") {
          message = "No microphone detected. Connect a microphone and retry enrollment.";
        } else if (error.name === "NotReadableError") {
          message = "Microphone is busy or unavailable. Close other apps using the mic and retry.";
        }
      }
      setResponse(`Error: ${message}`);
      setSources([
        {
          type: "system",
          label: "Teacher enrollment failed",
          details: message,
        },
      ]);
    } finally {
      setIsEnrollmentRecording(false);
      setIsRecording(false);
      setIsLoading(false);
      setLoadingMessage("Thinking…");
      setIsEnrollingTeacher(false);
    }
  }, [
    fetchTeacherProfileStatus,
    isEnrollingTeacher,
    isEnrollmentRecording,
    isLoading,
    isRecording,
    recordEnrollmentSample,
    speakInstantFeedback,
    stopResponseAudio,
  ]);

  const connectRealtimeSocket = useCallback(
    async (
      jwt: string,
      language: string,
      sampleRate: number,
      sessionId: number,
      speakerProfile?: TeacherSpeakerProfileResponse | null
    ) => {
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
              const setupAssetId = orgConfig?.assetId?.trim().toUpperCase();
              const setupAssetTokens = setupAssetId
                ? setupAssetId.split(/[-\s]+/).filter(Boolean)
                : [];
              const setupAssetSpelling = setupAssetTokens.join(" ");
              const additionalVocab: Array<{ content: string; sounds_like?: string[] }> = [
                { content: "CFM56", sounds_like: ["CFM 56", "CFM fifty-six"] },
                { content: "CFM56-5B", sounds_like: ["CFM 56 5B", "CFM fifty-six five B"] },
                { content: "N1", sounds_like: ["N one", "en one"] },
                { content: "N2", sounds_like: ["N two", "en two"] },
                { content: "borescope", sounds_like: ["bore scope"] },
                { content: "AMM", sounds_like: ["A M M"] },
                { content: "SOP", sounds_like: ["S O P", "standard operating procedure"] },
                { content: "EASA", sounds_like: ["E A S A"] },
                { content: "Lore" },
                { content: "Airbus A320", sounds_like: ["A 320", "airbus 320", "airbus A three twenty"] },
              ];
              if (setupAssetId) {
                additionalVocab.push({
                  content: setupAssetId,
                  sounds_like: setupAssetSpelling ? [setupAssetSpelling] : undefined,
                });
              }

              const startRecognitionPayload: Record<string, unknown> = {
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
                  additional_vocab: additionalVocab,
                },
              };

              if (speakerProfile?.configured) {
                const transcriptionConfig = startRecognitionPayload.transcription_config as Record<string, unknown>;
                transcriptionConfig.diarization = "speaker";
                transcriptionConfig.speaker_diarization_config = {
                  prefer_current_speaker: true,
                  speaker_sensitivity: DIARIZATION_SPEAKER_SENSITIVITY,
                  max_speakers: DIARIZATION_MAX_SPEAKERS,
                };
              }

              ws.send(
                JSON.stringify(startRecognitionPayload)
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
    [orgConfig?.assetId]
  );

  const attachRealtimeHandlers = useCallback((socket: WebSocket, sessionId: number) => {
    socket.onmessage = (event) => {
      if (sessionId !== realtimeSessionRef.current) return;
      const data = parseRealtimeMessage(String(event.data));
      if (!data?.message) return;
      const useTeacherDiarization =
        currentRealtimeModeRef.current === "capture" &&
        Boolean(currentSpeakerProfileRef.current?.configured);

      if (useTeacherDiarization && !inferredTeacherSpeakerLabelRef.current) {
        const inferred = findFirstUsableSpeakerLabel(data.results);
        if (inferred) {
          inferredTeacherSpeakerLabelRef.current = inferred;
        }
      }
      const teacherLabel = inferredTeacherSpeakerLabelRef.current;

      if (data.message === "AddPartialTranscript") {
        const partialFragment = getTranscriptFragment(data);
        realtimePartialRef.current = partialFragment;
        realtimeTeacherPartialRef.current =
          useTeacherDiarization && teacherLabel
            ? getTranscriptFragment(data, teacherLabel)
            : "";
        if (partialFragment.trim()) {
          speechDetectedRef.current = true;
          lastSpeechActivityAtRef.current = Date.now();
        }
        setTranscript(mergeTranscript(realtimeFinalRef.current, realtimePartialRef.current));
        return;
      }

      if (data.message === "AddTranscript") {
        const fragment = getTranscriptFragment(data);
        const teacherFragment =
          useTeacherDiarization && teacherLabel
            ? getTranscriptFragment(data, teacherLabel)
            : "";
        realtimeFinalRef.current = mergeTranscript(realtimeFinalRef.current, fragment);
        if (teacherFragment) {
          realtimeTeacherFinalRef.current = mergeTranscript(realtimeTeacherFinalRef.current, teacherFragment);
        }
        if (fragment.trim()) {
          speechDetectedRef.current = true;
          lastSpeechActivityAtRef.current = Date.now();
        }
        realtimePartialRef.current = "";
        realtimeTeacherPartialRef.current = "";
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
      realtimeTeacherFinalRef.current = "";
      realtimeTeacherPartialRef.current = "";
      inferredTeacherSpeakerLabelRef.current = null;

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
      const socket = await connectRealtimeSocket(
        jwt,
        "en",
        audioContext.sampleRate,
        sessionId,
        currentRealtimeModeRef.current === "capture" ? currentSpeakerProfileRef.current : null
      );
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
    realtimeTeacherFinalRef.current = mergeTranscript(
      realtimeTeacherFinalRef.current,
      realtimeTeacherPartialRef.current
    );
    realtimeTeacherPartialRef.current = "";
    if (finalTranscript) {
      setTranscript(finalTranscript);
    }
    return finalTranscript;
  }, []);

  const selectCaptureTranscriptWithSpeakerPolicy = useCallback(
    (
      fullTranscript: string,
      teacherTranscript: string,
      profile: TeacherSpeakerProfileResponse | null,
      reason?: string
    ): { transcript: string; speakerFilter: SpeakerFilterPayload } => {
      const fullWords = countWords(fullTranscript);
      const teacherWords = countWords(teacherTranscript);
      const ratio = fullWords > 0 ? teacherWords / fullWords : 0;

      if (!profile?.configured) {
        return {
          transcript: fullTranscript,
          speakerFilter: {
            mode: "no_profile",
            teacher_key: TEACHER_KEY,
            teacher_ratio: ratio,
            teacher_words: teacherWords,
            full_words: fullWords,
            reason: "teacher_profile_missing",
          },
        };
      }

      if (teacherWords >= TEACHER_MIN_WORDS && ratio >= TEACHER_MIN_RATIO) {
        return {
          transcript: teacherTranscript.trim() || fullTranscript,
          speakerFilter: {
            mode: "teacher_filtered",
            teacher_key: profile.teacher_key || TEACHER_KEY,
            teacher_ratio: ratio,
            teacher_words: teacherWords,
            full_words: fullWords,
          },
        };
      }

      return {
        transcript: fullTranscript,
        speakerFilter: {
          mode: "degraded_full",
          teacher_key: profile.teacher_key || TEACHER_KEY,
          teacher_ratio: ratio,
          teacher_words: teacherWords,
          full_words: fullWords,
          reason: reason || "teacher_unmatched_or_low_confidence",
        },
      };
    },
    []
  );

  const resolveFinalTranscript = useCallback(async (): Promise<ResolvedTranscript> => {
    const realtimeTranscript = (await stopRealtimeTranscription()).trim();
    const backupAudio = await stopBackupRecorder();
    const isCaptureMode = currentRealtimeModeRef.current === "capture";
    const speakerProfile = currentSpeakerProfileRef.current;
    const inferredTeacherSpeakerLabel = inferredTeacherSpeakerLabelRef.current;
    const teacherRealtimeTranscript = mergeTranscript(
      realtimeTeacherFinalRef.current,
      realtimeTeacherPartialRef.current
    ).trim();

    if (realtimeTranscript) {
      realtimeAvailableRef.current = true;
      if (!isCaptureMode) {
        return { transcript: realtimeTranscript };
      }
      if (captureScope === "full_conversation") {
        return {
          transcript: realtimeTranscript,
          speakerFilter: {
            mode: speakerProfile?.configured ? "degraded_full" : "no_profile",
            teacher_key: speakerProfile?.teacher_key || TEACHER_KEY,
            teacher_ratio: 0,
            teacher_words: 0,
            full_words: countWords(realtimeTranscript),
            reason: "full_conversation_selected",
          },
          fullTranscript: realtimeTranscript,
          teacherTranscript: teacherRealtimeTranscript,
          inferredTeacherSpeakerLabel,
        };
      }
      const selected = selectCaptureTranscriptWithSpeakerPolicy(
        realtimeTranscript,
        teacherRealtimeTranscript,
        speakerProfile,
        inferredTeacherSpeakerLabel ? undefined : "teacher_label_not_inferred"
      );
      if (selected.transcript) {
        setTranscript(selected.transcript);
      }
      return {
        transcript: selected.transcript,
        speakerFilter: selected.speakerFilter,
        fullTranscript: realtimeTranscript,
        teacherTranscript: teacherRealtimeTranscript,
        inferredTeacherSpeakerLabel,
      };
    }

    if (!backupAudio) {
      if (!realtimeAvailableRef.current) {
        const speakerFilter = isCaptureMode
          ? {
            mode: speakerProfile?.configured ? "degraded_full" : "no_profile",
            teacher_key: speakerProfile?.teacher_key || TEACHER_KEY,
            teacher_ratio: 0,
            teacher_words: 0,
            full_words: 0,
            reason: "realtime_transcript_unavailable",
          } satisfies SpeakerFilterPayload
          : undefined;
        return {
          transcript: "",
          fallbackError:
            "Fallback STT failed: backup audio was not captured. Check mic permissions and browser recording support.",
          speakerFilter,
        };
      }
      return {
        transcript: "",
        speakerFilter: isCaptureMode
          ? {
            mode: speakerProfile?.configured ? "degraded_full" : "no_profile",
            teacher_key: speakerProfile?.teacher_key || TEACHER_KEY,
            teacher_ratio: 0,
            teacher_words: 0,
            full_words: 0,
            reason: "no_transcript_available",
          }
          : undefined,
      };
    }

    try {
      const fallbackTranscript = await transcribeFallbackAudio(backupAudio);
      if (fallbackTranscript) {
        setTranscript(fallbackTranscript);
      }
      if (!isCaptureMode) {
        return { transcript: fallbackTranscript };
      }
      const fallbackWords = countWords(fallbackTranscript);
      if (captureScope === "full_conversation") {
        return {
          transcript: fallbackTranscript,
          speakerFilter: {
            mode: speakerProfile?.configured ? "degraded_full" : "no_profile",
            teacher_key: speakerProfile?.teacher_key || TEACHER_KEY,
            teacher_ratio: 0,
            teacher_words: 0,
            full_words: fallbackWords,
            reason: "full_conversation_selected",
          },
          fullTranscript: fallbackTranscript,
        };
      }
      return {
        transcript: fallbackTranscript,
        speakerFilter: {
          mode: speakerProfile?.configured ? "degraded_full" : "no_profile",
          teacher_key: speakerProfile?.teacher_key || TEACHER_KEY,
          teacher_ratio: 0,
          teacher_words: 0,
          full_words: fallbackWords,
          reason: "fallback_transcription_used",
        },
        fullTranscript: fallbackTranscript,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown fallback transcription error.";
      const fallbackError = `Fallback STT failed: ${message}`;
      console.error(fallbackError, error);
      return {
        transcript: "",
        fallbackError,
        speakerFilter: isCaptureMode
          ? {
            mode: speakerProfile?.configured ? "degraded_full" : "no_profile",
            teacher_key: speakerProfile?.teacher_key || TEACHER_KEY,
            teacher_ratio: 0,
            teacher_words: 0,
            full_words: 0,
            reason: "fallback_transcription_failed",
          }
          : undefined,
      };
    }
  }, [
    captureScope,
    selectCaptureTranscriptWithSpeakerPolicy,
    stopBackupRecorder,
    stopRealtimeTranscription,
    transcribeFallbackAudio,
  ]);

  const startSpeechCaptureSession = useCallback(
    async (modeLabel: LoreMode) => {
      currentRealtimeModeRef.current = modeLabel;
      speechDetectedRef.current = false;
      lastSpeechActivityAtRef.current = Date.now();
      if (modeLabel === "capture") {
        if (captureScope === "full_conversation") {
          currentSpeakerProfileRef.current = null;
        } else {
          try {
            const profile = await fetchTeacherProfileStatus();
            currentSpeakerProfileRef.current = profile;
            setTeacherProfile(profile);
          } catch (error) {
            console.warn("Failed to refresh teacher profile before capture:", error);
            const missingProfile: TeacherSpeakerProfileResponse = {
              configured: false,
              teacher_key: TEACHER_KEY,
              display_name: TEACHER_DISPLAY_NAME,
              identifier_count: 0,
              updated_at: null,
            };
            currentSpeakerProfileRef.current = missingProfile;
            setTeacherProfile(missingProfile);
          }
        }
      } else {
        currentSpeakerProfileRef.current = null;
      }

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
      captureScope,
      fetchTeacherProfileStatus,
      startBackupRecorder,
      startRealtimeTranscription,
      startVoiceMeter,
    ]
  );

  const handleStartCapture = useCallback(async () => {
    if (isRecording || isLoading || isEnrollingTeacher) return;
    clearHandsFreeMonitor();
    stopResponseAudio();
    shouldRecordRef.current = true;
    realtimeAvailableRef.current = false;
    setIsRecording(true);
    setLoadingMessage("Thinking…");
    setTranscript("");
    setResponse("");
    setSources([]);
    if (captureScope === "full_conversation") {
      setSttSpeakerMode(teacherProfile.configured ? "degraded_full" : "no_profile");
      setSttSpeakerReason("full_conversation_selected");
    } else {
      setSttSpeakerMode(teacherProfile.configured ? "degraded_full" : "no_profile");
      setSttSpeakerReason(undefined);
    }

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
    clearHandsFreeMonitor,
    isEnrollingTeacher,
    isLoading,
    isRecording,
    teacherProfile.configured,
    captureScope,
    startSpeechCaptureSession,
    stopResponseAudio,
    stopBackupRecorder,
    stopVoiceMeter,
  ]);

  const handleEndCapture = useCallback(async () => {
    if (!isRecording) return;
    clearHandsFreeMonitor();
    shouldRecordRef.current = false;
    setIsRecording(false);

    try {
      const {
        transcript: finalTranscript,
        fallbackError,
        speakerFilter,
        fullTranscript,
        teacherTranscript,
        inferredTeacherSpeakerLabel,
      } = await resolveFinalTranscript();
      stopVoiceMeter();
      if (!finalTranscript) {
        setTranscript(fallbackError ?? "No speech detected. Try again.");
        return;
      }
      if (speakerFilter) {
        setSttSpeakerMode(speakerFilter.mode);
        setSttSpeakerReason(speakerFilter.reason);
      }

      setIsLoading(true);
      setLoadingMessage("Captured information. Drafting SOP...");
      setResponse("");
      setSources([]);
      speakInstantFeedback(
        "Captured information. An SOP has been created for this information. Drafting details now."
      );

      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: finalTranscript,
          technician: orgConfig?.expertName?.trim() || "Unknown",
          tail: orgConfig?.assetId?.trim() || null,
          speaker_filter: speakerFilter,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        confirmation?: string;
        capture_accepted?: boolean;
        capture_rejection_reason?: string;
        sop_generated?: boolean;
        sop_draft_markdown?: string;
        sop_generation_warning?: string | null;
        degraded?: boolean;
        retryable?: boolean;
      };
      const confirmation = data.confirmation || "Knowledge captured.";
      const sopMarkdown = (data.sop_draft_markdown || "").trim();

      if (data.capture_accepted === false) {
        setResponse(confirmation);
        setSources([
          {
            type: "system",
            label: "Capture disregarded",
            details: `Reason: ${data.capture_rejection_reason || "capture_not_actionable"}\n\nTranscript:\n${finalTranscript}`,
          },
        ]);
        void playTtsResponse(confirmation, { truncate: false }).catch((error) => {
          console.error("TTS failed for capture:", error);
        });
        return;
      }

      const captureSources: LoreSource[] = [
        {
          type: "oral",
          label: "Captured just now",
          details:
            speakerFilter?.mode === "teacher_filtered" && fullTranscript
              ? `Selected transcript (used for SOP/memory):\n${finalTranscript}\n\nFull conversation transcript:\n${fullTranscript}`
              : `Captured transcript:\n${finalTranscript}`,
        },
      ];
      if (speakerFilter) {
        if (speakerFilter.reason === "full_conversation_selected") {
          captureSources.push({
            type: "system",
            label: "Full conversation capture",
            details: `Using full conversation transcript by user selection.\nFull words: ${speakerFilter.full_words}`,
          });
        } else if (speakerFilter.mode === "teacher_filtered") {
          captureSources.push({
            type: "system",
            label: "Teacher-only filtered",
            details: `Teacher transcript selected for capture.\nDetected teacher speaker label: ${inferredTeacherSpeakerLabel ?? "unknown"}\nTeacher ratio: ${speakerFilter.teacher_ratio.toFixed(2)}\nTeacher words: ${speakerFilter.teacher_words}\nFull words: ${speakerFilter.full_words}${teacherTranscript ? `\n\nTeacher-only transcript candidate:\n${teacherTranscript}` : ""}`,
          });
        } else {
          captureSources.push({
            type: "system",
            label: "Speaker ID degraded",
            details: `Using full transcript.\nMode: ${speakerFilter.mode}\nReason: ${speakerFilter.reason || "teacher_unmatched_or_low_confidence"}\nTeacher ratio: ${speakerFilter.teacher_ratio.toFixed(2)}`,
          });
        }
      }
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

      if (!res.ok) {
        if (sopMarkdown) {
          captureSources.push({
            type: "system",
            label: "Capture persistence degraded",
            details: `${data.error || "Capture persistence failed after SOP generation."}${
              data.retryable ? "\n\nRetry recommended." : ""
            }`,
          });
          setResponse(sopMarkdown);
          setSources(captureSources);
          void playTtsResponse(
            "Captured information. SOP drafted successfully, but persistence failed. Please retry.",
            { truncate: false }
          ).catch((error) => {
            console.error("TTS failed for capture:", error);
          });
          return;
        }
        throw new Error(data.error || "Capture failed.");
      }

      setResponse(sopMarkdown || confirmation);
      setSources(captureSources);
      playConversationalTurn(confirmation, "capture");
    } catch (error) {
      console.error("Capture failed:", error);
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Capture failed.";
      setResponse(`Error: ${message}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage("Thinking…");
    }
  }, [clearHandsFreeMonitor, isRecording, playConversationalTurn, playTtsResponse, resolveFinalTranscript, speakInstantFeedback, stopVoiceMeter]);

  const handleStartQuery = useCallback(async () => {
    if (isRecording || isLoading || isEnrollingTeacher) return;
    clearHandsFreeMonitor();
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
      if (conversationLoopEnabledRef.current && modeRef.current === "query") {
        armHandsFreeAutoEnd("query", conversationCycleRef.current);
      }
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
    armHandsFreeAutoEnd,
    clearHandsFreeMonitor,
    isEnrollingTeacher,
    isLoading,
    isRecording,
    startSpeechCaptureSession,
    stopResponseAudio,
    stopBackupRecorder,
    stopVoiceMeter,
  ]);

  const handleEndQuery = useCallback(async () => {
    if (!isRecording) return;
    clearHandsFreeMonitor();
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
      const tail = orgConfig?.assetId?.trim();
      if (!tail) {
        throw new Error("No asset is configured. Complete setup first.");
      }

      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: finalTranscript,
          tail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const detail = typeof data?.details === "string" ? data.details : "";
        throw new Error([data?.error || "Query failed.", detail].filter(Boolean).join(" "));
      }

      const answer = data.response || "No answer found.";
      setResponse(answer);
      if (data.sources && Array.isArray(data.sources)) {
        setSources(data.sources);
      }
      playConversationalTurn(answer, "query");
    } catch (error) {
      console.error("Query failed:", error);
      stopVoiceMeter();
      const message = error instanceof Error ? error.message : "Query failed.";
      setResponse(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [clearHandsFreeMonitor, isRecording, orgConfig?.assetId, playConversationalTurn, resolveFinalTranscript, stopVoiceMeter]);

  useEffect(() => {
    startCaptureHandlerRef.current = handleStartCapture;
    endCaptureHandlerRef.current = handleEndCapture;
    startQueryHandlerRef.current = handleStartQuery;
    endQueryHandlerRef.current = handleEndQuery;
  }, [handleEndCapture, handleEndQuery, handleStartCapture, handleStartQuery]);

  const handleStartLog = useCallback(async () => {
    if (isRecording || isLoading || isEnrollingTeacher) return;
    clearHandsFreeMonitor();
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
    clearHandsFreeMonitor,
    isEnrollingTeacher,
    isLoading,
    isRecording,
    startSpeechCaptureSession,
    stopResponseAudio,
    stopBackupRecorder,
    stopVoiceMeter,
  ]);

  const handleEndLog = useCallback(async () => {
    if (!isRecording) return;
    clearHandsFreeMonitor();
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

      const tail = orgConfig?.assetId?.trim();
      if (!tail) {
        throw new Error("No asset is configured. Complete setup first.");
      }
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: finalTranscript,
          tail,
          technician: orgConfig?.expertName?.trim() || "Unknown",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const detail = typeof data?.details === "string" ? data.details : "";
        throw new Error([data?.error || "Log failed.", detail].filter(Boolean).join(" "));
      }

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
      void playTtsResponse(confirmation, { truncate: false }).catch((error) => {
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
  }, [clearHandsFreeMonitor, isRecording, playTtsResponse, resolveFinalTranscript, stopVoiceMeter]);

  // ── Auto mode handlers ────────────────────────────
  const handleStartAuto = useCallback(async () => {
    if (isRecording || isLoading || isEnrollingTeacher) return;
    clearHandsFreeMonitor();
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
    clearHandsFreeMonitor,
    isEnrollingTeacher,
    isLoading,
    isRecording,
    startSpeechCaptureSession,
    stopResponseAudio,
    stopBackupRecorder,
    stopVoiceMeter,
  ]);

  const handleEndAuto = useCallback(async () => {
    if (!isRecording) return;
    clearHandsFreeMonitor();
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
          technician: orgConfig?.expertName?.trim() || "Unknown",
          tail: orgConfig?.assetId?.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const detail = typeof data?.details === "string" ? data.details : "";
        throw new Error([data?.error || "Orchestration failed.", detail].filter(Boolean).join(" "));
      }

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

      void playTtsResponse(answer, { truncate: false }).catch((error) => {
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
  }, [clearHandsFreeMonitor, isRecording, playTtsResponse, resolveFinalTranscript, stopVoiceMeter]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("lore_org_config");
      setOrgConfig(stored ? (JSON.parse(stored) as OrgConfig) : null);
    } catch {
      setOrgConfig(null);
    }
  }, []);

  const handleSetupComplete = useCallback((config: OrgConfig) => {
    try {
      localStorage.setItem("lore_org_config", JSON.stringify(config));
    } catch {
      // ignore storage errors
    }
    setOrgConfig(config);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profile = await fetchTeacherProfileStatus();
        if (cancelled) return;
        currentSpeakerProfileRef.current = profile;
        setTeacherProfile(profile);
      } catch (error) {
        if (cancelled) return;
        console.warn("Failed to load teacher profile status:", error);
        const fallbackProfile: TeacherSpeakerProfileResponse = {
          configured: false,
          teacher_key: TEACHER_KEY,
          display_name: TEACHER_DISPLAY_NAME,
          identifier_count: 0,
          updated_at: null,
        };
        currentSpeakerProfileRef.current = fallbackProfile;
        setTeacherProfile(fallbackProfile);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchTeacherProfileStatus]);

  useEffect(() => {
    return () => {
      shouldRecordRef.current = false;
      clearHandsFreeMonitor();
      void stopRealtimeTranscription();
      void stopBackupRecorder();
      stopResponseAudio();
      stopVoiceMeter();
    };
  }, [clearHandsFreeMonitor, stopBackupRecorder, stopRealtimeTranscription, stopResponseAudio, stopVoiceMeter]);

  const onStartRaw =
    mode === "auto"
      ? handleStartAuto
      : mode === "capture"
        ? handleStartCapture
        : mode === "query"
          ? handleStartQuery
          : handleStartLog;
  const onStart = useCallback(() => {
    conversationCycleRef.current += 1;
    void onStartRaw();
  }, [onStartRaw]);
  const onEnd =
    mode === "auto"
      ? handleEndAuto
      : mode === "capture"
        ? handleEndCapture
        : mode === "query"
          ? handleEndQuery
          : handleEndLog;
  const micInteractionMode =
    mode === "query" && conversationLoopEnabled ? "toggle" : "hold";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSpace = event.code === "Space" || event.key === " ";
      if (!isSpace) return;
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();

      if (isEnrollingTeacher) return;
      if (isRecording) {
        onEnd();
        return;
      }
      if (isTtsPlaying) {
        onStart();
        return;
      }
      if (!isLoading) {
        onStart();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isEnrollingTeacher, isLoading, isRecording, isTtsPlaying, onEnd, onStart]);

  if (orgConfig === undefined) return null;
  if (!orgConfig) {
    return <SetupScreen onComplete={handleSetupComplete} />;
  }

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Lore</h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            {orgConfig.assetId}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-auto py-0.5 px-2"
            onClick={() => {
              try { localStorage.removeItem("lore_org_config"); } catch { /* ignore */ }
              setOrgConfig(null);
            }}
          >
            Change
          </Button>
        </div>
      </header>

      <div className="flex-1 container max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        <ModeToggle value={mode} onValueChange={setMode} />

        {(mode === "capture" || mode === "query") && (
          <div className="rounded-md border border-border bg-card/60 p-3 flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Conversational Loop</span>
              <span className="text-xs text-muted-foreground">
                Lore reads full responses, then auto-listens and auto-sends after silence. You can interrupt anytime with the mic button or Space.
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant={conversationLoopEnabled ? "default" : "secondary"}
              disabled={isRecording || isLoading || isEnrollingTeacher}
              onClick={() => setConversationLoopEnabled((prev) => !prev)}
            >
              {conversationLoopEnabled ? "Auto listen ON" : "Auto listen OFF"}
            </Button>
          </div>
        )}

        {mode === "capture" && (
          <div className="rounded-md border border-border bg-card/60 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Capture scope</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={captureScope === "teacher_only" ? "default" : "secondary"}
                  disabled={isRecording || isLoading || isEnrollingTeacher}
                  onClick={() => setCaptureScope("teacher_only")}
                >
                  Teacher only
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={captureScope === "full_conversation" ? "default" : "secondary"}
                  disabled={isRecording || isLoading || isEnrollingTeacher}
                  onClick={() => setCaptureScope("full_conversation")}
                >
                  Full conversation
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium">Teacher Speaker Diarization</span>
                <span className="text-xs text-muted-foreground">
                  Record 8-12s of teacher speaking alone to enable filtered capture.
                </span>
              </div>
              <Badge variant={teacherProfile.configured ? "default" : "secondary"} className="text-xs">
                {teacherProfile.configured ? "Teacher profile: configured" : "Teacher profile: missing"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isRecording || isLoading || isEnrollingTeacher}
                onClick={handleEnrollTeacher}
              >
                {isEnrollmentRecording
                  ? "Recording sample..."
                  : isEnrollingTeacher
                    ? "Enrolling..."
                    : "Enroll teacher"}
              </Button>
              {teacherProfile.updated_at && (
                <span className="text-xs text-muted-foreground">
                  Last update: {teacherProfile.updated_at}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Last capture speaker mode: {sttSpeakerMode}
              {sttSpeakerReason ? ` (${sttSpeakerReason})` : ""}
            </p>
          </div>
        )}

        <div className="flex flex-col items-center gap-6">
          <div className="relative flex items-center justify-center w-[280px] h-[280px] rounded-full">
            <ParticleSphere
              level={voiceLevel}
              particleCount={700}
              isResponding={isLoading}
              isSpeaking={isTtsPlaying}
              className="absolute inset-0"
            />
          </div>
          <HoldToSpeakButton
            onStart={onStart}
            onEnd={onEnd}
            isRecording={isRecording}
            interactionMode={micInteractionMode}
            disabled={isLoading || isEnrollingTeacher}
          />
          <p className="text-xs text-muted-foreground text-center">
            {mode === "query" && conversationLoopEnabled
              ? "Tap mic to start voice chat · Lore auto-listens turn by turn · Tap again or press Space to interrupt"
              : mode === "capture" && conversationLoopEnabled
                ? "Hold to speak first turn · Lore auto-listens after speaking · Hold mic or press Space to interrupt anytime"
              : "Hold to speak · Release to send · Press Space to toggle"}
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
