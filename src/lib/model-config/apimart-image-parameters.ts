import "server-only";
import type { ModelExecutionScope } from "./context";
import { ModelConfigError } from "./types";
import { policyQuality } from "./quality-policy";
import { mapResolution } from "./resolution-policy";
import { currentImagegenStep } from "../imagegen/context";
import { imagegenWireRequest, mapImagegenParameters } from "../imagegen/parameters";
import { publishedImagegenCapabilities } from "../imagegen/capabilities";

export function apimartImageParameters(scope: ModelExecutionScope, requested: { quality: string; resolution: string; ratio: string }) {
  const map = scope.parameterMap, policy = map.apimartImages;
  if (!policy || !map.qualityPolicy || !map.resolutionPolicy) throw new ModelConfigError("INVALID_CONFIG", "异步图片通道缺少显式参数契约");
  if (!policy.ratios.includes(requested.ratio) || !scope.capabilities.qualities.includes(requested.quality as never) ||
      !scope.capabilities.nativeResolutions.includes(requested.resolution as never))
    throw new ModelConfigError("MODEL_INCOMPATIBLE", "异步图片通道未开放此质量、尺寸或比例", 422);
  const upstream: Record<string, string | number | boolean> = {};
  const quality = policyQuality(map.qualityPolicy, requested.quality);
  if (quality !== undefined) upstream.quality = quality;
  mapResolution(upstream, map.resolutionPolicy, requested.resolution, requested.ratio);
  const advanced = currentImagegenStep();
  if (advanced) Object.assign(upstream, mapImagegenParameters(imagegenWireRequest(advanced.request), publishedImagegenCapabilities(scope.capabilities), map.imagegen || {}));
  const expected = advanced?.request.parameters.width!==undefined && advanced?.request.parameters.height!==undefined
    ? {width:advanced.request.parameters.width,height:advanced.request.parameters.height}
    : policy.outputDimensions?.[`${requested.resolution}:${requested.ratio}`];
  if (scope.frozen.facts?.nativeResolution && !expected) throw new ModelConfigError("MODEL_INCOMPATIBLE", "原生像素规格缺少已维护的输出尺寸", 422);
  return { expectedPixels:expected, requested, effective: { ...requested }, upstream, promptConstraints: [] as string[], nativeRatio: !!expected, nativeResolution: !!expected };
}
