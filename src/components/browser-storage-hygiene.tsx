"use client";

import { useEffect } from "react";
import { scheduleBrowserStorageHygiene } from "@/lib/browser-storage/hygiene";

export function BrowserStorageHygiene() {
  useEffect(() => { scheduleBrowserStorageHygiene(); }, []);
  return null;
}
