"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { qualityMenuPosition, nextQualityOption } from "./image-quality-select-layout";

type Option = { value: string; label: ReactNode; disabled?: boolean };

/** Quality-only presentation; capabilities, prices and preference updates stay with the caller. */
export function ImageQualitySelect({ value, options, onChange, disabled, compact, canvas, label, title }: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  canvas?: boolean;
  label: string;
  title?: string;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<ReturnType<typeof qualityMenuPosition> | null>(null);
  const [theme, setTheme] = useState("canvas-ui-light");
  const [lightTool,setLightTool]=useState(false);
  const [active, setActive] = useState(-1);
  const open = menu !== null && !disabled;
  const selected = options.find(option => option.value === value);
  const useCanvasStyle = canvas || compact;

  function close() { setMenu(null); }
  function show(direction: 1 | -1 = 1) {
    if (disabled || !button.current || !options.length) return;
    setLightTool(!!button.current.closest('.tool-page'));
    const root = button.current.closest(".canvas-ui-light, .canvas-ui-dark");
    setTheme(root?.classList.contains("canvas-ui-dark") ? "canvas-ui-dark" : "canvas-ui-light");
    setMenu(qualityMenuPosition(button.current.getBoundingClientRect(), window.innerWidth, window.innerHeight, options.length));
    const current = options.findIndex(option => option.value === value && !option.disabled);
    setActive(current >= 0 ? current : nextQualityOption(options, direction === 1 ? -1 : 0, direction));
    button.current.focus({ preventScroll: true });
  }
  function pick(index: number) {
    const option = options[index];
    if (!option || option.disabled || disabled) return;
    onChange(option.value);
    close();
    button.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open) return;
    const scroll = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      const rect = button.current?.getBoundingClientRect();
      if (!rect || rect.bottom <= 0 || rect.top >= window.innerHeight) { setMenu(null); return; }
      setMenu(qualityMenuPosition(rect, window.innerWidth, window.innerHeight, options.length));
    };
    const resize = () => setMenu(null);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [open, options.length]);

  useEffect(() => {
    const list=panel.current,item=list?.children[active] as HTMLElement|undefined;
    if(!open||!list||!item)return;
    if(item.offsetTop<list.scrollTop)list.scrollTop=item.offsetTop;
    else if(item.offsetTop+item.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=item.offsetTop+item.offsetHeight-list.clientHeight;
  }, [active, open]);

  useEffect(() => { if (disabled) setMenu(null); }, [disabled]);

  return <>
    <button ref={button} type="button" role="combobox" aria-label={label} title={title}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
      data-testid="image-quality-select" data-canvas-hotkeys-blocked="true" disabled={disabled}
      onClick={() => open ? close() : show()}
      onBlur={close}
      onKeyDown={event => {
        if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " ", "Escape"].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          if (event.key === "Escape") { close(); return; }
          if (!open) { show(event.key === "ArrowUp" || event.key === "End" ? -1 : 1); return; }
          if (event.key === "Enter" || event.key === " ") { pick(active); return; }
          const direction = event.key === "ArrowUp" || event.key === "End" ? -1 : 1;
          setActive(nextQualityOption(options, event.key === "Home" ? -1 : event.key === "End" ? 0 : active, direction));
        } else if (event.key === "Tab") { close(); }
      }}
      className={cn("inline-flex min-w-0 items-center justify-between gap-2 border text-left font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        compact ? "h-8 max-w-40 rounded-[9px] px-2.5 py-0 text-[12.5px] font-semibold" : "w-full rounded-lg px-3 py-2 text-sm",
        useCanvasStyle ? "canvas-ui-control" : "border-c-border bg-c-card text-c-text hover:border-c-text3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
        open && "ring-1 ring-primary/30")}>
      <span className="min-w-0 truncate">{selected?.label ?? value}</span>
      <ChevronDown className={cn("h-3 w-3 shrink-0 opacity-60 transition-transform", open && "rotate-180")} />
    </button>
    {open && menu && createPortal(
      <div data-canvas-hotkeys-blocked="true" className={cn("fixed inset-0 z-[300]", useCanvasStyle && theme,lightTool&&"tool-popover")}
        onPointerDown={event => { event.stopPropagation(); close(); }}>
        <div ref={panel} id={id} role="listbox" aria-label={label}
          data-testid="image-quality-menu" style={menu}
          onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}
          className={cn("fixed overflow-y-auto overscroll-contain rounded-xl border p-1 shadow-[0_12px_40px_rgba(16,20,23,.12),0_2px_8px_rgba(16,20,23,.06)]",
            useCanvasStyle ? "canvas-ui-surface canvas-ui-surface-solid" : "border-c-border bg-c-card text-c-text")}>
          {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option"
            aria-selected={option.value === value} aria-disabled={!!option.disabled}
            onPointerMove={() => { if (!option.disabled) setActive(index); }} onClick={() => pick(index)}
            className={cn("flex min-h-9 items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-xs transition-colors",
              option.disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
              useCanvasStyle ? index === active && !option.disabled ? "canvas-ui-control" : "canvas-ui-action" : index === active && !option.disabled ? "bg-c-subtle2" : "",
              option.value === value && "font-semibold")}>
            <span className="min-w-0 break-words">{option.label}</span>
            <Check className={cn("h-3.5 w-3.5 shrink-0 text-primary", option.value === value ? "opacity-100" : "opacity-0")} />
          </div>)}
        </div>
      </div>, document.body)}
  </>;
}
