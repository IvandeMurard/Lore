"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

export interface LoreSource {
  type: "sop" | "oral" | "history" | "intent" | "system";
  label: string;
}

interface ResponsePanelProps {
  response: string;
  sources?: LoreSource[];
  isLoading?: boolean;
  className?: string;
}

/** Lightweight markdown → HTML for voice responses (no heavy deps). */
function renderMarkdown(text: string): string {
  return text
    // bold **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    // italic *text* or _text_
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
    // inline code `text`
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
    // unordered list items "- item" or "• item"
    .replace(/^[\-•]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // numbered list items "1. item"
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // paragraphs: double newlines
    .replace(/\n{2,}/g, '</p><p class="mt-2">')
    // single newlines → <br>
    .replace(/\n/g, "<br />");
}

export function ResponsePanel({
  response,
  sources = [],
  isLoading = false,
  className,
}: ResponsePanelProps) {
  const renderedHtml = useMemo(() => {
    if (!response) return "";
    return renderMarkdown(response);
  }, [response]);

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
        ) : response ? (
          <div
            className="min-h-[4rem] text-sm leading-relaxed text-foreground prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          <p className="min-h-[4rem] text-sm leading-relaxed text-foreground">
            Ask something to hear Lore&apos;s answer.
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
