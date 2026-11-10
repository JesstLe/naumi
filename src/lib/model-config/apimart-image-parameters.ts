import {executionImageParameterPlan} from './image-plan-runtime';
import { conventionalContract } from "./parameter-contract";
import {applyImageParameterPlan} from './image-parameter-plan';
import "server-only";
import type { ModelExecutionScope } from "./context";
import { ModelConfigError } from "./types";
import { policyQuality } from "./quality-policy";
import { mapResolution } from "./resolution-policy";
import { currentImagegenStep } from "../imagegen/context";
import { imagegenWireRequest, mapImagegenParameters } from "../imagegen/parameters";
import { publishedImagegenCapabilities } from "../imagegen/capabilities";
import { exactRatioPixels } from "../imagegen/request-size";

export function apimartImageParameters(scope: ModelExecutionScope, requested: { quality: string; resolution: string; ratio: string }) {
  const plan=executionImageParameterPlan(scope,{},requested);
  if(plan)return {expectedPixels:plan.expectedPixels,requested:plan.requested,effective:{...requested,...plan.effective},upstream:applyImageParameterPlan({},plan) as Record<string,string|number|boolean>,promptConstraints:[] as string[],nativeRatio:!!plan.expectedPixels,nativeResolution:!!plan.expectedPixels,parameterPlan:plan};
  const map = scope.parameterMap, policy = map.apimartImages;
  if (!policy || !map.qualityPolicy || !map.resolutionPolicy) throw new ModelConfigError("INVALID_CONFIG", "异步图片通道缺少显式参数契约");
  // Follow-reference ratios outside the named list ride the gpt-image
  // exact-size contract as native 16-grid pixels; apib returns exactly those
  // dimensions (probed 2026-10-27), so the ratio itself never reaches the wire.
  const named = policy.ratios.includes(requested.ratio);
  const exactPixels = named ? undefined : exactRatioPixels(requested.ratio, scope.parameterModelId || scope.frozen.publicModelId);
  if ((!named && !exactPixels) || !conventionalContract(map) && (!scope.capabilities.qualities.includes(requested.quality as never) ||
      !scope.capabilities.nativeResolutions.includes(requested.resolution as never)))
    throw new ModelConfigError("MODEL_INCOMPATIBLE", "异步图片通道未开放此质量、尺寸或比例", 422);
  const upstream: Record<string, string | number | boolean> = {};
  const quality = policyQuality(map.qualityPolicy, requested.quality, map.parameterContract);
  if (quality !== undefined) upstream.quality = quality;
  if (exactPixels) {
    // Pixel sizes fully determine the output; pairing them with the tier
    // field is unverified upstream, so send only the sized dimensions.
    const sizeField = map.resolutionPolicy.ratioField && map.resolutionPolicy.ratioField !== map.resolutionPolicy.field
      ? map.resolutionPolicy.ratioField : "size";
    upstream[sizeField] = `${exactPixels.width}x${exactPixels.height}`;
  } else {
    mapResolution(upstream, map.resolutionPolicy, requested.resolution, requested.ratio, map.parameterContract);
  }
  const advanced = currentImagegenStep();
  if (advanced) Object.assign(upstream, mapImagegenParameters(imagegenWireRequest(advanced.request), publishedImagegenCapabilities(scope.capabilities), map.imagegen || {}));
  const expected = advanced?.request.parameters.width!==undefined && advanced?.request.parameters.height!==undefined
    ? {width:advanced.request.parameters.width,height:advanced.request.parameters.height}
    : exactPixels ?? policy.outputDimensions?.[`${requested.resolution}:${requested.ratio}`];
  if (scope.frozen.facts?.nativeResolution && !expected) throw new ModelConfigError("MODEL_INCOMPATIBLE", "原生像素规格缺少已维护的输出尺寸", 422);
  return { expectedPixels:expected, requested, effective: { ...requested }, upstream, promptConstraints: [] as string[], nativeRatio: !!expected, nativeResolution: !!expected };
}
