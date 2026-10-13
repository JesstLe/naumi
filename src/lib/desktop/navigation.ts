"use client";
import { useMemo } from "react";
import { usePathname, useRouter as useNextRouter } from "next/navigation";
import { desktopHref } from "./routes";
export function useWorkspaceRouter() {
  const router = useNextRouter();
  const path = usePathname() || "";
  const desktop = path === "/desktop" || path.startsWith("/desktop/");
  return useMemo(() => ({ ...router,
    push: (href: string, options?: Parameters<typeof router.push>[1]) => router.push(desktopHref(href, desktop), options),
    replace: (href: string, options?: Parameters<typeof router.replace>[1]) => router.replace(desktopHref(href, desktop), options),
    prefetch: (href: string, options?: Parameters<typeof router.prefetch>[1]) => router.prefetch(desktopHref(href, desktop), options),
  }), [router, desktop]);
}
