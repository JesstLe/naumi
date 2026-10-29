import "server-only";
import sharp from "sharp";
import { imagegenChromaSchema } from "./schema";
import { decodeImagegenPixels, type DecodedImagegenPixels } from "./pixels";
import type { ImagegenRequest } from "./types";
type RGB=[number,number,number];
const clamp=(v:number)=>Math.max(0,Math.min(255,Math.round(v)));
const median=(values:number[])=>{values.sort((a,b)=>a-b);const i=Math.floor(values.length/2);return values.length%2?values[i]:(values[i-1]+values[i])/2;};
// Numeric MinFilter, unlike Sharp's black-foreground binary morphological operations.
function contractMatte(input:Buffer,width:number,height:number,radius:number):Buffer{
  const horizontal=Buffer.alloc(input.length),result=Buffer.alloc(input.length),queue=new Int32Array(Math.max(width,height));
  const pass=(source:Buffer,destination:Buffer,lines:number,length:number,stride:number,offsetStride:number)=>{
    for(let line=0;line<lines;line++){
      const offset=line*offsetStride;let head=0,tail=0,right=-1;
      for(let position=0;position<length;position++){
        const limit=Math.min(length-1,position+radius);
        while(right<limit){right++;while(tail>head&&source[offset+queue[tail-1]*stride]>=source[offset+right*stride])tail--;queue[tail++]=right;}
        const left=Math.max(0,position-radius);while(queue[head]<left)head++;
        destination[offset+position*stride]=source[offset+queue[head]*stride];
      }
    }
  };
  pass(input,horizontal,height,width,1,width);pass(horizontal,result,width,height,width,1);return result;
}
function sampleKey(data:Buffer,width:number,height:number,mode:"corners"|"border"):RGB{
  const samples:number[][]=[[],[],[]],add=(x:number,y:number)=>{const i=(y*width+x)*4;for(let c=0;c<3;c++)samples[c].push(data[i+c]);};
  if(mode==="corners"){
    const patch=Math.max(1,Math.min(width,height,12));
    for(const [left,top] of [[0,0],[width-patch,0],[0,height-patch],[width-patch,height-patch]])for(let y=top;y<top+patch;y++)for(let x=left;x<left+patch;x++)add(x,y);
  }else{
    const band=Math.max(1,Math.min(width,height,6)),step=Math.max(1,Math.floor(Math.min(width,height)/256));
    for(let x=0;x<width;x+=step)for(let y=0;y<band;y++){add(x,y);add(x,height-1-y);}
    for(let y=0;y<height;y+=step)for(let x=0;x<band;x++){add(x,y);add(width-1-x,y);}
  }
  return samples.map(v=>clamp(median(v))) as RGB;
}
/** Apache-2.0 adaptation of remove_chroma_key.py; see vendor/imagegen/NOTICE.md. */
export async function removeChroma(bytes:Buffer,raw:NonNullable<ImagegenRequest["chroma"]>):Promise<Buffer>{
  const options=imagegenChromaSchema.parse(raw),decoded=await decodeImagegenPixels(bytes,"output");
  await applyChromaToPixels(decoded,options);
  return sharp(decoded.data,{raw:{width:decoded.info.width,height:decoded.info.height,channels:4}}).png().toBuffer();
}

/** Mutates exclusively owned, decoded sRGB RGBA; options must be schema-validated.
 * The byte API above remains available for callers that need a standalone PNG. */
export async function applyChromaToPixels({data,info}:DecodedImagegenPixels,options:NonNullable<ImagegenRequest["chroma"]>):Promise<void>{
  // Only edge processing needs the pre-key alpha ceiling. Capture it in the
  // existing matte pass instead of allocating and scanning every image twice.
  const originalAlpha=options.edgeContract||options.edgeFeather?Buffer.alloc(info.width*info.height):undefined;
  const key:RGB=options.autoKey==="none"?[parseInt(options.keyColor.slice(1,3),16),parseInt(options.keyColor.slice(3,5),16),parseInt(options.keyColor.slice(5,7),16)]:sampleKey(data,info.width,info.height,options.autoKey);
  const max=Math.max(...key),spill=max<128?[]:[0,1,2].filter(c=>key[c]>=max-16&&key[c]>=128),other=[0,1,2].filter(c=>!spill.includes(c));
  for(let i=0;i<data.length;i+=4){
    if(originalAlpha)originalAlpha[i/4]=data[i+3];
    const rgb=[data[i],data[i+1],data[i+2]],distance=Math.max(...rgb.map((v,c)=>Math.abs(v-key[c])));
    const strength=spill.length?Math.min(...spill.map(c=>rgb[c])):0,nonKey=Math.max(0,...other.map(c=>rgb[c])),dominance=strength-nonKey;
    const keyLike=distance<=32||!spill.length||dominance>=16;
    let matte=distance<=options.tolerance?0:255;
    if(options.softMatte&&keyLike){
      const ratio=Math.max(0,Math.min(1,(distance-options.transparentThreshold)/(options.opaqueThreshold-options.transparentThreshold)));
      const smooth=clamp(255*ratio*ratio*(3-2*ratio));
      const dominanceAlpha=spill.length&&dominance>0?clamp(255*(1-Math.min(1,dominance/Math.max(1,max-nonKey)))):255;
      matte=Math.min(smooth,dominanceAlpha);
    }
    let alpha=clamp(matte*data[i+3]/255);if(alpha>0&&alpha<=8)alpha=0;
    if(!alpha){data.fill(0,i,i+4);continue;}
    if(options.spillCleanup&&keyLike&&alpha<252)for(const c of spill)if(data[i+c]>Math.max(0,nonKey-1))data[i+c]=clamp(Math.max(0,nonKey-1));
    data[i+3]=alpha;
  }
  if(originalAlpha){
    let alpha=Buffer.alloc(info.width*info.height);for(let i=0;i<alpha.length;i++)alpha[i]=data[i*4+3];
    if(options.edgeContract)alpha=contractMatte(alpha,info.width,info.height,options.edgeContract);
    let layer=sharp(alpha,{raw:{width:info.width,height:info.height,channels:1}});
    if(options.edgeFeather)layer=layer.blur(Math.max(0.3,options.edgeFeather));
    const modified=await layer.toColourspace("b-w").raw().toBuffer({resolveWithObject:true});
    for(let i=0;i<alpha.length;i++){const value=Math.min(originalAlpha[i],modified.data[i*modified.info.channels]);data[i*4+3]=value;if(!value)data.fill(0,i*4,i*4+4);}
  }
}
