"use client";

import { usePathname } from "next/navigation";

/** Pages API routes make Next's shared navigation hooks nullable. */
export function useAppPathname() {
  return usePathname() ?? "";
}
