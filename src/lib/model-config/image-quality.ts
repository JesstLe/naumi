import "server-only";
import { resolveImageQuality } from "../image-quality";
import { currentModelExecution } from "./context";
export function resolveConfiguredImageQuality(requested: unknown) {
  return resolveImageQuality(requested, currentModelExecution("image")?.capabilities.qualities);
}
