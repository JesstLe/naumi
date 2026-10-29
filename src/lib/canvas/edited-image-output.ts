import "server-only";
import sharp from "sharp";
import {frameRatio} from "../imagegen/frame-ratio";

/** Editing does not authorize a local geometry rewrite. Keep the supplier's
 * full frame and report its actual, orientation-normalized pixel dimensions. */
export async function canvasEditedImage(bytes: Buffer) {
  const output = await sharp(bytes).rotate().png().toBuffer({resolveWithObject:true});
  const {width,height} = output.info;
  return {bytes:output.data,width,height,ratio:frameRatio({width,height})!};
}
