"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SurfaceAppearanceProvider } from "@/components/ui/surface-appearance";
import { workspacePresentation } from "./route-policy";
import "./workspace-surface.css";

/** Local appearance, including global dialogs and body portals. Never rewrites
 * the user's theme preference or the suspended Canvas/admin/desktop surfaces. */
export function ProductSurface({ children }: { children: ReactNode }) {
  const path = usePathname() || "/";
  const active = workspacePresentation(path) !== "excluded";
  useEffect(() => {
    if (!active) return;
    document.body.dataset.workspaceSurface = "light";
    return () => { delete document.body.dataset.workspaceSurface; };
  }, [active]);
  if (!active) return <>{children}</>;
  return <SurfaceAppearanceProvider value="light"><div className="workspace-surface" data-workspace-surface="light">{children}</div></SurfaceAppearanceProvider>;
}
