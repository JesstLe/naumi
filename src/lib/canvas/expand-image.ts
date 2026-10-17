import "server-only";
import sharp from "sharp";

export class ExpandInputError extends Error {}

/** Bound geometry before any billing or supplier request. Never create zero-size images. */
export function expansionGeometry(width: number, height: number, ratioW: number, ratioH: number, max = 4096) {
  if (![width, height, ratioW, ratioH].every(value => Number.isFinite(value) && value > 0)) throw new ExpandInputError("图片尺寸或目标比例无效");
  const ratio = ratioW / ratioH;
  if (!Number.isFinite(ratio) || ratio <= 0) throw new ExpandInputError("目标比例无效");
  if (Math.abs(width / height - ratio) / ratio < 0.02) throw new ExpandInputError("当前图片已是该比例，无需扩图");
  const outerWidth = Math.max(width, height * ratio), outerHeight = Math.max(height, width / ratio);
  const scale = Math.min(1, max / Math.max(outerWidth, outerHeight));
  const targetW = Math.round(outerWidth * scale), targetH = Math.round(outerHeight * scale);
  const sourceW = Math.max(1, Math.min(targetW, Math.round(width * scale))), sourceH = Math.max(1, Math.min(targetH, Math.round(height * scale)));
  if (![targetW, targetH, sourceW, sourceH].every(Number.isSafeInteger) || Math.min(targetW, targetH) < 64) throw new ExpandInputError("目标画幅过窄，请选择其他比例");
  return { targetW, targetH, sourceW, sourceH };
}

/** Map the generated background without cropping, then restore the original region
 * byte-for-byte. Any size adaptation applies only to newly generated surroundings. */
export async function composeExpandedImage(edited: Buffer, original: Buffer, width: number, height: number, x: number, y: number) {
  const background = await sharp(edited).rotate().resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const source=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(x<0||y<0||x+source.info.width>width||y+source.info.height>height)throw new Error("EXPAND_SOURCE_BOUNDS");
  for(let row=0;row<height;row++)for(let col=0;col<width;col++)if((col<x||col>=x+source.info.width||row<y||row>=y+source.info.height)&&background.data[(row*width+col)*4+3]!==255)throw new Error("EXPAND_OUTPUT_INCOMPLETE");
  for(let row=0;row<source.info.height;row++)source.data.copy(background.data,((row+y)*width+x)*4,row*source.info.width*4,(row+1)*source.info.width*4);
  return sharp(background.data, {raw:background.info}).png().toBuffer();
}
