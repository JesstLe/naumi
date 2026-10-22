import "server-only";
import sharp,{type OutputInfo} from "sharp";
import {Writable} from "node:stream";
import {pipeline} from "node:stream/promises";
import {ORIGINAL_IMAGE_MAX_BYTES,ORIGINAL_IMAGE_MAX_PIXELS} from "../image-upload-policy";
import {ModelConfigError} from "../model-config/types";
import type {MediaProbe} from "./media-job-schema";

type ImageFormat="png"|"jpeg"|"webp"|"avif";
const FORMATS:Record<ImageFormat,{mime:string;codec:string;format:string}>={
  png:{mime:"image/png",codec:"png",format:"png_pipe"},jpeg:{mime:"image/jpeg",codec:"mjpeg",format:"jpeg_pipe"},
  webp:{mime:"image/webp",codec:"webp",format:"webp_pipe"},avif:{mime:"image/avif",codec:"av1",format:"avif"},
};
function invalid(message="图片字节无法完整解码或超过输入预算"):never{throw new ModelConfigError("INVALID_MEDIA_STREAM",message,422);}
function avifBrands(bytes:Buffer):string[]{
  let offset=0;
  while(offset+8<=bytes.length&&offset<65536){
    const length=bytes.readUInt32BE(offset),kind=bytes.toString("ascii",offset+4,offset+8);
    if(length<8||offset+length>bytes.length)return [];
    if(kind==="ftyp"){
      if(length<16)return [];
      const brands=[bytes.toString("ascii",offset+8,offset+12)];
      for(let i=offset+16;i+4<=offset+length;i+=4)brands.push(bytes.toString("ascii",i,i+4));
      return brands;
    }
    offset+=length;
  }
  return [];
}
function container(bytes:Buffer):ImageFormat|null{
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "png";
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "jpeg";
  if(bytes.length>=12&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP")return "webp";
  const brands=avifBrands(bytes);return brands.includes("avif")||brands.includes("avis")?"avif":null;
}
function animatedContainer(bytes:Buffer,format:ImageFormat){
  if(format==="avif")return avifBrands(bytes).includes("avis");
  let offset=format==="png"?8:format==="webp"?12:bytes.length;
  while(offset+8<=bytes.length){
    const length=format==="png"?bytes.readUInt32BE(offset):bytes.readUInt32LE(offset+4),kind=format==="png"?bytes.toString("ascii",offset+4,offset+8):bytes.toString("ascii",offset,offset+4);
    if(format==="png"&&kind==="acTL"||format==="webp"&&["ANIM","ANMF"].includes(kind))return true;
    const next=offset+(format==="png"?12+length:8+length+(length%2));
    if(next>bytes.length||next<=offset)return false;
    offset=next;
  }
  return false;
}
/** Inspect static images in the same bounded native decoder already used by
 * uploads. No resize, orientation transform, output encoding or FFmpeg runs.
 * Animated/unsupported image formats retain the isolated media-service path. */
export async function probeStaticImage(bytes:Uint8Array,declaredMime:string):Promise<MediaProbe|null>{
  const input=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),format=container(input),mime=declaredMime.split(";",1)[0].trim().toLowerCase();
  if(!format){if(Object.values(FORMATS).some(value=>value.mime===mime))invalid("声明的图片格式与真实字节不一致");return null;}
  if(FORMATS[format].mime!==mime)invalid("声明的图片格式与真实字节不一致");
  if(animatedContainer(input,format))return null;
  if(!bytes.byteLength||bytes.byteLength>ORIGINAL_IMAGE_MAX_BYTES)invalid();
  try{
    const decoder=sharp(input,{limitInputPixels:ORIGINAL_IMAGE_MAX_PIXELS,failOn:"warning",sequentialRead:true}).timeout({seconds:15});
    const metadata=await decoder.metadata();
    if((metadata.pages??1)!==1||(metadata.delay?.length??0)>1)return null;
    if(metadata.format!==(format==="avif"?"heif":format)&&metadata.format!==format)invalid("图片容器与真实解码格式不一致");
    if(format==="avif"&&metadata.compression&&metadata.compression!=="av1")invalid("素材不是AV1编码的AVIF静态图片");
    const width=metadata.width??0,height=metadata.height??0;
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>ORIGINAL_IMAGE_MAX_PIXELS)invalid();
    let decodedBytes=0,output:OutputInfo|undefined;
    decoder.on("info",(info:OutputInfo)=>{output=info;});
    await pipeline(decoder.raw({depth:"uchar"}),new Writable({write(chunk,_encoding,callback){
      decodedBytes+=chunk.length;
      callback(decodedBytes>ORIGINAL_IMAGE_MAX_PIXELS*4?new Error("Decoded image exceeds pixel budget"):undefined);
    }}));
    if(!output||output.width!==width||output.height!==height||output.channels<1||output.channels>4||decodedBytes!==width*height*output.channels)invalid();
    return {durationSeconds:0,width,height,videoCodec:FORMATS[format].codec,audioCodecs:[],formatName:FORMATS[format].format,frameRate:null};
  }catch(error){if(error instanceof ModelConfigError)throw error;invalid();}
}
