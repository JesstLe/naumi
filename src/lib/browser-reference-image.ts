"use client";
import {ORIGINAL_IMAGE_MAX_BYTES,ORIGINAL_IMAGE_MAX_PIXELS,referenceImageBudget,fitReferenceImage} from "./image-upload-policy";

export type ImageHeader={width:number;height:number;mime:string};
/** Read bounded headers before allocating a decoded bitmap, including EXIF orientation. */
export async function browserImageHeader(file:File):Promise<ImageHeader>{
 if(!file.size||file.size>ORIGINAL_IMAGE_MAX_BYTES)throw Error("请选择64MiB以内的PNG、JPEG或WebP图片");
 const data=new Uint8Array(await file.slice(0,256*1024).arrayBuffer()),v=new DataView(data.buffer);
 let width=0,height=0,mime="",orientation=1;
 const ascii=(p:number,n:number)=>String.fromCharCode(...data.subarray(p,p+n));
 if(data.length>=33&&ascii(1,3)==="PNG"&&v.getUint32(0)===0x89504e47){
  width=v.getUint32(16);height=v.getUint32(20);mime="image/png";
  for(let p=8;p+12<=data.length;){const n=v.getUint32(p),type=ascii(p+4,4);if(type==="acTL")throw Error("请选择静态图片，动画图片请先导出单帧");if(type==="IDAT")break;if(n>data.length-p-12)break;p+=n+12;}
 }else if(data.length>=30&&ascii(0,4)==="RIFF"&&ascii(8,4)==="WEBP"){
  mime="image/webp";const type=ascii(12,4);
  if(type==="VP8X"){if(data[20]&2)throw Error("请选择静态图片，动画图片请先导出单帧");width=1+data[24]+(data[25]<<8)+(data[26]<<16);height=1+data[27]+(data[28]<<8)+(data[29]<<16);}
  else if(type==="VP8L"&&data[20]===0x2f){const n=v.getUint32(21,true);width=(n&16383)+1;height=((n>>>14)&16383)+1;}
  else if(type==="VP8 "&&data[23]===0x9d&&data[24]===1&&data[25]===0x2a){width=v.getUint16(26,true)&16383;height=v.getUint16(28,true)&16383;}
 }else if(data[0]===255&&data[1]===216){
  mime="image/jpeg";
  for(let p=2;p+4<=data.length;){
   if(data[p++]!==255)break;while(data[p]===255)p++;const marker=data[p++];if(marker===0xda||marker===0xd9)break;
   if(marker===1||marker>=0xd0&&marker<=0xd7)continue;
   if(p+2>data.length)break;const n=v.getUint16(p);if(n<2||p+n>data.length)break;
   if(marker===0xe1&&ascii(p+2,6)==="Exif\0\0")try{
    const start=p+8,little=ascii(start,2)==="II",end=p+n,ifd=start+v.getUint32(start+4,little);
    if(ifd>=start+8&&ifd+2<=end)for(let i=0;i<Math.min(256,v.getUint16(ifd,little));i++){
     const field=ifd+2+i*12;if(field+12>end)break;
     if(v.getUint16(field,little)===0x112&&v.getUint16(field+2,little)===3&&v.getUint32(field+4,little)===1)orientation=v.getUint16(field+8,little);
    }
   }catch{/* malformed optional EXIF cannot allocate arbitrary memory */}
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&n>=7){height=v.getUint16(p+3);width=v.getUint16(p+5);}
   p+=n;
  }
 }
 if(!width||!height||!mime)throw Error("图片格式或尺寸读取失败，请重新导出PNG、JPEG或WebP");
 if(width*height>ORIGINAL_IMAGE_MAX_PIXELS)throw Error("图片超过6400万像素，请先在本机缩小后上传");
 return orientation>=5&&orientation<=8?{width:height,height:width,mime}:{width,height,mime};
}

