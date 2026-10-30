"use client";

import { createContext, useContext } from "react";

export type SurfaceAppearance = "light" | "dark";
const SurfaceAppearanceContext = createContext<SurfaceAppearance | null>(null);

/** A local UI surface can differ from the application's theme. React portals
 * retain this value; their DOM root must still carry the matching CSS class. */
export const SurfaceAppearanceProvider = SurfaceAppearanceContext.Provider;
export const useSurfaceAppearance = () => useContext(SurfaceAppearanceContext);
export const surfaceAppearanceClass = (appearance: SurfaceAppearance | null) =>
  appearance ? `canvas-ui-${appearance}` : undefined;
