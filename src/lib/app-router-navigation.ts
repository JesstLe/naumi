"use client";

import { useSearchParams } from "next/navigation";

const emptySearchParams = new URLSearchParams();
type AppSearchParams = Omit<URLSearchParams, "append" | "delete" | "set" | "sort">;

/** Pages API routes make Next's shared navigation hooks nullable. */
export function useAppSearchParams(): AppSearchParams {
  return useSearchParams() ?? emptySearchParams;
}
