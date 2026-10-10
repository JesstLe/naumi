"use client";

import { useCallback, useEffect, useState } from "react";

export function initialAssistantOpen(saved: string | null, desktop: boolean): boolean {
  return desktop && saved !== "closed";
}

/** Only disclosure preference is persisted, never conversation content. */
export function useCanvasAssistantDisclosure(email?: string) {
  const [open, setOpen] = useState(false);
  const [focusInput, setFocusInput] = useState(false);
  const storageKey = email ? `nv:canvas:agent:disclosure:${email}` : null;

  useEffect(() => {
    if (!storageKey) { setOpen(false); return; }
    const media = window.matchMedia("(min-width: 1024px)");
    const restore = () => {
      let saved: string | null = null;
      try { saved = window.localStorage.getItem(storageKey); } catch { /* preference storage is optional */ }
      setOpen(initialAssistantOpen(saved, media.matches));
      setFocusInput(false);
    };
    restore();
    media.addEventListener("change", restore);
    return () => media.removeEventListener("change", restore);
  }, [storageKey]);

  const disclose = useCallback((next: boolean) => {
    setOpen(next);
    setFocusInput(next);
    if (storageKey) {
      try { window.localStorage.setItem(storageKey, next ? "open" : "closed"); } catch { /* in-memory interaction still works */ }
    }
  }, [storageKey]);

  // Properties/OCR temporarily take over the side panel without changing the user's preference.
  const suspend = useCallback(() => { setOpen(false); setFocusInput(false); }, []);
  return { open, focusInput, disclose, suspend };
}
