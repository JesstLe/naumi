import "server-only";
import sharp from "sharp";
export const IMAGEGEN_MAX_BYTES=12*1024*1024,IMAGEGEN_MAX_PIXELS=40_000_000;
export async function decodeImagegenPixels(bytes:Buffer){
  if(!bytes.length||bytes.length>IMAGEGEN_MAX_BYTES)throw new Error("图片大小超出12MiB处理限制");
  const meta=await sharp(bytes,{limitInputPixels:IMAGEGEN_MAX_PIXELS}).metadata();
  if(!["png","jpeg","webp"].includes(meta.format??"")||(meta.pages??1)>1)throw new Error("仅支持静态PNG、JPEG和WebP图片");
  if(!meta.width||!meta.height||meta.width*meta.height>IMAGEGEN_MAX_PIXELS)throw new Error("图片像素数超出处理限制");
  return sharp(bytes,{limitInputPixels:IMAGEGEN_MAX_PIXELS}).rotate().toColourspace("srgb").ensureAlpha().raw().toBuffer({resolveWithObject:true});
}
