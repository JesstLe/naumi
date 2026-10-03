"use client";
import { useEffect, useState } from "react";
import styles from "./dashboard.module.css";
export function BiTooltip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(
    null,
  );
  useEffect(() => {
    let anchor: HTMLElement | null = null;
    const show = (target: EventTarget | null, x?: number, y?: number) => {
      anchor =
        target instanceof Element
          ? target.closest<HTMLElement>("[data-bi-tip]")
          : null;
      if (!anchor) {
        setTip(null);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      setTip({
        text: anchor.dataset.biTip || "",
        x: Math.max(8, Math.min((x ?? rect.left) + 12, innerWidth - 320)),
        y: Math.max(8, Math.min((y ?? rect.top) + 18, innerHeight - 245)),
      });
    };
    const pointer = (e: PointerEvent) => show(e.target, e.clientX, e.clientY);
    const focus = (e: FocusEvent) => show(e.target);
    const hide = () => {
      anchor = null;
      setTip(null);
    };
    const scroll = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches("[data-bi-tip]"))
        show(active);
      else hide();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("pointermove", pointer);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("pointermove", pointer);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("blur", hide);
    };
  }, []);
  return tip ? (
    <div
      role="tooltip"
      className={styles.tooltip}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>
  ) : null;
}
