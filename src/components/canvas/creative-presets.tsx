"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUpRight, Box, Camera, Check, ChevronDown, Eye, Focus, Frame, Palette, Scan, Search, Sparkles, Telescope, X, type LucideIcon } from "lucide-react";
import { CREATIVE_PRESET_CATEGORIES, CREATIVE_PRESETS, filterCreativePresets, type CreativePreset, type CreativePresetCategory } from "@/lib/canvas/creative-presets";
import { canvasPopoverPlacement, type PopoverPlacement } from "@/lib/canvas/popover-placement";
import styles from "./creative-presets.module.css";

export type CreativePresetsProps = {
  /** Apply only a prompt fragment; the parent owns the latest prompt state. */
  onApply: (preset: CreativePreset) => void;
  disabled?: boolean;
  busy?: boolean;
  triggerClassName?: string;
};

const CATEGORY_ICONS: Record<CreativePresetCategory, LucideIcon> = { color: Palette, style: Sparkles, camera: Camera };
const CAMERA_ICONS: Record<string, LucideIcon> = {
  "camera-close": Frame, "camera-detail": Focus, "camera-overhead": ArrowDown, "camera-eye-level": Eye,
  "camera-low-angle": ArrowUpRight, "camera-isometric": Box, "camera-telephoto": Telescope, "camera-wide": Scan,
};

/** Abstract, code-drawn previews; no remote images or generation requests. */
function PresetArtwork({ preset }: { preset: CreativePreset }) {
  const Icon = CAMERA_ICONS[preset.id] ?? Camera;
  const colors = {
    "--preset-1": preset.swatches[0], "--preset-2": preset.swatches[1],
    "--preset-3": preset.swatches[2], "--preset-4": preset.swatches[3],
  } as CSSProperties;
  return <span className={styles.artwork} data-category={preset.category} data-variant={preset.id} style={colors} aria-hidden="true">
    {preset.category === "color" ? <>
      <span className={styles.colorSheets}><i /><i /><i /></span>
      <span className={styles.colorOrb} />
    </> : preset.category === "style" ? <>
      <span className={styles.sceneFloor} />
      <span className={styles.sceneDisc} />
      <span className={styles.sceneObject} />
      <span className={styles.sceneDetail} />
    </> : <>
      <span className={styles.cameraHorizon} />
      <span className={styles.cameraSubject} />
      <span className={styles.cameraFrame}><i /><i /><i /><i /></span>
      <span className={styles.cameraIcon}><Icon size={18} strokeWidth={1.6} /></span>
    </>}
  </span>;
}

/**
 * A non-modal, independently anchored prompt-only picker. Selection is a preview;
 * only the explicit Apply button invokes onApply. Escape handling stays local.
 */
