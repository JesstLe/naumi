import "server-only";
import sharp from "sharp";
import { imagegenOutputSchema } from "./schema";
import { decodeImagegenPixels } from "./pixels";
import { removeChroma } from "./chroma";
import type { ImagegenRequest } from "./types";
export async function inspectImagegenPixels(bytes:Buffer){
  const {data,info}=await decodeImagegenPixels(bytes);let transparentPixels=0,fullyTransparentPixels=0;
  for(let i=3;i<data.length;i+=4){if(data[i]<255)transparentPixels++;if(data[i]===0)fullyTransparentPixels++;}
  return {width:info.width,height:info.height,transparentPixels,fullyTransparentPixels,visiblePixels:info.width*info.height-fullyTransparentPixels,totalPixels:info.width*info.height};
}
export async function processImagegenPixels(bytes:Buffer,request:Pick<ImagegenRequest,"output"|"chroma">){
  const output=imagegenOutputSchema.parse(request.output),decoded=await decodeImagegenPixels(bytes);
  const base=request.chroma?await removeChroma(bytes,request.chroma):await sharp(decoded.data,{raw:{width:decoded.info.width,height:decoded.info.height,channels:4}}).png().toBuffer();
  const initial=await inspectImagegenPixels(base);
  if(!initial.visiblePixels)throw new Error("处理结果全部透明，请保留原图并调整参数");
  if(output.background==="transparent"&&!initial.transparentPixels)throw new Error("实际输出没有透明像素，不能标记透明成功");
  let image=sharp(base);
  if(output.downscaleMaxDim)image=image.resize(output.downscaleMaxDim,output.downscaleMaxDim,{fit:"inside",withoutEnlargement:true});
  const compression=output.compression;
  if(output.format==="jpeg"){
    if(output.background==="transparent")throw new Error("JPEG不能保存透明背景，请选择PNG或WebP");
    if(initial.transparentPixels&&!output.flattenColor)throw new Error("透明图转JPEG需明确背景色");
    if(output.flattenColor)image=image.flatten({background:output.flattenColor});
    image=image.jpeg({quality:compression===undefined?85:Math.max(1,100-compression)});
  }else if(output.format==="webp")image=image.webp({lossless:compression===0,quality:compression===undefined?85:Math.max(1,100-compression)});
  else image=image.png({compressionLevel:compression===undefined?6:Math.round(compression*9/100)});
  const result=await image.toBuffer(),actual=await inspectImagegenPixels(result);
  if(!actual.visiblePixels)throw new Error("处理结果全部透明，请保留原图并调整参数");
  if(output.background==="transparent"&&!actual.transparentPixels)throw new Error("输出转换丢失透明像素，请保留底图");
  return {bytes:result,mime:output.format==="jpeg"?"image/jpeg":`image/${output.format}`,...actual};
}
