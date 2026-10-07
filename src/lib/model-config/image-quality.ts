import "server-only";
import { resolveImageQuality } from "../image-quality";
import { currentModelExecution } from "./context";
export function resolveConfiguredImageQuality(requested: unknown) {
  const preset = currentModelExecution("image")?.imagePreset;
  if (preset) { const value = typeof requested === "string" ? requested.trim().toLowerCase() : "medium"; return {requested:value,executed:(value === "low" ? "low" : "medium") as "low" | "medium",fallbackReason:value === "low" || value === "medium" ? null : "preset-quality-cap" as const}; }
  return resolveImageQuality(requested, currentModelExecution("image")?.capabilities.qualities);
}
