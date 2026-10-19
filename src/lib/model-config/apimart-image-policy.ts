import { z } from "zod";
import type { ModelExecutionScope } from "./context";

/** Explicit, versioned opt-in. Legacy APIMart Router snapshots never acquire it. */
export const apimartImagesSchema = z.strictObject({
  schemaVersion: z.literal(1),
  maxOutputs: z.number().int().min(1).max(4),
  supportsMask: z.boolean(),
  ratios: z.array(z.string().regex(/^[1-9]\d{0,2}:[1-9]\d{0,2}$/)).min(1).max(30).refine(v => new Set(v).size === v.length),
  outputDimensions: z.record(z.string().regex(/^(1K|2K|4K):[1-9]\d{0,2}:[1-9]\d{0,2}$/), z.strictObject({
    width: z.number().int().min(1).max(16384), height: z.number().int().min(1).max(16384),
  })).optional(),
});

export const applicationAPIMartImages = (protocol: string, parameterMap?: { apimartImages?: unknown }) =>
  protocol === "apimart-images" && !!parameterMap?.apimartImages;
export const queryableImageScope = (scope: ModelExecutionScope) =>
  scope.connection.options?.imageAdapter === "reverse-hub" ||
  applicationAPIMartImages(scope.connection.protocol, scope.parameterMap);
