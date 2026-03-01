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
  const activePointerIdRef = React.useRef<number | null>(null);
  const isPressingRef = React.useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || isPressingRef.current) return;
    e.preventDefault();
    isPressingRef.current = true;
    activePointerIdRef.current = e.pointerId;
    buttonRef.current?.setPointerCapture(e.pointerId);
    onStart();
  };

  const endPress = (e: React.PointerEvent) => {
    const activePointerId = activePointerIdRef.current;
    if (!isPressingRef.current || activePointerId === null) return;
    if (activePointerId !== e.pointerId) return;

    e.preventDefault();
    isPressingRef.current = false;
    activePointerIdRef.current = null;
    onEnd();

    try {
      buttonRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was already released.
    }
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
      onPointerUp={endPress}
      onPointerCancel={endPress}
    >
      {isRecording ? (
        <MicOff className="h-8 w-8" />
      ) : (
        <Mic className="h-8 w-8" />
      )}
    </Button>
  );
}
