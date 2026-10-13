import assert from "node:assert/strict";
import sharp from "sharp";
import {preserveMaskedOutside} from "../src/lib/imagegen/mask";
async function main(){
 const target=await sharp({create:{width:64,height:64,channels:4,background:{r:220,g:35,b:20,alpha:1}}}).png().toBuffer();
 const edited=await sharp({create:{width:128,height:128,channels:4,background:{r:30,g:80,b:210,alpha:0.5}}}).png().toBuffer();
 const pixels=Buffer.alloc(64*64*4,255);for(let y=16;y<48;y++)for(let x=16;x<48;x++)pixels[(y*64+x)*4+3]=0;
 const mask=await sharp(pixels,{raw:{width:64,height:64,channels:4}}).png().toBuffer();
 const output=await sharp(await preserveMaskedOutside(target,mask,edited)).raw().toBuffer();
 const pixel=(x:number,y:number)=>[...output.subarray((y*128+x)*4,(y*128+x)*4+4)];
 assert.deepEqual(pixel(10,10),[220,35,20,255]);assert.deepEqual(pixel(50,50),[125,58,115,255]);
 const replace=await sharp(await preserveMaskedOutside(target,mask,edited,true)).raw().toBuffer();assert.equal(replace[(50*128+50)*4+3],128);
 const wide=await sharp({create:{width:128,height:64,channels:4,background:"blue"}}).png().toBuffer();await assert.rejects(()=>preserveMaskedOutside(target,mask,wide),/画面比例/);
 pixels[(20*64+20)*4+3]=128;const soft=await sharp(pixels,{raw:{width:64,height:64,channels:4}}).png().toBuffer();const blend=await sharp(await preserveMaskedOutside(target,soft,edited)).raw().toBuffer();assert.equal(blend[(40*128+40)*4+3],255);assert.ok(blend[(40*128+40)*4]>125&&blend[(40*128+40)*4]<220);
 console.log("PASS masked final output: exact exterior RGBA, partial-alpha source-over, explicit transparent replacement, soft mask and aspect rejection");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
