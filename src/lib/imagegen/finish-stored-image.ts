import "server-only";
import sharp from "sharp";
import { preserveGeneratedFrame } from "./output-shape";
import { resolutionLongSide } from "../mock-data";
import { transformImage } from "../media-postprocess";
import type { Postprocess } from "../model-config/business-schema";

/** Local pixel transform shared by normal delivery and recovery. The delivery
 * owner runs configured postprocess through its durable stage; the optional
 * pure post branch remains for offline original-byte comparison tools. */
export async function finishStoredImage(bytes:Buffer, input:{final:boolean;post?:Postprocess;preset:boolean;imageParameterPlanVersion?:1;resolution?:string;targetWidth?:number;targetHeight?:number;transparent?:boolean}) {
 if(input.final)return bytes;
 if(input.post?.enabled)return (await transformImage(bytes,input.post)).bytes;
 if((input.targetWidth||0)>0&&(input.targetHeight||0)>0)return preserveGeneratedFrame(bytes,{targetWidth:input.targetWidth!,targetHeight:input.targetHeight!,transparent:input.transparent});
 // New mapped contracts deliver their actual supplier output. Explicit frame
 // shaping and configured postprocess above still apply; old tasks keep resize.
 const target=input.preset||input.imageParameterPlanVersion===1?0:resolutionLongSide(input.resolution||"");
 if(!target)return bytes;
 const meta=await sharp(bytes).metadata(),width=meta.orientation&&meta.orientation>=5?meta.height:meta.width,height=meta.orientation&&meta.orientation>=5?meta.width:meta.height;
 if(!width||!height)throw Error("原结果缺少有效尺寸");
 const side=Math.max(width,height);if(side>=target)return bytes;
 return sharp(bytes).rotate().resize({width:Math.round(width*target/side),height:Math.round(height*target/side),fit:"fill",kernel:"lanczos3"}).png().toBuffer();
}
