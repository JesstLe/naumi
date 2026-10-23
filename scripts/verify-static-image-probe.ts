import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {ModelConfigError} from "../src/lib/model-config/types";
import {probeStaticImage} from "../src/lib/video/static-image-probe";
import {inspectedMediaMime} from "../src/lib/video/media-formats";
import {ORIGINAL_IMAGE_MAX_BYTES,ORIGINAL_IMAGE_MAX_PIXELS} from "../src/lib/image-upload-policy";

/** Real native decodes of locally generated synthetic bytes; no media service,
 * database, network, supplier call or original-media transformation. */
const width=17,height=11;
const raw=Buffer.from(Array.from({length:width*height*3},(_,index)=>(index*37+Math.floor(index/17))%256));
const input=()=>sharp(raw,{raw:{width,height,channels:3}});
const hash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
let assertions=0;
function equal(actual:unknown,expected:unknown,message:string){assert.deepEqual(actual,expected,message);assertions++;}
async function invalid(bytes:Uint8Array,mime:string,message:string){
  await assert.rejects(()=>probeStaticImage(bytes,mime),error=>error instanceof ModelConfigError&&error.code==="INVALID_MEDIA_STREAM"&&error.status===422,message);assertions++;
}
function crc32(bytes:Uint8Array){
  let value=0xffffffff;
  for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}
  return (value^0xffffffff)>>>0;
}
function pngChunk(kind:string,data:Buffer){
  const chunk=Buffer.alloc(data.length+12);chunk.writeUInt32BE(data.length);chunk.write(kind,4,"ascii");data.copy(chunk,8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4,-4)),chunk.length-4);return chunk;
}
async function main(){
  const samples=[
    {format:"png",mime:"image/png",bytes:await input().png().toBuffer()},
    {format:"jpeg",mime:"image/jpeg",bytes:await input().jpeg({quality:90}).toBuffer()},
    {format:"webp",mime:"image/webp",bytes:await input().webp({lossless:true}).toBuffer()},
    {format:"avif",mime:"image/avif",bytes:await input().avif({quality:60,effort:0}).toBuffer()},
  ];
  for(const sample of samples){
    const before=hash(sample.bytes),probe=await probeStaticImage(sample.bytes,sample.mime);
    assert(probe,`${sample.format}: real static image must be inspected`);assertions++;
    equal({width:probe.width,height:probe.height,duration:probe.durationSeconds,audio:probe.audioCodecs,frameRate:probe.frameRate},
      {width,height,duration:0,audio:[],frameRate:null},`${sample.format}: raw pixel dimensions and static stream facts`);
    equal(inspectedMediaMime(probe,"image",sample.mime),sample.mime,`${sample.format}: downstream format mapping accepts the real probe`);
    equal(hash(sample.bytes),before,`${sample.format}: inspection preserves the original bytes`);
    const carrier=Buffer.concat([Buffer.from("unrelated-prefix"),sample.bytes,Buffer.from("unrelated-suffix")]);
    const view=carrier.subarray(16,16+sample.bytes.length);
    equal(await probeStaticImage(view,sample.mime),probe,`${sample.format}: offset Uint8Array views are decoded without unrelated bytes`);
    await invalid(sample.bytes,sample.mime==="image/png"?"image/jpeg":"image/png",`${sample.format}: false MIME must not be accepted`);
    await invalid(sample.bytes.subarray(0,Math.floor(sample.bytes.length/2)),sample.mime,`${sample.format}: truncated bytes cannot receive a verified probe`);
  }
  const oriented=await input().withMetadata({orientation:6}).jpeg().toBuffer(),originalHash=hash(oriented);
  equal((await sharp(oriented).metadata()).orientation,6,"Fixture really contains EXIF orientation");
  const orientedProbe=await probeStaticImage(oriented,"image/jpeg");assert(orientedProbe);assertions++;
  equal({width:orientedProbe.width,height:orientedProbe.height},{width,height},"Inspection does not auto-rotate EXIF pixels");
  equal(hash(oriented),originalHash,"EXIF-oriented original remains byte-identical");

  // Two actual frames with different pixels ensure native encoders retain animation.
  const stacked=Buffer.concat([raw,raw.map(value=>255-value)]);
  const frames=()=>sharp(stacked,{raw:{width,height:height*2,channels:3,pageHeight:height}});
  const animatedWebp=await frames().webp({lossless:true,loop:0,delay:[100,100]}).toBuffer();
  equal((await sharp(animatedWebp,{animated:true}).metadata()).pages,2,"Fixture is an actual two-frame WebP");
  equal(await probeStaticImage(animatedWebp,"image/webp"),null,"Animated WebP remains on the isolated media path");
  const animatedGif=await frames().gif({loop:0,delay:[100,100]}).toBuffer();
  equal((await sharp(animatedGif,{animated:true}).metadata()).pages,2,"Fixture is an actual two-frame GIF");
  equal(await probeStaticImage(animatedGif,"image/gif"),null,"GIF is delegated to the existing isolated decoder");
  const tiff=await input().tiff().toBuffer();
  equal(await probeStaticImage(tiff,"image/tiff"),null,"Other correctly declared image formats retain isolated inspection");
  const png=samples[0].bytes;
  const animationControl=Buffer.alloc(8);animationControl.writeUInt32BE(2,0);
  const flaggedAPNG=Buffer.concat([png.subarray(0,33),pngChunk("acTL",animationControl),png.subarray(33)]);
  equal(await probeStaticImage(flaggedAPNG,"image/png"),null,"APNG animation control cannot be treated as a static PNG");

  // Corrupt compressed pixel data while preserving container chunk lengths/CRC:
  // metadata alone is not sufficient evidence of a fully decodable image.
  const corrupt=Buffer.from(png);
  for(let offset=8;offset+12<=corrupt.length;){
    const length=corrupt.readUInt32BE(offset),kind=corrupt.toString("ascii",offset+4,offset+8);
    if(kind==="IDAT"){
      assert(length>4);assertions++;corrupt[offset+8+Math.floor(length/2)]^=0xff;
      corrupt.writeUInt32BE(crc32(corrupt.subarray(offset+4,offset+8+length)),offset+8+length);break;
    }
    offset+=12+length;
  }
  await invalid(corrupt,"image/png","Broken compressed pixels are rejected even with a valid PNG chunk checksum");
  const excessivePixels=Buffer.from(png);
  excessivePixels.writeUInt32BE(1,16);excessivePixels.writeUInt32BE(ORIGINAL_IMAGE_MAX_PIXELS+1,20);
  excessivePixels.writeUInt32BE(crc32(excessivePixels.subarray(12,29)),29);
  await invalid(excessivePixels,"image/png","A compressed 1x64000001 pixel header cannot bypass the pixel budget");
  const excessiveBytes=Buffer.alloc(ORIGINAL_IMAGE_MAX_BYTES+1);png.copy(excessiveBytes);
  await invalid(excessiveBytes,"image/png","Oversized bytes are rejected before native decode");
  excessiveBytes.fill(0);animatedGif.copy(excessiveBytes);
  equal(await probeStaticImage(excessiveBytes,"image/gif"),null,"Unsupported formats retain their isolated decoder's existing byte policy");
  excessiveBytes.fill(0);flaggedAPNG.copy(excessiveBytes);
  equal(await probeStaticImage(excessiveBytes,"image/png"),null,"Animation delegation does not inherit the new static-only byte budget");
  await invalid(Buffer.alloc(0),"image/png","Empty image input is rejected");
  await invalid(Buffer.from("not image data"),"image/png","A supported MIME label cannot replace real image bytes");
  process.stdout.write(`STATIC_IMAGE_PROBE=PASS formats=4 assertions=${assertions} real_native_decode=true http_calls=0 paid_calls=0\n`);
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
