"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type LoreMode = "auto" | "capture" | "query" | "log";

interface ModeToggleProps {
  value: LoreMode;
  onValueChange: (value: LoreMode) => void;
  className?: string;
}

export function ModeToggle({ value, onValueChange, className }: ModeToggleProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onValueChange(v as LoreMode)}
      className={cn("w-full", className)}
    >
      <TabsList className="grid w-full grid-cols-4 h-12 bg-muted/80 border border-border">
        <TabsTrigger
          value="auto"
          className="data-[state=active]:bg-orange-600 data-[state=active]:text-white data-[state=active]:shadow-sm rounded-sm"
        >
          Auto
        </TabsTrigger>
        <TabsTrigger
          value="capture"
          className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-sm"
        >
          Capture
        </TabsTrigger>
        <TabsTrigger
          value="query"
          className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-sm"
        >
          Query
        </TabsTrigger>
        <TabsTrigger
          value="log"
          className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-sm"
        >
          Log
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
