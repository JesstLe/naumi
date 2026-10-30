import { exactImageRequestSize, exactRatioPixels, ExactImageSizeError } from "./request-size";
import { unsupportedReverseHubRatio } from "./ratio-support";
import {acceptsAPIMartRatio} from "../model-config/apimart-image-policy";

type RouteSource = {
  model: string;
  parameterMap: { apimartImages?: { ratios: readonly string[];automaticRatio?:{enabled:boolean} } };
};

/** New requests only. Mirrors the pre-SDK family wire-size gate and the
 * adapter's explicit ratio contract BEFORE quoting/freezing/creating a job.
 * Frozen accepted jobs are deliberately not reinterpreted here. */
export function imageRequestAdmission(
  ratio: string,
  publicModelId: string,
  supplierRouting: boolean,
  source: RouteSource,
  adapter?: string,
): string[] {
  const codes: string[] = [];
  if(unsupportedReverseHubRatio(ratio,adapter))codes.push("REVERSE_HUB_RATIO_UNSUPPORTED");
  try {
    exactImageRequestSize(ratio, supplierRouting ? publicModelId : source.model, true);
  } catch (error) {
    if (!(error instanceof ExactImageSizeError)) throw error;
    codes.push("EXACT_RATIO_UNSUPPORTED");
  }
  if (source.parameterMap.apimartImages && !acceptsAPIMartRatio(source.parameterMap.apimartImages,ratio)
    // Follow-reference ratios outside the named list are delivered as native
    // 16-grid pixel sizes when the exact-size contract covers the model
    // (apib probed 2026-10-27), so only reject when no pixels can be sized.
    && !exactRatioPixels(ratio, supplierRouting ? publicModelId : source.model))
    codes.push("ADAPTER_RATIO_UNSUPPORTED");
  return codes;
}
