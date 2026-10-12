"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Keyboard, Search, X } from "lucide-react";
import { canvasHelpGuides, canvasHelpSections, helpText, type HelpPlatform } from "@/lib/canvas/help-catalog";

export function CanvasHelpDialog({ isMac, english, onClose }: {
  isMac: boolean;
  english: boolean;
  onClose: () => void;
}) {
  const [platform, setPlatform] = useState<HelpPlatform>(isMac ? "mac" : "windows");
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const id = useId();
  const L = (zh: string, en: string) => english ? en : zh;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]') ?? []);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !root.current?.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLElement>('[data-tool="more"]')?.focus();
    };
  }, []);

  const needle = query.trim().toLocaleLowerCase();
  const sections = canvasHelpSections(platform).map(section => ({ ...section,
    shortcuts: section.shortcuts.filter(item => `${helpText(section.title, english)} ${helpText(item.label, english)} ${item.keys.flat().join(" ")}`.toLocaleLowerCase().includes(needle)),
  })).filter(section => section.shortcuts.length);
  const guides = canvasHelpGuides.filter(item => `${helpText(item.title, english)} ${helpText(item.description, english)}`.toLocaleLowerCase().includes(needle));
  const keyLabel = (key: string) => ({ Space: L("空格", "Space"), Drag: L("拖动", "Drag"), Click: L("单击", "Click"), Wheel: L("滚轮", "Wheel"), Delete: platform === "mac" ? "Delete" : "Del" }[key] ?? key);

  return createPortal(
    <div data-testid="canvas-help-overlay" data-canvas-hotkeys-blocked="true"
      className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/35 p-3 backdrop-blur-[3px] sm:p-6"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={root} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} data-testid="canvas-help-dialog"
        className="flex max-h-[min(88dvh,860px)] w-full max-w-[720px] flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white text-slate-800 shadow-[0_24px_90px_rgba(15,23,42,0.22)]">
        <header className="flex flex-none items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 id={`${id}-title`} className="flex items-center gap-2.5 text-base font-semibold"><Keyboard className="h-[18px] w-[18px] text-slate-500" aria-hidden="true" />{L("快捷键与帮助", "Shortcuts & help")}</h2>
          <button type="button" aria-label={L("关闭帮助", "Close help")} onClick={onClose}
            className="grid h-8 w-8 flex-none place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex flex-none flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 sm:px-6">
          <label className="flex min-w-0 flex-[1_1_200px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-slate-400">
            <Search className="h-4 w-4 flex-none text-slate-400" aria-hidden="true" />
            <input aria-label={L("查找快捷键或操作", "Find a shortcut or action")} placeholder={L("查找快捷键或操作", "Find a shortcut or action")} value={query} onChange={event => setQuery(event.target.value)}
              className="h-9 w-full min-w-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
          </label>
          <div role="group" aria-label={L("键盘平台", "Keyboard platform")} className="flex flex-none rounded-lg bg-slate-100 p-1">
            {(["windows", "mac"] as const).map(value => <button key={value} type="button" aria-pressed={platform === value} onClick={() => setPlatform(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${platform === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{value === "mac" ? "macOS" : "Windows"}</button>)}
          </div>
        </div>
        <div data-testid="canvas-help-content" className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {sections.map(section => <section key={section.id} aria-labelledby={`${id}-${section.id}`}>
              <h3 id={`${id}-${section.id}`} className="mb-2 text-xs font-semibold tracking-wide text-slate-500">{helpText(section.title, english)}</h3>
              <ul className="divide-y divide-slate-100">{section.shortcuts.map(item => <li key={item.id} data-shortcut={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 text-[13px] leading-5">{helpText(item.label, english)}</span>
                <span className="flex max-w-[55%] flex-none flex-wrap justify-end gap-1">
                  {item.keys.map((combo, index) => <span key={index} className="inline-flex items-center gap-1">
                    {index > 0 && <span className="px-0.5 text-[10px] text-slate-400">/</span>}
                    {combo.map((key, n) => <kbd key={`${key}-${n}`} className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1.5 font-sans text-[11px] font-medium text-slate-600 shadow-[0_1px_0_#e2e8f0]">{keyLabel(key)}</kbd>)}
                  </span>)}
                </span>
              </li>)}</ul>
            </section>)}
          </div>
          {guides.length > 0 && <section className={sections.length ? "mt-6 border-t border-slate-100 pt-5" : ""}>
            <h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-500">{L("常用操作", "Common actions")}</h3>
            <div className="grid gap-2.5 sm:grid-cols-2">{guides.map(item => <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3">
              <h4 className="text-[13px] font-medium">{helpText(item.title, english)}</h4>
              <p className="mt-1 text-xs leading-5 text-slate-500">{helpText(item.description, english)}</p>
            </div>)}</div>
          </section>}
          {!sections.length && !guides.length && <p role="status" className="py-10 text-center text-sm text-slate-500">{L("未找到相关操作", "No matching actions")}</p>}
        </div>
        <footer className="flex-none border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] leading-5 text-slate-500 sm:px-6">{L("编辑文字或打开弹窗时，画布快捷键暂停。滚轮 / 双指滚动可平移，捏合可缩放。", "Canvas shortcuts pause while editing or using dialogs. Scroll to pan; pinch to zoom.")}</footer>
      </div>
    </div>, document.body
  );
}
