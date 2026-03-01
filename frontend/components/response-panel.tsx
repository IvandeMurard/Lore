"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

export interface LoreSource {
  type: "sop" | "oral" | "history" | "intent" | "system";
  label: string;
  details?: string;
}

interface ResponsePanelProps {
  response: string;
  sources?: LoreSource[];
  isLoading?: boolean;
  loadingMessage?: string;
  className?: string;
}

/** Lightweight markdown → HTML for voice responses (no heavy deps). */
function formatInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>');
}

function renderMarkdown(text: string): string {
  const lines = text.split(/\r?\n/);
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (!listType) return;
    html.push(listType === "ul" ? "</ul>" : "</ol>");
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const depth = headingMatch[1].length;
      const content = formatInlineMarkdown(headingMatch[2]);
      const tag = depth === 1 ? "h3" : depth === 2 ? "h4" : "h5";
      html.push(`<${tag} class="mt-2 font-semibold">${content}</${tag}>`);
      continue;
    }

    const unorderedMatch = line.match(/^[-*•]\s+(.+)$/);
    if (unorderedMatch) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push('<ul class="ml-4 list-disc space-y-1">');
      }
      html.push(`<li>${formatInlineMarkdown(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push('<ol class="ml-4 list-decimal space-y-1">');
      }
      html.push(`<li>${formatInlineMarkdown(orderedMatch[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p class="mt-2">${formatInlineMarkdown(line)}</p>`);
  }

  closeList();
  return html.join("");
}

function getDefaultSourceDetails(source: LoreSource): string {
  switch (source.type) {
    case "sop":
      return "This source references SOP knowledge used for the answer.";
    case "oral":
      return "This source references captured oral knowledge from senior technicians.";
    case "history":
      return "This source references aircraft intervention and maintenance history.";
    case "intent":
      return "This source describes the intent detected by the orchestrator.";
    case "system":
      return "This source describes a system or fallback status.";
    default:
      return "No additional source details available.";
  }
}

export function ResponsePanel({
  response,
  sources = [],
  isLoading = false,
  loadingMessage = "Thinking…",
  className,
}: ResponsePanelProps) {
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | null>(null);

  useEffect(() => {
    setSelectedSourceIndex(null);
  }, [sources]);

  const renderedHtml = useMemo(() => {
    if (!response) return "";
    return renderMarkdown(response);
  }, [response]);

  const selectedSource =
    selectedSourceIndex === null ? null : sources[selectedSourceIndex] ?? null;
  const selectedSourceHtml = useMemo(() => {
    if (!selectedSource) return "";
    return renderMarkdown(
      (selectedSource.details ?? "").trim() || getDefaultSourceDetails(selectedSource)
    );
  }, [selectedSource]);

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
            <span className="text-sm">{loadingMessage}</span>
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
              <button
                key={i}
                type="button"
                onClick={() =>
                  setSelectedSourceIndex((prev) => (prev === i ? null : i))
                }
                className={cn(
                  badgeVariants({ variant: "secondary" }),
                  "text-xs font-normal cursor-pointer",
                  selectedSourceIndex === i && "ring-1 ring-primary"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        {selectedSource && (
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Source details: {selectedSource.label}
            </p>
            <div
              className="text-xs leading-relaxed text-foreground prose prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: selectedSourceHtml }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
