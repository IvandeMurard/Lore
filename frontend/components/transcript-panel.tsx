"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TranscriptPanelProps {
  transcript: string;
  isLive?: boolean;
  className?: string;
}

export function TranscriptPanel({
  transcript,
  isLive = false,
  className,
}: TranscriptPanelProps) {
  return (
    <Card className={cn("border-border bg-card/80", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Transcript
          </span>
          {isLive && (
            <span className="flex h-2 w-2">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "min-h-[4rem] text-sm leading-relaxed text-foreground",
            !transcript && "text-muted-foreground italic"
          )}
        >
          {transcript || "Speak to see your words here…"}
        </p>
      </CardContent>
    </Card>
  );
}
