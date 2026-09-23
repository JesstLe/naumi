"use client";

import { useState } from "react";
import { Check, ChevronDown, Cpu, Plus, X } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useTextModel } from "@/lib/text-model-context";

export function TextModelSelect({
  compact = false,
  dark = false,
  direction = "down",
  className,
}: {
  compact?: boolean;
  dark?: boolean;
  direction?: "up" | "down";
  className?: string;
}) {
  const { model, models, setModel } = useTextModel();
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");

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
            <Cpu className="h-3.5 w-3.5 flex-none" />
            <span className="min-w-0 flex-1 truncate">{item}</span>
            {item === model && <Check className="h-3.5 w-3.5 flex-none text-acc" />}
          </button>
        ))}
        <button
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
        </button>
      </div>
    </>
  ) : null;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex max-w-[260px] items-center gap-1.5 border text-xs font-semibold transition-colors",
          compact ? "h-8 px-2.5" : "h-9 px-3",
          dark
            ? "border-[#343842] bg-[#1f2229] text-[#e7e9ee] hover:border-[#596170]"
            : "border-c-border bg-white text-c-text2 hover:border-c-border2 hover:text-c-text"
        )}
        title={`文字模型：${model}`}
      >
        <Cpu className="h-3.5 w-3.5 flex-none" />
        <span className="min-w-0 truncate">{model}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-none opacity-60" />
      </button>
      {menu}
      {customOpen && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4" onClick={() => setCustomOpen(false)}>
            <div className="w-full max-w-md border border-c-border bg-white p-5 shadow-pop" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-c-text">使用其他文本模型</h3>
                <button type="button" onClick={() => setCustomOpen(false)} className="text-c-text3 hover:text-c-text">
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
                    setModel(custom);
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
                    setModel(custom);
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
