import type { FeatureId } from "../billing/rules/registry";

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