async function decodedImage(file:File){
 if(typeof createImageBitmap==="function"){
  try{
   // The default already respects EXIF. Older browsers reject the explicit
   // "from-image" enum; some expose createImageBitmap but cannot decode it.
   const bitmap=await createImageBitmap(file);return {source:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close()};
  }catch{/* Use the browser's image decoder before reporting an upload failure. */}
 }
 const url=URL.createObjectURL(file),image=new Image();image.src=url;
 try{await image.decode();return {source:image,width:image.naturalWidth,height:image.naturalHeight,close:()=>{image.src="";URL.revokeObjectURL(url);}};}
 catch(error){URL.revokeObjectURL(url);throw error;}
}
function canvasBlob(canvas:HTMLCanvasElement,mime:string,quality?:number){return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error("浏览器未能处理图片，请重新导出后上传")),mime,quality));}
export type PreparedReference={file:File;sourceWidth:number;sourceHeight:number;width:number;height:number;optimized:boolean};
/** Generation derivative only. The caller's original File is never mutated or substituted in the gallery. */
export async function prepareReferenceImage(original:File,count=1):Promise<PreparedReference>{
 const header=await browserImageHeader(original),budget=referenceImageBudget(count);
 const size=fitReferenceImage(header.width,header.height,budget.maxEdge,budget.maxPixels);
 if(original.size<=budget.maxBytes&&size.width===header.width&&size.height===header.height)
  return {file:original,sourceWidth:header.width,sourceHeight:header.height,...size,optimized:false};
 const image=await decodedImage(original),canvas=document.createElement("canvas");
 try{
  if(image.width!==header.width||image.height!==header.height)throw Error("图片方向或尺寸读取不一致，请重新导出图片");
  let {width,height}=size;
  for(let round=0;round<6;round++){
   canvas.width=width;canvas.height=height;const context=canvas.getContext("2d",{alpha:true});if(!context)throw Error("浏览器未能处理图片，请重新导出后上传");
   context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";context.drawImage(image.source,0,0,width,height);
   const types=header.mime==="image/png"?[{mime:"image/png",quality:undefined},{mime:"image/webp",quality:0.92},{mime:"image/webp",quality:0.84}]:[{mime:header.mime,quality:0.92},{mime:header.mime,quality:0.84}];
   for(const type of types){const blob=await canvasBlob(canvas,type.mime,type.quality);if(blob.size<=budget.maxBytes){
    const ext=blob.type==="image/jpeg"?"jpg":blob.type==="image/webp"?"webp":"png";
    return {file:new File([blob],original.name.replace(/\.[^.]+$/,"")+`.reference.${ext}`,{type:blob.type,lastModified:original.lastModified}),sourceWidth:header.width,sourceHeight:header.height,width,height,optimized:true};
   }}
   width=Math.max(1,Math.floor(width*0.8));height=Math.max(1,Math.floor(height*0.8));
  }
  throw Error("图片适配后仍超过本次参考图容量，请减少参考图数量");
 }finally{image.close();canvas.width=canvas.height=1;}
}

export type ClientImagePreviews={thumbnail:Blob;preview:Blob;width:number;height:number;mime:string};
/** One sequential local decode supplies both previews; the original remains byte-for-byte intact. */
export async function prepareOriginalImage(original:File):Promise<ClientImagePreviews>{
 const header=await browserImageHeader(original),image=await decodedImage(original),canvas=document.createElement("canvas");
 try{
  if(image.width!==header.width||image.height!==header.height)throw Error("图片方向或尺寸读取不一致，请重新导出图片");
  const make=async(edge:number)=>{const size=fitReferenceImage(image.width,image.height,edge,edge*edge);canvas.width=size.width;canvas.height=size.height;const c=canvas.getContext("2d",{alpha:true});if(!c)throw Error("浏览器未能处理预览图");c.drawImage(image.source,0,0,size.width,size.height);return canvasBlob(canvas,"image/webp",edge===512?0.76:0.84);};
  return {thumbnail:await make(512),preview:await make(1600),width:header.width,height:header.height,mime:header.mime};
 }finally{image.close();canvas.width=canvas.height=1;}
}
