"use client";
import {useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {ChevronDown} from "lucide-react";
import {cn} from "@/lib/utils";
import {CANVAS_MAX_COUNT} from "@/lib/canvas/generation-parameters";
const MAX_GENERATION_COUNT=CANVAS_MAX_COUNT;

export function RatioIcon({ w, h }: { w: number; h: number }) {
  const M = 16;
  let bw = M;
  let bh = M;
  if (w && h) {
    if (w >= h) bh = Math.max(7, Math.round((M * h) / w));
    else bw = Math.max(7, Math.round((M * w) / h));
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
      className="shrink-0" aria-hidden="true" focusable="false">
      <rect x={(18 - bw) / 2} y={(18 - bh) / 2} width={bw} height={bh}
        rx="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// Shared canvas picker; its portal stays outside composer clipping.
// dir="up" 向上弹(dock 里用)、"down" 向下弹(顶部工具条用)。
export function CanvasSelect({
  trigger,
  triggerClass,
  hint,
  value,
  options,
  onPick,
  dir = "up",
  disabled,
  light = false,
}: {
  trigger: ReactNode;
  triggerClass?: string;
  hint?: string;
  value: string;
  options: { value: string; label: ReactNode }[];
  onPick: (v: string) => void;
  dir?: "up" | "down";
  disabled?: boolean;
  light?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{
    left: number;
    top: number;
    bottom: number;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    if (disabled) return;
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, top: r.top, bottom: r.bottom });
    setOpen((v) => !v);
  };
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={hint}
        aria-expanded={open}
        aria-haspopup="true"
        disabled={disabled}
        className={triggerClass}
      >
        {trigger}
        <ChevronDown
          className={cn(
            "h-3 w-3 flex-none text-[#9aa1ae] transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            data-canvas-hotkeys-blocked="true"
            className={cn("fixed inset-0 z-[200]", light ? "canvas-ui-light" : "canvas-ui-dark")}
            onClick={() => setOpen(false)}
          >
            <div
              data-testid="canvas-select-options"
              onClick={(e) => e.stopPropagation()}
              style={
                dir === "down"
                  ? { left: rect.left, top: rect.bottom + 8, maxHeight: Math.max(80, window.innerHeight-rect.bottom-24), overflowY: "auto", overscrollBehavior: "contain" }
                  : {
                      left: rect.left,
                      maxHeight: Math.max(80, rect.top-24),
                      overflowY: "auto",
                      overscrollBehavior: "contain",
                      bottom:
                        (typeof window !== "undefined"
                          ? window.innerHeight
                          : 0) -
                        rect.top +
                        8,
                    }
              }
              className={cn(
                "canvas-ui-surface fixed min-w-[128px] rounded-xl border p-1",
                dir === "down" ? "menu-pop-down" : "menu-pop-up"
              )}
            >
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onPick(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "block w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                    o.value === value
                      ? "canvas-ui-control font-semibold"
                      : "canvas-ui-action"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export function ImageCountControl({
  value,
  onChange,
  disabled = false,
  light = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  light?: boolean;
}) {
  const clamp = (value: number) =>
    Math.min(MAX_GENERATION_COUNT, Math.max(1, Math.round(value) || 1));
  return (
    <div className={cn(light ? "canvas-ui-light" : "canvas-ui-dark", "canvas-ui-control flex h-8 items-center overflow-hidden rounded-[9px] text-[12.5px] font-semibold")}>
      <button
        type="button"
        disabled={disabled || value <= 1}
        onClick={() => onChange(clamp(value - 1))}
        className="canvas-ui-action h-full px-2 disabled:opacity-35"
        aria-label="减少生成数量"
      >
        −
      </button>
      <input
        type="number"
        min={1}
        max={MAX_GENERATION_COUNT}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
        className="canvas-ui-text h-full w-8 border-0 bg-transparent p-0 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label="生成图片数量"
      />
      <span className="canvas-ui-muted pr-1">张</span>
      <button
        type="button"
        disabled={disabled || value >= MAX_GENERATION_COUNT}
        onClick={() => onChange(clamp(value + 1))}
        className="canvas-ui-action h-full px-2 disabled:opacity-35"
        aria-label="增加生成数量"
      >
        +
      </button>
    </div>
  );
}
