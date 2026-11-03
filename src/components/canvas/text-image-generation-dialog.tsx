"use client";

import { useSurfaceAppearance, surfaceAppearanceClass } from "@/components/ui/surface-appearance";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Image as ImageIcon, Loader2, ScanSearch, X } from "lucide-react";

export type TextImageGenerationDialogProps = {
  textCount: number;
  referenceCount: number;
  busy?: boolean;
  preview?: (options: {combine: boolean; useReferences: boolean}) => {prompts: string[]; error?: string};
  onGenerate: (mode: "general" | "pure" | "replicate", options: { combine: boolean; useReferences: boolean }) => void;
  onClose: () => void;
  locale?: "zh" | "en";
};

/** Collects generation options only; the caller validates products and submits. */
export function TextImageGenerationDialog({
  textCount, referenceCount, busy = false, preview, onGenerate, onClose, locale = "zh",
}: TextImageGenerationDialogProps) {
  const appearance = useSurfaceAppearance() ?? "light";
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const generateRef = useRef<HTMLButtonElement>(null);
  const backdropPress = useRef(false);
  const [combine, setCombine] = useState(true);
  const [useReferences, setUseReferences] = useState(true);
  const hasReferences = referenceCount > 0;
  const L = (zh: string, en: string) => locale === "en" ? en : zh;
  const content = preview?.({combine, useReferences: hasReferences && useReferences});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    if (generateRef.current && !generateRef.current.disabled) generateRef.current.focus({ preventScroll: true });
    else titleRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (busy) titleRef.current?.focus({ preventScroll: true });
    else if (document.activeElement === titleRef.current) generateRef.current?.focus({ preventScroll: true });
  }, [busy]);

  const generate = (mode: "general" | "pure" | "replicate") => {
    if (busy || (mode === "general" && content?.error)) return;
    onGenerate(mode, { combine: mode === "general" ? combine : false, useReferences: hasReferences && useReferences });
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      aria-busy={busy}
      data-testid="text-image-generation-dialog"
      data-canvas-hotkeys-blocked="true"
      className={`${surfaceAppearanceClass(appearance)} canvas-ui-surface canvas-ui-surface-solid m-auto max-h-[calc(100dvh-24px)] w-[calc(100%_-_24px)] max-w-[400px] overflow-y-auto overscroll-contain rounded-[20px] border p-0 shadow-xl backdrop:bg-[var(--canvas-ui-mask)]`}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      onPointerDown={event => {
        event.stopPropagation();
        backdropPress.current = event.target === event.currentTarget;
      }}
      onClick={event => {
        event.stopPropagation();
        const pressedBackdrop = backdropPress.current;
        backdropPress.current = false;
        if (busy || !pressedBackdrop || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      onWheel={event => event.stopPropagation()}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          if (!busy) onClose();
          return;
        }
        if (event.key !== "Tab") return;
        const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary:not([aria-disabled="true"])',
        )).filter(element => {
          const closedDetails = element.closest("details:not([open])");
          return element.tabIndex >= 0 && element.getClientRects().length > 0
            && (!closedDetails || element === closedDetails.querySelector("summary"));
        });
        const first = elements[0];
        const last = elements[elements.length - 1];
        const active = document.activeElement;
        if (!first) {
          event.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        } else if (!event.currentTarget.contains(active) || active === titleRef.current
          || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus({ preventScroll: true });
        }
      }}
    >
      <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <h2 ref={titleRef} id={`${id}-title`} tabIndex={-1} className="flex items-center gap-2 text-[15px] font-semibold outline-none">
          <ImageIcon className="canvas-ui-muted h-4 w-4" aria-hidden="true" />
          {L("生成图片", "Generate images")}
        </h2>
        <button type="button" disabled={busy} onClick={onClose} aria-label={L("关闭", "Close")}
          className="canvas-ui-action grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="space-y-4 px-5 pb-4">
        <p id={`${id}-description`} className="canvas-ui-muted text-[13px] leading-5">
          {L(`${textCount} 段文字 · ${referenceCount} 张参考图`, `${textCount} text ${textCount === 1 ? "passage" : "passages"} · ${referenceCount} reference ${referenceCount === 1 ? "image" : "images"}`)}
        </p>

        {textCount > 1 && <div role="group" aria-label={L("创作方式", "Creation mode")} className="canvas-ui-section grid grid-cols-2 gap-1 rounded-xl border p-1">
          {([true, false] as const).map(value => <button key={String(value)} type="button" disabled={busy} aria-pressed={combine === value}
            onClick={() => setCombine(value)}
            className={`h-9 rounded-lg text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--canvas-ui-accent)] disabled:cursor-not-allowed disabled:opacity-50 ${combine === value ? "bg-[var(--canvas-ui-panel-solid)] text-[var(--canvas-ui-text)] shadow-sm" : "canvas-ui-action"}`}>
            {value ? L("合并创作", "Create together") : L("逐条创作", "Create separately")}
          </button>)}
        </div>}

        {hasReferences ? <label className={`flex w-fit items-center gap-2 text-[13px] ${busy ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
          <input type="checkbox" checked={useReferences} disabled={busy} onChange={event => setUseReferences(event.target.checked)}
            className="h-4 w-4 rounded border-[var(--canvas-ui-border-strong)] accent-[var(--canvas-ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--canvas-ui-accent)]" />
          {L("使用参考图", "Use reference images")}
        </label> : <span className="canvas-ui-section inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium">
          {L("纯文字", "Text only")}
        </span>}

        {content?.prompts.map((prompt, index) => <textarea key={index} readOnly value={prompt}
          aria-label={content.prompts.length > 1 ? L(`图片提示词预览 ${index + 1}`, `Image prompt preview ${index + 1}`) : L("图片提示词预览", "Image prompt preview")}
          className="canvas-ui-input max-h-48 min-h-24 w-full resize-y rounded-lg border px-3 py-2 text-sm leading-6 outline-none" />)}
        {content?.error && <p role="alert" className="canvas-ui-error text-xs">{content.error}</p>}
        <button ref={generateRef} type="button" disabled={busy || !!content?.error} onClick={() => generate("general")}
          className="canvas-ui-primary flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--canvas-ui-accent)] disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ImageIcon className="h-4 w-4" aria-hidden="true" />}
          {L("生成图片", "Generate images")}
        </button>

        <details className="group border-t border-[var(--canvas-ui-border)] pt-3">
          <summary aria-disabled={busy} tabIndex={busy ? -1 : 0} onClick={event => { if (busy) event.preventDefault(); }}
            className={`canvas-ui-muted flex list-none items-center justify-between gap-2 rounded-md py-1 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--canvas-ui-accent)] [&::-webkit-details-marker]:hidden ${busy ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
            {L("商品图模式", "Product image modes")}
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          </summary>
          <p id={`${id}-product-requirement`} className="canvas-ui-muted mb-2 mt-1 text-[11px] leading-5">
            {L("需要绑定产品图", "Requires a linked product image")}
          </p>
          <div className="grid gap-2">
            <button type="button" disabled={busy} onClick={() => generate("pure")} aria-describedby={`${id}-product-requirement`}
              title={L("需要绑定产品图；不使用竞品参考图。", "Requires a linked product image; excludes competitor references.")}
              className="canvas-ui-control flex min-h-9 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50">
              <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {L("仅产品图", "Product image only")}
            </button>
            <button type="button" disabled={busy} onClick={() => generate("replicate")} aria-describedby={`${id}-product-requirement`}
              title={L("需要绑定产品图及竞品参考图，使用竞品构图。", "Requires a linked product image and a competitor reference for its layout.")}
              className="canvas-ui-control flex min-h-9 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50">
              <ScanSearch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {L("复刻竞品构图", "Replicate competitor layout")}
            </button>
          </div>
        </details>

        <div className="flex justify-end">
          <button type="button" disabled={busy} onClick={onClose}
            className="canvas-ui-action rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40">
            {L("取消", "Cancel")}
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
