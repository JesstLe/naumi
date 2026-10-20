import type { ImagegenPlan } from "./types";

/** Never present an unfinished conversion/mask/cutout workflow as a finished image. */
export function plainGeneratedOutput(plan?: ImagegenPlan): boolean {
  const request=plan?.request,output=request?.output;
  return !!request&&plan!.steps.length===1&&["generate","edit"].includes(plan!.steps[0].operation)&&
    !request.chroma&&!request.inputs.some(input=>input.role==="mask")&&(!output?.format||output.format==="png")&&
    output?.compression===undefined&&!output?.downscaleMaxDim&&!output?.flattenColor;
}
