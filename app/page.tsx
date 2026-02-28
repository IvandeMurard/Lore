"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeClient, type ReceiveMessageEvent } from "@speechmatics/real-time-client";

type Mode = "capture" | "query";
type SpeechmaticsMessage = {
    message?: string;
    metadata?: { transcript?: string };
    results?: Array<{ alternatives?: Array<{ content?: string }> }>;
    reason?: string;
    type?: string;
};

function getSupportedMimeType(): string | undefined {
    const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
    ];

    for (const candidate of candidates) {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
            return candidate;
        }
    }

    return undefined;
}

function normalizeWhitespace(text: string): string {
    return text
        .replace(/\s+/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .trim();
}

function extractTranscriptText(message: SpeechmaticsMessage): string {
    if (message.metadata?.transcript) {
        return normalizeWhitespace(message.metadata.transcript);
    }

    if (message.results?.length) {
        return normalizeWhitespace(
            message.results
                .map((entry) => entry.alternatives?.[0]?.content ?? "")
                .join(" ")
        );
    }

    return "";
}

function mergeTranscript(finalText: string, partialText: string): string {
    return normalizeWhitespace(
        [finalText, partialText].filter((part) => part && part.trim().length > 0).join(" ")
    );
}

export default function Home() {
    const [mode, setMode] = useState<Mode>("query");
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [status, setStatus] = useState("Hold to speak");
    const [error, setError] = useState<string | null>(null);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const realtimeClientRef = useRef<RealtimeClient | null>(null);
    const receiveHandlerRef = useRef<((event: ReceiveMessageEvent) => void) | null>(null);
    const finalTranscriptRef = useRef("");
    const partialTranscriptRef = useRef("");

    const cleanupRealtimeClient = useCallback(() => {
        const client = realtimeClientRef.current;
        const handler = receiveHandlerRef.current;

        if (client && handler) {
            client.removeEventListener("receiveMessage", handler);
        }

        realtimeClientRef.current = null;
        receiveHandlerRef.current = null;
    }, []);

    const startRecording = async () => {
        if (isRecording || isProcessing) {
            return;
        }

        if (
            typeof navigator === "undefined" ||
            !navigator.mediaDevices ||
            typeof navigator.mediaDevices.getUserMedia !== "function"
        ) {
            setError("Microphone API is not available in this browser/context.");
            setStatus("Microphone unavailable.");
            return;
        }

        if (typeof MediaRecorder === "undefined") {
            setError("MediaRecorder is not supported in this browser.");
            setStatus("Microphone unavailable.");
            return;
        }

        setError(null);
        setTranscript("");
        finalTranscriptRef.current = "";
        partialTranscriptRef.current = "";
        setStatus("Requesting microphone...");

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            setStatus("Connecting Speechmatics...");

            const tokenResponse = await fetch("/api/speechmatics-token", {
                method: "POST",
            });
            const tokenPayload = await tokenResponse.json();

            if (!tokenResponse.ok) {
                throw new Error(
                    tokenPayload?.details ||
                    tokenPayload?.error ||
                    "Failed to get Speechmatics token."
                );
            }

            const client = new RealtimeClient({
                ...(tokenPayload?.rtUrl ? { url: tokenPayload.rtUrl } : {}),
                connectionTimeout: 15000,
            });

            const onReceiveMessage = ({ data }: ReceiveMessageEvent) => {
                const message = data as unknown as SpeechmaticsMessage;

                switch (message.message) {
                    case "AddPartialTranscript": {
                        const partial = extractTranscriptText(message);
                        partialTranscriptRef.current = partial;
                        setTranscript(
                            mergeTranscript(finalTranscriptRef.current, partialTranscriptRef.current)
                        );
                        return;
                    }
                    case "AddTranscript": {
                        const finalSegment = extractTranscriptText(message);
                        if (finalSegment) {
                            finalTranscriptRef.current = mergeTranscript(
                                finalTranscriptRef.current,
                                finalSegment
                            );
                        }
                        partialTranscriptRef.current = "";
                        setTranscript(finalTranscriptRef.current);
                        return;
                    }
                    case "EndOfTranscript": {
                        partialTranscriptRef.current = "";
                        setTranscript(finalTranscriptRef.current);
                        setStatus("Transcription complete.");
                        return;
                    }
                    case "Error": {
                        setError(
                            `Speechmatics error${message.type ? ` (${message.type})` : ""}: ${message.reason || "unknown"}`
                        );
                        setStatus("Transcription failed.");
                        return;
                    }
                    default: {
                        return;
                    }
                }
            };

            client.addEventListener("receiveMessage", onReceiveMessage);
            realtimeClientRef.current = client;
            receiveHandlerRef.current = onReceiveMessage;

            await client.start(tokenPayload.jwt, {
                transcription_config: {
                    language: tokenPayload.language || "en",
                    enable_partials: true,
                    max_delay: 2,
                },
            });

            const mimeType = getSupportedMimeType();
            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    void (async () => {
                        try {
                            const currentClient = realtimeClientRef.current;
                            if (!currentClient) {
                                return;
                            }

                            const chunkBuffer = await event.data.arrayBuffer();
                            if (!chunkBuffer.byteLength) {
                                return;
                            }

                            currentClient.sendAudio(new Uint8Array(chunkBuffer));
                        } catch (audioSendError) {
                            console.error("Failed to stream audio chunk:", audioSendError);
                        }
                    })();
                }
            };

            recorder.onstop = async () => {
                setIsRecording(false);
                setIsProcessing(true);
                setStatus("Finalizing transcript...");

                try {
                    if (realtimeClientRef.current) {
                        await realtimeClientRef.current.stopRecognition();
                    }
                    partialTranscriptRef.current = "";
                    setTranscript(finalTranscriptRef.current);
                    setStatus("Transcription complete.");
                } catch (transcriptionError) {
                    setError(
                        transcriptionError instanceof Error
                            ? transcriptionError.message
                            : "Transcription failed."
                    );
                    setStatus("Transcription failed.");
                } finally {
                    cleanupRealtimeClient();
                    setIsProcessing(false);
                }
            };

            recorderRef.current = recorder;
            recorder.start(250);
            setIsRecording(true);
            setStatus("Recording...");
        } catch (recordingError) {
            cleanupRealtimeClient();
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }
            setError(
                recordingError instanceof Error
                    ? recordingError.message
                    : "Unable to access microphone."
            );
            setStatus("Microphone unavailable.");
        }
    };

    const stopRecording = () => {
        if (!recorderRef.current || recorderRef.current.state === "inactive") {
            return;
        }

        recorderRef.current.stop();
        recorderRef.current = null;

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    };

    useEffect(() => {
        return () => {
            if (recorderRef.current && recorderRef.current.state !== "inactive") {
                recorderRef.current.stop();
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
            }
            cleanupRealtimeClient();
        };
    }, [cleanupRealtimeClient]);

    return (
        <main className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
            {/* Header */}
            <div className="text-center mb-12">
                <h1 className="text-5xl font-bold tracking-tight text-foreground mb-2">
                    Lore
                </h1>
                <p className="text-muted text-lg">
                    The knowledge retiring technicians carry isn&apos;t in any manual.
                </p>
            </div>

            {/* Mode Toggle */}
            <div className="flex gap-0 mb-10 border border-border rounded-none overflow-hidden">
                <button
                    onClick={() => setMode("capture")}
                    className={`px-6 py-3 text-sm font-medium uppercase tracking-widest transition-colors ${mode === "capture"
                            ? "bg-accent text-background"
                            : "bg-surface text-muted hover:text-foreground"
                        }`}
                >
                    Capture
                </button>
                <button
                    onClick={() => setMode("query")}
                    className={`px-6 py-3 text-sm font-medium uppercase tracking-widest transition-colors ${mode === "query"
                            ? "bg-accent text-background"
                            : "bg-surface text-muted hover:text-foreground"
                        }`}
                >
                    Query
                </button>
            </div>

            {/* Status */}
            <div className="text-center mb-8">
                <p className="text-muted text-sm">
                    {mode === "capture"
                        ? "Senior debrief mode — share your expertise"
                        : "Query mode — ask what you need to know"}
                </p>
            </div>

            {/* Hold to Speak Button */}
            <button
                className="w-32 h-32 rounded-full border-2 border-accent bg-surface flex items-center justify-center transition-all hover:bg-accent/10 hover:shadow-[0_0_30px_rgba(249,115,22,0.15)] active:bg-accent/20 active:scale-95"
                onPointerDown={startRecording}
                onPointerUp={stopRecording}
                onPointerCancel={stopRecording}
                onPointerLeave={stopRecording}
                disabled={isProcessing}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-accent"
                >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
            </button>
            <p className="text-muted text-xs mt-4 uppercase tracking-widest">
                {isRecording ? "Recording..." : status}
            </p>

            {/* Transcript Area */}
            <div className="mt-10 w-full max-w-2xl">
                <div className="border border-border bg-surface p-6 min-h-[120px]">
                    {transcript ? (
                        <p className="text-foreground text-sm">{transcript}</p>
                    ) : (
                        <p className="text-muted text-sm italic">
                            Transcript will appear here…
                        </p>
                    )}
                </div>
            </div>

            {/* Response Area */}
            <div className="mt-4 w-full max-w-2xl mb-10">
                <div className="border border-accent/30 bg-surface-light p-6 min-h-[120px]">
                    {error ? (
                        <p className="text-red-400 text-sm">{error}</p>
                    ) : (
                        <p className="text-muted text-sm italic">
                            Lore&apos;s response will appear here…
                        </p>
                    )}
                </div>
            </div>
        </main>
    );
}
