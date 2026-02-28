"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Mic, MicOff } from "lucide-react";

interface HoldToSpeakButtonProps {
  onStart: () => void;
  onEnd: () => void;
  isRecording: boolean;
  disabled?: boolean;
  className?: string;
}

export function HoldToSpeakButton({
  onStart,
  onEnd,
  isRecording,
  disabled,
  className,
}: HoldToSpeakButtonProps) {
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    onStart();
    buttonRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    onEnd();
    buttonRef.current?.releasePointerCapture(e.pointerId);
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    if (e.buttons === 1) onEnd();
  };

  return (
    <Button
      ref={buttonRef}
      size="lg"
      variant={isRecording ? "default" : "outline"}
      disabled={disabled}
      className={cn(
        "h-20 w-20 rounded-full border-2 transition-all touch-none select-none",
        isRecording && "scale-110 ring-4 ring-primary/40",
        className
      )}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerUp}
    >
      {isRecording ? (
        <MicOff className="h-8 w-8" />
      ) : (
        <Mic className="h-8 w-8" />
      )}
    </Button>
  );
}