export function CreativePresetsPopover({ onApply, disabled = false, busy = false, triggerClassName }: CreativePresetsProps) {
  const uid = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const focusedOnOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CreativePresetCategory>("color");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);
  const blocked = disabled || busy;
  const visible = open && !blocked;
  const results = useMemo(() => filterCreativePresets(category, query), [category, query]);
  const selected = CREATIVE_PRESETS.find(preset => preset.id === selectedId) ?? null;
  const categoryLabel = CREATIVE_PRESET_CATEGORIES.find(item => item.id === category)!.label;

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    focusedOnOpen.current = false;
    if (restoreFocus && trigger.current?.isConnected && !trigger.current.disabled) trigger.current.focus({ preventScroll: true });
  }, []);

  const show = () => {
    if (blocked) return;
    focusedOnOpen.current = false;
    setPlacement(null);
    setQuery("");
    setSelectedId(null);
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!visible) return;
    const update = () => {
      if (!trigger.current) return;
      const next = canvasPopoverPlacement(trigger.current.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight }, 592, 456);
      setPlacement(previous => previous && previous.left === next.left && previous.top === next.top && previous.width === next.width
        && previous.maxHeight === next.maxHeight && previous.side === next.side ? previous : next);
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      update();
    };
    update();
    const observer = new ResizeObserver(update);
    if (trigger.current) observer.observe(trigger.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", onScroll, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", onScroll, true); };
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible || !placement || focusedOnOpen.current) return;
    focusedOnOpen.current = true;
    search.current?.focus({ preventScroll: true });
  }, [visible, placement]);

  useEffect(() => {
    if (blocked) close();
  }, [blocked, close]);

  useEffect(() => {
    if (!visible) return;
    // Dismiss without consuming the outside event or stealing its intended focus.
    const dismissOutside = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node) || panel.current?.contains(target) || trigger.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("focusin", dismissOutside, true);
    return () => { document.removeEventListener("pointerdown", dismissOutside, true); document.removeEventListener("focusin", dismissOutside, true); };
  }, [visible, close]);

  const changeCategory = (next: CreativePresetCategory) => {
    setCategory(next);
    setSelectedId(null);
    grid.current?.scrollTo({ top: 0 });
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? CREATIVE_PRESET_CATEGORIES.length - 1
      : (index + (event.key === "ArrowLeft" ? -1 : 1) + CREATIVE_PRESET_CATEGORIES.length) % CREATIVE_PRESET_CATEGORIES.length;
    changeCategory(CREATIVE_PRESET_CATEGORIES[next].id);
    panel.current?.querySelector<HTMLButtonElement>(`[data-preset-tab="${CREATIVE_PRESET_CATEGORIES[next].id}"]`)?.focus();
  };

  const onCardKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const columns = grid.current ? getComputedStyle(grid.current).gridTemplateColumns.split(" ").filter(Boolean).length : 3;
    const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -columns : columns;
    const next = event.key === "Home" ? 0 : event.key === "End" ? results.length - 1 : ((index + delta) % results.length + results.length) % results.length;
    setSelectedId(results[next].id);
    grid.current?.querySelector<HTMLButtonElement>(`[data-preset-id="${results[next].id}"]`)?.focus({ preventScroll: true });
    grid.current?.querySelector<HTMLButtonElement>(`[data-preset-id="${results[next].id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  return <>
    <button ref={trigger} type="button" disabled={blocked} aria-label="创意预设" aria-haspopup="dialog"
      aria-expanded={visible} aria-controls={visible ? `${uid}-panel` : undefined}
      data-canvas-hotkeys-blocked="true" data-testid="canvas-creative-presets-trigger"
      className={`canvas-ui-light ${styles.trigger}${triggerClassName ? ` ${triggerClassName}` : ""}`}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); if (visible) close(); else show(); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowDown") { event.preventDefault(); show(); }
        if (event.key === "Escape" && visible) { event.preventDefault(); close(true); }
      }}>
      <Sparkles size={14} aria-hidden="true" /><span>创意预设</span><ChevronDown size={12} aria-hidden="true" />
    </button>
    {visible && createPortal(
      <div ref={panel} id={`${uid}-panel`} role="dialog" aria-modal="false" aria-labelledby={`${uid}-title`}
        data-canvas-hotkeys-blocked="true" data-testid="canvas-creative-presets-popover" data-side={placement?.side}
        className={`canvas-ui-light ${styles.panel}`}
        style={placement ? { left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight }
          : { width: 456, visibility: "hidden" }}
        onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
        onKeyDown={event => {
          // Local isolation preserves native text editing and browser shortcuts.
          event.stopPropagation();
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === "Escape") { event.preventDefault(); close(true); }
          if (event.key === "Tab") {
            const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled)') ?? []);
            const edge = event.shiftKey ? controls[0] : controls[controls.length - 1];
            // A portal is last in DOM order. Return to the anchor before native
            // Tab continues into the surrounding toolbar, without a focus trap.
            if (event.target === edge) close(true);
          }
        }}>
        <div className={styles.heading}>
          <h2 id={`${uid}-title`}><Sparkles size={16} aria-hidden="true" />创意预设</h2>
          <button type="button" aria-label="关闭创意预设" className={styles.iconButton} onClick={() => close(true)}><X size={16} aria-hidden="true" /></button>
        </div>
        <div role="tablist" aria-label="预设类别" className={styles.tabs}>
          {CREATIVE_PRESET_CATEGORIES.map((item, index) => {
            const Icon = CATEGORY_ICONS[item.id];
            return <button key={item.id} type="button" role="tab" id={`${uid}-tab-${item.id}`}
              aria-selected={category === item.id} aria-controls={`${uid}-results`} tabIndex={category === item.id ? 0 : -1}
              data-preset-tab={item.id} onClick={() => changeCategory(item.id)} onKeyDown={event => onTabKeyDown(event, index)}>
              <Icon size={15} aria-hidden="true" />{item.label}
            </button>;
          })}
        </div>
        <div className={styles.search}>
          <Search size={15} aria-hidden="true" />
          <input ref={search} type="search" value={query} aria-label={`搜索${categoryLabel}预设`} placeholder={`搜索${categoryLabel}`}
            autoComplete="off" spellCheck={false} data-testid="canvas-creative-presets-search"
            onChange={event => { setQuery(event.target.value); setSelectedId(null); grid.current?.scrollTo({ top: 0 }); }} />
          <span className={styles.resultCount} aria-hidden="true">{results.length}</span>
        </div>
        <div id={`${uid}-results`} role="tabpanel" aria-labelledby={`${uid}-tab-${category}`} className={styles.results}>
          {results.length ? <div ref={grid} role="radiogroup" aria-label={`${categoryLabel}预设`} className={styles.grid}>
            {results.map((preset, index) => {
              const checked = selectedId === preset.id;
              return <button key={preset.id} type="button" role="radio" aria-checked={checked} disabled={blocked}
                aria-label={`${preset.label}，${preset.description}`} title={preset.promptFragment}
                tabIndex={checked || (!results.some(item => item.id === selectedId) && index === 0) ? 0 : -1}
                data-preset-id={preset.id} className={styles.card} onClick={() => setSelectedId(preset.id)}
                onKeyDown={event => onCardKeyDown(event, index)}>
                <PresetArtwork preset={preset} />
                <span className={styles.cardText}><span className={styles.cardLabel}>{preset.label}</span><span className={styles.cardDescription}>{preset.description}</span></span>
                {preset.category === "color" && <span className={styles.swatches} aria-hidden="true">
                  {preset.swatches.map((color, colorIndex) => <i key={`${color}-${colorIndex}`} style={{ backgroundColor: color }} />)}
                </span>}
                {checked && <span className={styles.selectedMark} aria-hidden="true"><Check size={12} strokeWidth={2.5} /></span>}
              </button>;
            })}
          </div> : <div className={styles.empty} role="status"><Search size={24} aria-hidden="true" /><span>未找到匹配的{categoryLabel}</span><button type="button" onClick={() => { setQuery(""); search.current?.focus(); }}>清除搜索</button></div>}
        </div>
        <div className={styles.preview} data-testid="canvas-creative-presets-preview">
          <div className={styles.previewTitle}><span>{selected ? selected.label : "未选择预设"}</span><span>提示词片段</span></div>
          <p aria-live="polite" aria-atomic="true">{selected?.promptFragment ?? "选择卡片预览"}</p>
          <button type="button" className={styles.apply} disabled={blocked || !selected} data-testid="canvas-creative-presets-apply"
            onClick={() => { if (!selected || blocked) return; close(true); onApply(selected); }}>
            <Check size={14} aria-hidden="true" />添加到提示词
          </button>
        </div>
      </div>, document.body
    )}
  </>;
}

export { CreativePresetsPopover as CreativePresets };
