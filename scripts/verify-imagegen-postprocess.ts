import assert from "node:assert/strict";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { imagegenChromaSchema } from "../src/lib/imagegen/schema";
import { inspectImagegenPixels,processImagegenPixels } from "../src/lib/imagegen/postprocess";
import {localEditSchema} from "../src/lib/canvas-local-image-edit";
import {transformImage} from "../src/lib/media-postprocess";
async function main(){
 assert.equal(localEditSchema.safeParse({mode:"process",id:"owned",operationId:"1472c152-3faa-4f06-a047-815e3f34848f",output:{format:"webp"}}).success,true,"Local immutable versions accept shared output controls");
 const raw=Buffer.alloc(16*16*4);
 const translucent=await sharp({create:{width:64,height:64,channels:4,background:{r:50,g:140,b:230,alpha:0.5}}}).png().toBuffer();
 const visible=await processImagegenPixels(translucent,{output:{format:"png",background:"transparent"}});assert.equal(visible.transparentPixels,4096,"Visible semi-transparent overlays are valid");
 const sparse=Buffer.alloc(2048*2048*4);sparse[(1024*2048+1024)*4+3]=255;const sparsePng=await sharp(sparse,{raw:{width:2048,height:2048,channels:4}}).png().toBuffer();await assert.rejects(()=>processImagegenPixels(sparsePng,{output:{format:"png",downscaleMaxDim:64}}),/全部透明/,"Check encoded final pixels after resize");
 for(let y=0;y<16;y++)for(let x=0;x<16;x++){const i=(y*16+x)*4;raw[i]=x>=5&&x<11&&y>=5&&y<11?255:0;raw[i+1]=raw[i]?0:255;raw[i+2]=0;raw[i+3]=255;}
 const png=await sharp(raw,{raw:{width:16,height:16,channels:4}}).png().toBuffer(),sha=createHash("sha256").update(png).digest("hex");
 assert.equal((await inspectImagegenPixels(png)).transparentPixels,0,"An alpha channel with all255 is opaque");
 for(const autoKey of ["none","corners","border"] as const){
  const result=await processImagegenPixels(png,{output:{format:"png",background:"transparent"},chroma:imagegenChromaSchema.parse({autoKey})});
  assert.equal(result.transparentPixels,220);assert.equal(result.totalPixels,256);
  const pixels=await sharp(result.bytes).ensureAlpha().raw().toBuffer();assert.equal(pixels[(8*16+8)*4],255);
 }
 assert.equal(createHash("sha256").update(png).digest("hex"),sha,"Original bytes are immutable");
 const legacy=await transformImage(png,{enabled:true,kind:"resize",processor:"sharp-lanczos3",width:64,height:64,failure:"keep-base"});assert.equal(legacy.width,64);assert.equal(legacy.height,64);assert.equal(legacy.kind,"resize");
 const transparent=await processImagegenPixels(png,{output:{format:"webp",compression:0},chroma:imagegenChromaSchema.parse({})});
 assert.equal(transparent.mime,"image/webp");assert.ok(transparent.transparentPixels>0);
 await assert.rejects(()=>processImagegenPixels(transparent.bytes,{output:{format:"jpeg"}}),/背景色|透明/);
 const flattened=await processImagegenPixels(transparent.bytes,{output:{format:"jpeg",flattenColor:"#ffffff"}});assert.equal(flattened.transparentPixels,0);assert.equal(flattened.mime,"image/jpeg");
 const large=await sharp(png).resize(256,256).png().toBuffer();
 const small=await processImagegenPixels(large,{output:{format:"png",downscaleMaxDim:64}});assert.equal(small.width,64);
 const noEnlarge=await processImagegenPixels(png,{output:{format:"png",downscaleMaxDim:100}});assert.equal(noEnlarge.width,16);
 const contracted=await processImagegenPixels(png,{output:{format:"png"},chroma:imagegenChromaSchema.parse({edgeContract:1})});assert.ok(contracted.transparentPixels>220);
 const feathered=await processImagegenPixels(png,{output:{format:"png"},chroma:imagegenChromaSchema.parse({edgeFeather:1})});const featherPixels=await sharp(feathered.bytes).ensureAlpha().raw().toBuffer();assert.ok(featherPixels.some((v,i)=>i%4===3&&v>0&&v<255));
 const green=await sharp({create:{width:4,height:4,channels:4,background:"#00ff00"}}).png().toBuffer();await assert.rejects(()=>processImagegenPixels(green,{output:{format:"png"},chroma:imagegenChromaSchema.parse({})}),/全部透明/);
 await assert.rejects(()=>processImagegenPixels(Buffer.from("fake png"),{output:{format:"png"}}));
 await assert.rejects(()=>processImagegenPixels(Buffer.alloc(12*1024*1024+1),{output:{format:"png"}}),/大小/);
 assert.equal(imagegenChromaSchema.safeParse({transparentThreshold:96,opaqueThreshold:12}).success,false);
 const softInput=await sharp(Buffer.from([80,200,80,128,255,0,0,255]),{raw:{width:2,height:1,channels:4}}).png().toBuffer();
 const soft=await processImagegenPixels(softInput,{output:{format:"png"},chroma:imagegenChromaSchema.parse({softMatte:true,spillCleanup:true})});
 const softRaw=await sharp(soft.bytes).ensureAlpha().raw().toBuffer();assert.ok(softRaw[3]>0&&softRaw[3]<128);assert.ok(softRaw[1]<200);assert.equal(softRaw[4],255);assert.equal(softRaw[7],255);
 console.log("PASS imagegen pixels: real alpha, chroma, immutable source, formats, resize and resource validation");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
