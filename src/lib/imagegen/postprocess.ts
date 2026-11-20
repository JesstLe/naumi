import "server-only";
import sharp from "sharp";
import { imagegenChromaSchema, imagegenOutputSchema } from "./schema";
import { decodeImagegenPixels, inspectDecodedImagegenPixels } from "./pixels";
import { applyChromaToPixels } from "./chroma";
import type { ImagegenRequest } from "./types";
export {hasTransparentSubject} from "./pixels";
export async function inspectImagegenPixels(bytes:Buffer){
  return inspectDecodedImagegenPixels(await decodeImagegenPixels(bytes,"output"));
}
export async function processImagegenPixels(bytes:Buffer,request:Pick<ImagegenRequest,"output"|"chroma">){
  const output=imagegenOutputSchema.parse(request.output),decoded=await decodeImagegenPixels(bytes,"output");
  // decodeImagegenPixels owns this normalized buffer; no caller or Sharp clone
  // shares a writable pixel surface. Chroma and initial inspection reuse it.
  if(request.chroma)await applyChromaToPixels(decoded,imagegenChromaSchema.parse(request.chroma));
  const initial=inspectDecodedImagegenPixels(decoded);
  if(!initial.visiblePixels)throw new Error("处理结果全部透明，请保留原图并调整参数");
  if(output.background==="transparent"&&!initial.transparentPixels)throw new Error("实际输出没有透明像素，不能标记透明成功");
  const raw={width:decoded.info.width,height:decoded.info.height,channels:4 as const};
  const shrinking=output.downscaleMaxDim!==undefined&&Math.max(raw.width,raw.height)>output.downscaleMaxDim;
  // A memory-backed libvips resize is not a sequential PNG decode: measured
  // large-image RSS regresses with the all-raw path. Keep a lossless, sequential
  // source only for real shrinking; do not decode it again just to inspect alpha.
  let image=shrinking?sharp(await sharp(decoded.data,{raw}).png().toBuffer()):sharp(decoded.data,{raw});
  if(output.downscaleMaxDim)image=image.resize(output.downscaleMaxDim,output.downscaleMaxDim,{fit:"inside",withoutEnlargement:true});
  const compression=output.compression;
  if(output.format==="jpeg"){
    if(output.background==="transparent")throw new Error("JPEG不能保存透明背景，请选择PNG或WebP");
    if(initial.transparentPixels&&!output.flattenColor)throw new Error("透明图转JPEG需明确背景色");
    if(output.flattenColor)image=image.flatten({background:output.flattenColor});
    image=image.jpeg({quality:compression===undefined?85:Math.max(1,100-compression)});
  }else if(output.format==="webp")image=image.webp({lossless:compression===0,quality:compression===undefined?85:Math.max(1,100-compression)});
  else image=image.png({compressionLevel:compression===undefined?6:Math.round(compression*9/100)});
  // Inspect the actual encoded result, not a pre-resize/pre-codec estimate:
  // downscaling and lossy codecs can erase visible or transparent pixels.
  const result=await image.toBuffer(),actual=await inspectImagegenPixels(result);
  if(!actual.visiblePixels)throw new Error("处理结果全部透明，请保留原图并调整参数");
  if(output.background==="transparent"&&!actual.transparentPixels)throw new Error("输出转换丢失透明像素，请保留底图");
  return {bytes:result,mime:output.format==="jpeg"?"image/jpeg":`image/${output.format}`,...actual};
}
