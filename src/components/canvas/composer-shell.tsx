"use client";

import { forwardRef, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { ImageIcon, Maximize2, Minimize2, SlidersHorizontal, Type, Video, X } from "lucide-react";
import { CanvasActionPanel } from "./canvas-action-menu";
import { cn } from "@/lib/utils";
import styles from "./composer-shell.module.css";

type ComposerKind = "text" | "image" | "video";
type Props = HTMLAttributes<HTMLDivElement> & {
  kind: ComposerKind;
  heading: string;
  onDismiss: () => void;
  closeLabel?: string;
  expandLabel?: string;
  collapseLabel?: string;
  expanded?: boolean;
  onToggleExpand?: () => void;
};

/** Presentation only: node drafts, permissions, quotation and submission stay with each caller. */
export const CanvasComposerShell = forwardRef<HTMLDivElement, Props>(function CanvasComposerShell({
  kind, heading, onDismiss, closeLabel = "关闭创作栏", expandLabel = "展开输入区", collapseLabel = "收起输入区",
  expanded: controlledExpanded, onToggleExpand, className, children, ...props
}, ref) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const Icon = kind === "text" ? Type : kind === "image" ? ImageIcon : Video;
  return <div {...props} ref={ref} data-composer-kind={kind} data-composer-expanded={expanded}
    data-canvas-hotkeys-blocked="true" className={cn("canvas-ui-light canvas-dock-entry", styles.shell, className)}>
    <header className={styles.header} data-composer-header="true">
      <span className={styles.identity}><Icon size={14} aria-hidden="true"/><span title={heading}>{heading}</span></span>
      <span className={styles.headerActions}>
        <button type="button" aria-label={expanded ? collapseLabel : expandLabel} title={expanded ? collapseLabel : expandLabel}
          aria-expanded={expanded} onClick={() => onToggleExpand ? onToggleExpand() : setLocalExpanded(value => !value)}>
          {expanded ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}
        </button>
        <button type="button" aria-label={closeLabel} title={closeLabel} onClick={onDismiss}><X size={15}/></button>
      </span>
    </header>
    {children}
  </div>;
});

export function CanvasComposerFooter({ controls, actions, testId }: { controls: ReactNode; actions: ReactNode; testId?: string }) {
  return <footer className={styles.footer} data-composer-footer="true" data-testid={testId}>
    <div className={styles.controls} data-composer-controls="true">{controls}</div>
    <div className={styles.actions} data-composer-actions="true">{actions}</div>
  </footer>;
}

/** The same anchored, keyboard-accessible portal is used for non-primary controls. */
export function CanvasComposerOptions({ label, children, disabled = false }: { label: string; children: ReactNode; disabled?: boolean }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return <>
    <button ref={anchor} type="button" className="canvas-ui-control flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border"
      aria-label={label} title={label} aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)}><SlidersHorizontal size={15}/></button>
    {open && <CanvasActionPanel anchorRef={anchor} label={label} light width={320} onClose={() => setOpen(false)}>
      <div className="flex items-center justify-between gap-2 pb-3 text-xs font-semibold"><span>{label}</span><button type="button" aria-label="关闭设置" onClick={() => setOpen(false)} className="canvas-ui-action rounded-md p-1"><X size={14}/></button></div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </CanvasActionPanel>}
  </>;
}
