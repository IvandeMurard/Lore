"use client";

import { useState } from "react";

type Mode = "capture" | "query";

export default function Home() {
    const [mode, setMode] = useState<Mode>("query");

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
                onMouseDown={() => {/* TODO: start recording */ }}
                onMouseUp={() => {/* TODO: stop recording */ }}
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
                Hold to speak
            </p>

            {/* Transcript Area */}
            <div className="mt-10 w-full max-w-2xl">
                <div className="border border-border bg-surface p-6 min-h-[120px]">
                    <p className="text-muted text-sm italic">
                        Transcript will appear here…
                    </p>
                </div>
            </div>

            {/* Response Area */}
            <div className="mt-4 w-full max-w-2xl mb-10">
                <div className="border border-accent/30 bg-surface-light p-6 min-h-[120px]">
                    <p className="text-muted text-sm italic">
                        Lore&apos;s response will appear here…
                    </p>
                </div>
            </div>
        </main>
    );
}
