import "server-only";
import sharp from "sharp";
import { IMAGEGEN_MAX_BYTES, IMAGEGEN_OUTPUT_MAX_BYTES, IMAGEGEN_MAX_PIXELS } from "./image-limits";
export { IMAGEGEN_MAX_BYTES, IMAGEGEN_MAX_PIXELS } from "./image-limits";
export async function decodeImagegenPixels(bytes:Buffer,purpose:"input"|"output"="input"){
  const maxBytes=purpose==="output"?IMAGEGEN_OUTPUT_MAX_BYTES:IMAGEGEN_MAX_BYTES;
  if(!bytes.length||bytes.length>maxBytes)throw new Error(`图片大小超出${maxBytes/1024/1024}MiB处理限制`);
  const meta=await sharp(bytes,{limitInputPixels:IMAGEGEN_MAX_PIXELS}).metadata();
  if(!["png","jpeg","webp"].includes(meta.format??"")||(meta.pages??1)>1)throw new Error("仅支持静态PNG、JPEG和WebP图片");
  if(!meta.width||!meta.height||meta.width*meta.height>IMAGEGEN_MAX_PIXELS)throw new Error("图片像素数超出处理限制");
  return sharp(bytes,{limitInputPixels:IMAGEGEN_MAX_PIXELS}).rotate().toColourspace("srgb").ensureAlpha().raw().toBuffer({resolveWithObject:true});
}
