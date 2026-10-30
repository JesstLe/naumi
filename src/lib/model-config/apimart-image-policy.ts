import { z } from "zod";
import type { ModelExecutionScope } from "./context";

/** Explicit, versioned opt-in. Legacy APIMart Router snapshots never acquire it. */
export const apimartImagesSchema = z.strictObject({
  schemaVersion: z.literal(1),
  maxOutputs: z.number().int().min(1).max(4),
  supportsMask: z.boolean(),
  // Explicit publication, not a model-name guess. Native auto chooses an
  // output frame; it does not promise the reference's exact pixel ratio.
  automaticRatio: z.strictObject({enabled:z.boolean(),source:z.string().trim().min(1).max(1000),checkedAt:z.iso.date()}).optional(),
  ratios: z.array(z.string().regex(/^[1-9]\d{0,2}:[1-9]\d{0,2}$/)).min(1).max(30).refine(v => new Set(v).size === v.length),
  outputDimensions: z.record(z.string().regex(/^(1K|2K|4K):[1-9]\d{0,2}:[1-9]\d{0,2}$/), z.strictObject({
    width: z.number().int().min(1).max(16384), height: z.number().int().min(1).max(16384),
  })).optional(),
});

export function acceptsAPIMartRatio(policy: {ratios:readonly string[];automaticRatio?:{enabled:boolean}}, ratio:string) {
  return policy.ratios.includes(ratio) || ratio === "auto" && policy.automaticRatio?.enabled === true;
}

export const applicationAPIMartImages = (protocol: string, parameterMap?: { apimartImages?: unknown }) =>
  protocol === "apimart-images" && !!parameterMap?.apimartImages;
export const queryableImageScope = (scope: ModelExecutionScope) =>
  scope.connection.options?.imageAdapter === "reverse-hub" ||
  applicationAPIMartImages(scope.connection.protocol, scope.parameterMap);
