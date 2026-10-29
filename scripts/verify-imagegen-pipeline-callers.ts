import assert from "node:assert/strict";
import sharp from "sharp";
import { transformImage } from "../src/lib/media-postprocess";
import { processImagegenPixels, inspectImagegenPixels } from "../src/lib/imagegen/postprocess";
import { preserveMaskedOutside } from "../src/lib/imagegen/mask";
import { imagegenChromaSchema } from "../src/lib/imagegen/schema";
import { localEditSchema } from "../src/lib/canvas-local-image-edit";

async function main(){
  // Run with the clean-environment evidence runner; this exercises pure callers,
  // not fake DB/auth/storage hooks or live saveCanvasLocalEdit persistence.
  const original=await sharp({create:{width:96,height:64,channels:4,background:"#c82814"}}).png().toBuffer();
  const selection=Buffer.alloc(96*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<48;x++)selection[(y*96+x)*4+3]=255;
  const mask=await sharp(selection,{raw:{width:96,height:64,channels:4}}).png().toBuffer();
  const generated=await sharp({create:{width:96,height:64,channels:4,background:{r:20,g:40,b:200,alpha:0.5}}}).png().toBuffer();
  const before=[original,mask,generated].map(b=>Buffer.from(b));
  for(const replaceTransparency of [false,true]){
    const preserved=await preserveMaskedOutside(original,mask,generated,replaceTransparency);
    const pixels=await sharp(preserved).ensureAlpha().raw().toBuffer();
    for(let y=0;y<64;y++)for(let x=0;x<48;x++)assert.deepEqual([...pixels.subarray((y*96+x)*4,(y*96+x)*4+4)],[200,40,20,255]);
    const request={output:{format:"png" as const}};
    const direct=await processImagegenPixels(preserved,request);
    const throughMedia=await transformImage(preserved,{enabled:true,kind:"imagegen",...request,failure:"keep-base"});
    assert.deepEqual(throughMedia,{...direct,kind:"imagegen"});
    assert.deepEqual(await inspectImagegenPixels(throughMedia.bytes),await inspectImagegenPixels(preserved));
  }
  for(const [i,b] of [original,mask,generated].entries())assert.deepEqual(b,before[i]);
  const green=await sharp({create:{width:96,height:64,channels:4,background:"#00ff00"}}).png().toBuffer();
  await assert.rejects(()=>transformImage(green,{enabled:true,kind:"imagegen",output:{format:"png"},chroma:imagegenChromaSchema.parse({}),failure:"keep-base"}),/全部透明/);
  const local=localEditSchema.parse({mode:"process",id:"owned",operationId:"1472c152-3faa-4f06-a047-815e3f34848f",output:{format:"webp",compression:0,background:"transparent"}});
  assert.equal(local.mode,"process");
  if(local.mode!=="process")throw Error("Expected process contract");
  const localResult=await processImagegenPixels(generated,local);
  assert.equal(localResult.mime,"image/webp");assert.equal(localResult.transparentPixels,96*64);
  const legacy=await transformImage(original,{enabled:true,kind:"resize",processor:"sharp-lanczos3",width:64,height:64,failure:"keep-base"});
  assert.equal(legacy.width,64);assert.equal(legacy.height,64);assert.equal(legacy.kind,"resize");
  console.log("CALLERS=PASS real transformImage(imagegen/resize), localEditSchema, mask-to-postprocess, original-alpha and immutable buffers; DB/HTTP/storage not exercised");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
