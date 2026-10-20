import { exactImageRequestSize, ExactImageSizeError } from "./request-size";

type RouteSource = {
  model: string;
  parameterMap: { apimartImages?: { ratios: readonly string[] } };
};

/** New requests only. Mirrors the pre-SDK family wire-size gate and the
 * adapter's explicit ratio contract BEFORE quoting/freezing/creating a job.
 * Frozen accepted jobs are deliberately not reinterpreted here. */
export function imageRequestAdmission(
  ratio: string,
  publicModelId: string,
  supplierRouting: boolean,
  source: RouteSource,
): string[] {
  const codes: string[] = [];
  try {
    exactImageRequestSize(ratio, supplierRouting ? publicModelId : source.model);
  } catch (error) {
    if (!(error instanceof ExactImageSizeError)) throw error;
    codes.push("EXACT_RATIO_UNSUPPORTED");
  }
  if (source.parameterMap.apimartImages && !source.parameterMap.apimartImages.ratios.includes(ratio))
    codes.push("ADAPTER_RATIO_UNSUPPORTED");
  return codes;
}
