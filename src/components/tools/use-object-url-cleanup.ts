"use client";

import {useEffect, useRef} from "react";

/** Unmount cleanup reads current inputs, not the initial empty upload state.
 * Replacement/removal remains owned by each picker; retained URLs stay live.
 */
export function useObjectUrlCleanup(urls: readonly (string | undefined)[]) {
  const current = useRef(urls);
  current.current = urls;
  useEffect(() => () => {
    for (const url of new Set(current.current)) {
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    }
  }, []);
}
