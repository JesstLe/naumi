"use client";

import { useSurfaceAppearance, surfaceAppearanceClass } from "@/components/ui/surface-appearance";

import { forwardRef, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
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
  tools?: ReactNode;
  compact?: boolean;
};

/** Presentation only: node drafts, permissions, quotation and submission stay with each caller. */
export const CanvasComposerShell = forwardRef<HTMLDivElement, Props>(function CanvasComposerShell({
  kind, heading, onDismiss, closeLabel = "关闭创作栏", expandLabel = "展开输入区", collapseLabel = "收起输入区",
  expanded: controlledExpanded, onToggleExpand, compact = false, tools, className, children, ...props
}, ref) {
  const appearance = useSurfaceAppearance() ?? "light";
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const shell = useRef<HTMLDivElement | null>(null);
  const previousScroll = useRef<{ top:number; left:number } | null>(null);
  useLayoutEffect(()=>{
    const panel=shell.current,body=panel?.querySelector<HTMLElement>('[data-composer-body]');
    if(!panel||!body)return;
    // If chrome leaves less than a useful input area (small slot or keyboard),
    // scroll the whole panel. Otherwise only its body scrolls. Never both.
    const measure=()=>{
      const chrome=panel.scrollHeight-body.offsetHeight;
      panel.dataset.composerScroll=panel.clientHeight-chrome<112?"shell":"body";
    };
    measure();const observer=new ResizeObserver(measure);
    observer.observe(panel);observer.observe(body);
    for(const child of Array.from(panel.children))observer.observe(child);
    return()=>observer.disconnect();
  },[]);
  function toggleExpand(){
    const body=shell.current?.querySelector<HTMLElement>('[data-composer-body]');
    if(body)previousScroll.current={top:body.scrollTop,left:body.scrollLeft};
    if(onToggleExpand)onToggleExpand();else setLocalExpanded(value=>!value);
  }
  useLayoutEffect(()=>{
    const body=shell.current?.querySelector<HTMLElement>('[data-composer-body]'),scroll=previousScroll.current;
    if(body&&scroll){body.scrollTop=scroll.top;body.scrollLeft=scroll.left;previousScroll.current=null;}
  },[expanded]);
  const Icon = kind === "text" ? Type : kind === "image" ? ImageIcon : Video;
  return <div {...props} ref={element=>{shell.current=element;if(typeof ref==='function')ref(element);else if(ref)ref.current=element;}} data-composer-kind={kind} data-composer-expanded={expanded}
    data-composer-density={compact && kind === "image" ? "compact" : undefined} data-canvas-hotkeys-blocked="true" className={cn(surfaceAppearanceClass(appearance), "canvas-dock-entry", styles.shell, className)}>
    <header className={styles.header} data-composer-header="true">
      <span className={styles.identity}><Icon size={14} aria-hidden="true"/><span title={heading}>{heading}</span></span>
      <span className={styles.headerActions}>
        {tools}
        <button type="button" aria-label={expanded ? collapseLabel : expandLabel} title={expanded ? collapseLabel : expandLabel}
          aria-expanded={expanded} onMouseDown={event=>event.preventDefault()} onClick={toggleExpand}>
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
  const appearance = useSurfaceAppearance() ?? "light";
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return <>
    <button ref={anchor} type="button" className="canvas-ui-control flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border"
      aria-label={label} title={label} aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)}><SlidersHorizontal size={15}/></button>
    {open && <CanvasActionPanel anchorRef={anchor} label={label} light={appearance === "light"} width={320} onClose={() => setOpen(false)}>
      <div className="flex items-center justify-between gap-2 pb-3 text-xs font-semibold"><span>{label}</span><button type="button" aria-label="关闭设置" onClick={() => setOpen(false)} className="canvas-ui-action rounded-md p-1"><X size={14}/></button></div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </CanvasActionPanel>}
  </>;
}
