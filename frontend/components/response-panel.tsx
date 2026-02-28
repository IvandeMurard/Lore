"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface LoreSource {
  type: "sop" | "oral" | "history";
  label: string;
}

interface ResponsePanelProps {
  response: string;
  sources?: LoreSource[];
  isLoading?: boolean;
  className?: string;
}

export function ResponsePanel({
  response,
  sources = [],
  isLoading = false,
  className,
}: ResponsePanelProps) {
  return (
    <Card className={cn("border-border bg-card/80", className)}>
      <CardHeader className="pb-2">
        <span className="text-sm font-medium text-muted-foreground">
          Lore
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <span className="text-sm">Thinking…</span>
          </div>
        ) : (
          <p className="min-h-[4rem] text-sm leading-relaxed text-foreground">
            {response || "Ask something to hear Lore’s answer."}
          </p>
        )}
        {sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground mr-1">Sources:</span>
            {sources.map((s, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="text-xs font-normal"
              >
                {s.label}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
