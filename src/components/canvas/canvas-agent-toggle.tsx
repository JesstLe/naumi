"use client";

import { Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function CanvasAgentToggle({ open, label, onClick }: { open: boolean; label: string; onClick: () => void }) {
  return <button type="button" data-testid="canvas-agent-toggle" aria-label={label} aria-expanded={open}
    aria-controls="canvas-agent-panel" onClick={onClick}
    className={cn("canvas-ui-surface canvas-ui-action flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.5 text-[12px] font-semibold backdrop-blur transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--canvas-ui-border-strong)]",
      open && "!border-[var(--canvas-ui-border-strong)] !bg-[var(--canvas-ui-soft)]")}>
    <InfinityIcon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{label}</span>
  </button>;
}
