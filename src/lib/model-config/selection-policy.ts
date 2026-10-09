import type { FeatureId } from "../billing/rules/registry";
import { ModelConfigError } from "./types";

export function assertPlatformImageSelection(...ids: unknown[]) {
  if (ids.some(id => typeof id === "string" && id.trim().startsWith("byok:")))
    throw new ModelConfigError("USER_IMAGE_PROVIDER_DISABLED", "用户自带接口已取消，请刷新并选择平台模型", 409);
}

/** Canvas operations use the administrator's published default, not a user preference.
 * Apply only to new request resolution. Frozen executions must retain their original model. */
export const ADMIN_CONFIGURED_FEATURES: readonly FeatureId[] = [
  "canvas.image", "canvas.expand", "canvas.text-edit", "canvas.annotate",
  "canvas.ocr", "canvas.assistant", "canvas.text-generate",
];
export function adminConfiguredFeature(feature?: string): boolean {
  return ADMIN_CONFIGURED_FEATURES.includes(feature as FeatureId);
}
export function requestedFeatureModel(feature: string | undefined, requested?: string): string | undefined {
  return adminConfiguredFeature(feature) ? undefined : requested;
}
