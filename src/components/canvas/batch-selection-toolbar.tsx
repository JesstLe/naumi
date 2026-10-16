"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./batch-selection-toolbar.module.css";

/** Keep selection status and dismissal reachable while only the actions scroll. */
export function BatchSelectionToolbar({ label, selectionLabel, clearLabel, onClear, testId, primaryAction, children }: {
  label: string;
  selectionLabel: string;
  clearLabel: string;
  onClear: () => void;
  testId: string;
  primaryAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div aria-label={label} data-testid={testId}
      className={`canvas-ui-surface cz-anim-bottom-center absolute bottom-[128px] left-1/2 z-30 -translate-x-1/2 min-[800px]:bottom-[84px] ${styles.surface}`}>
      <span data-testid="batch-selection-count" className={`canvas-ui-muted ${styles.count}`}>
        {selectionLabel}
      </span>
      {primaryAction && <div className={styles.primary} data-batch-primary>{primaryAction}</div>}
      <div data-batch-scroll className={styles.actions}>
        {children}
      </div>
      <div className={styles.dismiss}>
        <button type="button" onClick={onClear} aria-label={clearLabel} title={clearLabel}
          className="canvas-ui-action flex h-9 w-9 flex-none items-center justify-center rounded-lg transition-colors">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
