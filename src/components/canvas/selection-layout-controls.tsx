"use client";

import {
  AlignHorizontalDistributeCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  type LucideIcon,
} from "lucide-react";
import type { SelectionLayoutAction } from "@/lib/canvas/selection-layout";
import styles from "./selection-layout-controls.module.css";

export type SelectionLayoutControlsProps = {
  /** Count only the nodes the caller has already made eligible for arrangement. */
  count: number;
  busy?: boolean;
  disabled?: boolean;
  onArrange: (action: SelectionLayoutAction) => void;
  className?: string;
};

type LayoutControl = { action: SelectionLayoutAction; label: string; icon: LucideIcon };
const ALIGNMENT_CONTROLS: readonly LayoutControl[] = [
  { action: "left", label: "左对齐", icon: AlignHorizontalJustifyStart },
  { action: "centerX", label: "水平居中", icon: AlignHorizontalJustifyCenter },
  { action: "right", label: "右对齐", icon: AlignHorizontalJustifyEnd },
  { action: "top", label: "顶部对齐", icon: AlignVerticalJustifyStart },
  { action: "centerY", label: "垂直居中", icon: AlignVerticalJustifyCenter },
  { action: "bottom", label: "底部对齐", icon: AlignVerticalJustifyEnd },
];
const DISTRIBUTION_CONTROLS: readonly LayoutControl[] = [
  { action: "distributeX", label: "水平等距分布", icon: AlignHorizontalDistributeCenter },
  { action: "distributeY", label: "垂直等距分布", icon: AlignVerticalDistributeCenter },
];

/** Compact inline groups; the parent owns selection rules, history and busy state. */
export function SelectionLayoutControls({
  count, busy = false, disabled = false, onArrange, className,
}: SelectionLayoutControlsProps) {
  const eligibleCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const unavailable = disabled || busy;
  const button = ({ action, label, icon: Icon }: LayoutControl, minimum: number) => {
    const blocked = unavailable || eligibleCount < minimum;
    return (
      <button key={action} type="button" className={styles.button}
        data-selection-layout-action={action} aria-label={label} title={label}
        disabled={blocked} onClick={() => { if (!blocked) onArrange(action); }}>
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" focusable="false" />
      </button>
    );
  };

  return (
    <div role="group" aria-label="选区布局" aria-busy={busy}
      data-testid="selection-layout-controls"
      className={`canvas-ui-light ${styles.controls}${className ? ` ${className}` : ""}`}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}>
      <div role="group" aria-label="对齐" className={styles.group}>
        {ALIGNMENT_CONTROLS.map(control => button(control, 2))}
      </div>
      <span className={styles.divider} aria-hidden="true" />
      <div role="group" aria-label="分布" className={styles.group}>
        {DISTRIBUTION_CONTROLS.map(control => button(control, 3))}
      </div>
    </div>
  );
}
