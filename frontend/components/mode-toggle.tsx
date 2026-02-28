"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type LoreMode = "capture" | "query";

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
      <TabsList className="grid w-full grid-cols-2 h-12 bg-muted/80 border border-border">
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
      </TabsList>
    </Tabs>
  );
}
