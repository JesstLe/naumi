import "server-only";
import sharp from "sharp";
import {decodeImagegenPixels} from "./pixels";

/** Native edits may redraw the exterior. Retain it from the owned target, never from model output. */
export async function preserveMaskedOutside(target:Buffer,mask:Buffer,generated:Buffer,replaceTransparency=false){
 const [original,selection,output]=await Promise.all([decodeImagegenPixels(target),decodeImagegenPixels(mask),decodeImagegenPixels(generated,"output")]);
 if(original.info.width!==selection.info.width||original.info.height!==selection.info.height)throw new Error("蒙版尺寸必须与编辑目标一致");
 if(Math.abs(output.info.width/output.info.height-original.info.width/original.info.height)>0.01)throw new Error("模型改变了蒙版编辑的画面比例；原生成版本已保留，不能错位合成");
 const size={width:output.info.width,height:output.info.height};
 const base=await sharp(original.data,{raw:{width:original.info.width,height:original.info.height,channels:4}}).resize(size.width,size.height,{fit:"fill"}).raw().toBuffer();
 const matte=await sharp(selection.data,{raw:{width:selection.info.width,height:selection.info.height,channels:4}}).resize(size.width,size.height,{fit:"fill",kernel:"nearest"}).raw().toBuffer();
 const data=Buffer.from(base);
 for(let i=0;i<data.length;i+=4){
  if(matte[i+3]===255)continue;
  const keep=matte[i+3]/255,oldAlpha=base[i+3]/255,newAlpha=output.data[i+3]/255*(1-keep);
  const retained=oldAlpha*(replaceTransparency?keep:1-newAlpha),alpha=retained+newAlpha;
  for(let channel=0;channel<3;channel++)data[i+channel]=alpha?Math.round((base[i+channel]*retained+output.data[i+channel]*newAlpha)/alpha):0;
  data[i+3]=Math.round(alpha*255);
 }
 return sharp(data,{raw:{...size,channels:4}}).png().toBuffer();
}
