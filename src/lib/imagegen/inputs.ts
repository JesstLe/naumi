import "server-only";
import {listArtworksByIds} from "../db";
import {readCanvasImage} from "../canvas-image-input";
import {decodeImagegenPixels} from "./pixels";
import {readImagegenInputAsset} from "./input-assets";
import type {ImagegenRequest} from "./types";
export async function readImagegenInputs(request:ImagegenRequest,owner:string){
 const ids=Array.from(new Set(request.inputs.filter(i=>!i.artworkId.startsWith("asset-")).map(i=>i.artworkId)));
 const works=await listArtworksByIds(owner,ids);
 const inputs=[];let total=0,totalPixels=0;
 for(const i of request.inputs){
  const work=works.find(w=>w.id===i.artworkId);if(!i.artworkId.startsWith("asset-")&&(!work?.image||work.videoUrl))throw new Error("素材不存在或无权访问");
  const source=i.artworkId.startsWith("asset-")?await readImagegenInputAsset(i.artworkId,owner):await readCanvasImage(work!.image!,"http://internal",owner);total+=source.buffer.length;if(total>64*1024*1024)throw new Error("素材合计超过64MiB，请减少素材或缩小原图");
  const decoded=await decodeImagegenPixels(source.buffer);totalPixels+=decoded.info.width*decoded.info.height;if(totalPixels>80_000_000)throw new Error("素材合计超过80MP，请减少素材或缩小原图");let transparent=0;
  if(i.role==="mask")for(let n=3;n<decoded.data.length;n+=4)if(decoded.data[n]<255)transparent++;
  inputs.push({...i,...source,width:decoded.info.width,height:decoded.info.height,transparent});
 }
 const target=inputs.find(i=>i.role==="edit-target"),mask=inputs.find(i=>i.role==="mask");
 if(mask){
  if(!target||inputs[0]!==target)throw new Error("蒙版对应的编辑目标必须放在第一张");
  if(mask.width!==target.width||mask.height!==target.height)throw new Error("蒙版尺寸必须与编辑目标一致");
  const transparent=mask.transparent;
  if(!transparent||transparent===mask.width*mask.height)throw new Error("蒙版需同时包含重绘区域和保留区域");
 }
 return inputs.map(({transparent,...input})=>input);
}
