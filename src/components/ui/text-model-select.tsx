"use client";

import { useEffect, useRef, useState } from "react";
import {usePathname} from "next/navigation";
import {TOOLS} from "@/lib/tool-meta";
import {SelectMenu} from "./select-menu";
import { Check, ChevronDown, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useTextModel } from "@/lib/text-model-context";
import type { FeatureId } from "@/lib/billing/rules/registry";
import { useFeatureModels } from "@/lib/model-config/feature-client";
import { ModelIcon } from "@/components/ui/model-icon";

export function TextModelSelect({
  feature = "canvas.text-generate",
  compact = false,
  composer = false,
  dark = false,
  direction = "down",
  className,
}: {
  feature?: FeatureId;
  compact?: boolean;
  composer?: boolean;
  dark?: boolean;
  direction?: "up" | "down";
  className?: string;
}) {
  const pathname = usePathname();
  const toolPage = pathname === "/dashboard" || TOOLS.some(t => t.href === pathname);
  const global = useTextModel();
  const featureState = useFeatureModels(feature);
  const managed = featureState.catalog?.managed === true;
  const model = managed ? featureState.selected : global.model;
  const models = managed ? featureState.catalog!.models.map(m => m.id) : global.models;
  const setModel = (id: string) => { if (managed) featureState.setSelected(id); global.setModel(id); };
  const label = (id: string) => managed ? featureState.catalog!.models.find(m => m.id === id)?.label || "模型名称未配置" : id;
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!customOpen) return;
    const trigger = root.current?.querySelector<HTMLButtonElement>("button");
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { if (trigger?.isConnected) trigger.focus({preventScroll: true}); };
  }, [customOpen]);
  function dialogKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setCustomOpen(false); }
    if (event.key !== "Tab") return;
    const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)") || []);
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  // Unknown/failed managed state must never expose the legacy model IDs or
  // custom-model entry. Only an explicit unmanaged response enables that path.
  const unavailable = featureState.error ? "模型加载失败" : !featureState.catalog || (!managed && !global.loaded) ? "模型加载中" : !models.length ? "当前功能没有启用模型" : null;
  if (unavailable) return <div className={cn("flex min-w-0 items-center gap-1.5 text-xs", dark ? "text-[#e7e9ee]" : "text-c-text2", className)} data-testid="text-model-status">
    <span role={featureState.error ? "alert" : "status"} className="inline-flex min-w-0 items-center gap-1.5" aria-busy={unavailable === "模型加载中"}>
      {unavailable === "模型加载中" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />}{unavailable}
    </span>
    {featureState.error && <button type="button" onClick={featureState.reload} aria-label="重新加载文字模型" title="重新加载文字模型" className="inline-flex shrink-0 items-center gap-1 rounded px-1 py-1 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />重试</button>}
  </div>;

  const menu = open ? (
    <>
      <button className="fixed inset-0 z-[90] cursor-default" aria-label="关闭模型菜单" onClick={() => setOpen(false)} />
      <div
        className={cn(
          "absolute left-0 z-[91] max-h-72 w-[min(320px,78vw)] overflow-auto border p-1.5 shadow-pop",
          direction === "up" ? "bottom-full mb-2" : "top-full mt-2",
          dark ? "border-[#3a3f49] bg-[#20232a] text-[#e7e9ee]" : "border-c-border bg-white text-c-text"
        )}
      >
        {models.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setModel(item);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors",
              dark ? "hover:bg-[#2b2f38]" : "hover:bg-c-subtle"
            )}
          >
            <ModelIcon modelId={item} modelName={label(item)} size={14} />
            <span className="min-w-0 flex-1 truncate">{label(item)}</span>
            {item === model && <Check className="h-3.5 w-3.5 flex-none text-acc" />}
          </button>
        ))}
        {!managed && <button
          type="button"
          onClick={() => {
            setOpen(false);
            setCustom(model);
            setCustomOpen(true);
          }}
          className={cn(
            "mt-1 flex w-full items-center gap-2 border-t px-2.5 py-2 text-left text-xs font-semibold",
            dark ? "border-[#343842] hover:bg-[#2b2f38]" : "border-c-border hover:bg-c-subtle"
          )}
        >
          <Plus className="h-3.5 w-3.5" /> 自定义模型 ID
        </button>}
      </div>
    </>
  ) : null;

  return (
    <div ref={root} className={cn("relative", className)} title={composer ? label(model) : undefined}>
      {toolPage || composer ? <SelectMenu label="文字模型" value={model} size={compact?"sm":"md"} className={cn("max-w-full", composer && "w-full !rounded-full !border-transparent !bg-transparent !px-1.5 canvas-ui-text hover:!bg-[var(--canvas-ui-soft-hover)]")} popoverClassName={composer ? "tool-popover" : undefined} onChange={id=>{
        if(id === "__custom_model__"){setCustom(model);setCustomOpen(true);}else setModel(id);
      }} options={[...models.map(id=>({value:id,label:<span className="flex min-w-0 items-center gap-2"><ModelIcon modelId={id} modelName={label(id)} size={14}/><span className="min-w-0 truncate">{label(id)}</span></span>})),...(!managed?[{value:"__custom_model__",label:"自定义模型 ID"}]:[])]}/> : <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex max-w-[260px] items-center gap-1.5 border text-xs font-semibold transition-colors",
          compact ? "h-8 px-2.5" : "h-9 px-3",
          dark
            ? "border-[#343842] bg-[#1f2229] text-[#e7e9ee] hover:border-[#596170]"
            : "border-c-border bg-white text-c-text2 hover:border-c-border2 hover:text-c-text"
        )}
        title={`文字模型：${label(model)}`}
      >
        <ModelIcon modelId={model} modelName={label(model)} size={14} />
        <span className="min-w-0 truncate">{label(model)}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-none opacity-60" />
      </button>}
      {!toolPage && !composer && menu}
      {customOpen && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4" onClick={() => setCustomOpen(false)}>
            <div ref={dialog} role="dialog" aria-modal="true" aria-label="使用其他文本模型" onKeyDown={dialogKeys} className="w-full max-w-md rounded-2xl border border-c-border bg-white p-5 shadow-pop tool-popover" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-c-text">使用其他文本模型</h3>
                <button type="button" aria-label="关闭自定义模型" onClick={() => setCustomOpen(false)} className="text-c-text3 hover:text-c-text">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-c-text3">填写当前 OpenAI 兼容接口支持的准确模型 ID。</p>
              <input
                autoFocus
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && custom.trim()) {
                    setModel(custom.trim());
                    setCustomOpen(false);
                  }
                }}
                placeholder="例如 gpt-5.6-luna"
                className="mt-4 h-10 w-full border border-c-border2 bg-c-subtle2 px-3 text-sm text-c-text outline-none focus:border-acc focus:bg-white"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setCustomOpen(false)} className="h-9 border border-c-border px-4 text-sm text-c-text2">取消</button>
                <button
                  type="button"
                  disabled={!custom.trim()}
                  onClick={() => {
                    setModel(custom.trim());
                    setCustomOpen(false);
                  }}
                  className="h-9 bg-c-text px-4 text-sm font-semibold text-white disabled:opacity-40"
                >
                  使用此模型
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
