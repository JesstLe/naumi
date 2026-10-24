import "server-only";
import sharp from "sharp";
import {createHash} from "node:crypto";
import {ORIGINAL_IMAGE_MAX_BYTES,ORIGINAL_IMAGE_MAX_PIXELS} from "./image-upload-policy";
import {uploadImage,privateMedia,writeStoredObject} from "./storage";
import {ensureMediaSchema} from "./media-assets";
import {getPool} from "@/platform/db/pool";

export type BrowserPreviews={thumbnail:Buffer;preview:Buffer};
export async function originalImageMetadata(bytes:Buffer){
 if(!bytes.length||bytes.length>ORIGINAL_IMAGE_MAX_BYTES)throw Error("原图需在64MiB以内");
 const meta=await sharp(bytes,{limitInputPixels:ORIGINAL_IMAGE_MAX_PIXELS,failOn:"error"}).metadata();
 if(!meta.width||!meta.height||meta.width*meta.height>ORIGINAL_IMAGE_MAX_PIXELS||(meta.pages||1)>1||!["png","jpeg","webp"].includes(meta.format||""))throw Error("请选择6400万像素以内的静态PNG、JPEG或WebP");
 const swap=meta.orientation&&meta.orientation>=5&&meta.orientation<=8;
 return {width:swap?meta.height:meta.width,height:swap?meta.width:meta.height,mime:meta.format==="jpeg"?"image/jpeg":`image/${meta.format}`,extension:meta.format==="jpeg"?"jpg":meta.format!};
}
/** Decode only bounded browser thumbnails, never resize/decode the full original. */
export async function validateBrowserPreviews(original:{width:number;height:number},previews:BrowserPreviews){
 for(const [name,edge] of [["thumbnail",512],["preview",1600]] as const){
  const bytes=previews[name];if(!bytes.length||bytes.length>4*1024*1024)throw Error("浏览器预览图大小无效");
  const image=sharp(bytes,{limitInputPixels:edge*edge,failOn:"error"}),meta=await image.metadata();
  const scale=Math.min(1,edge/Math.max(original.width,original.height));
  if(meta.format!=="webp"&&meta.format!=="png"||(meta.pages||1)>1||!meta.width||!meta.height||meta.width>edge||meta.height>edge||Math.abs(meta.width-Math.max(1,Math.floor(original.width*scale)))>1||Math.abs(meta.height-Math.max(1,Math.floor(original.height*scale)))>1)throw Error("浏览器预览图尺寸与原图不一致");
  await image.raw().toBuffer();
 }
}
export async function browserPreviewsFromForm(form:FormData):Promise<BrowserPreviews|undefined>{
 const thumbnail=form.get("thumbnail"),preview=form.get("preview");
 if(!thumbnail&&!preview)return undefined;
 if(!(thumbnail instanceof File)||!(preview instanceof File)||thumbnail.size>4*1024*1024||preview.size>4*1024*1024)throw Error("浏览器预览图不完整或过大");
 return {thumbnail:Buffer.from(await thumbnail.arrayBuffer()),preview:Buffer.from(await preview.arrayBuffer())};
}
/** Original byte hash and original dimensions remain canonical; no derivative can
 * replace the source. Small legacy uploads retain their existing server fallback. */
export async function saveCanvasOriginal(bytes:Buffer,key:string,owner:string,previews?:BrowserPreviews){
 const meta=await originalImageMetadata(bytes);
 if(!previews){if(bytes.length>12*1024*1024)throw Error("大图请通过画布上传，浏览器会自动准备预览");return {url:await uploadImage(bytes,meta.mime,key,undefined,owner),...meta};}
 await validateBrowserPreviews(meta,previews);
 if(!privateMedia){return {url:await uploadImage(bytes,meta.mime,key,undefined,owner),...meta};}
 await ensureMediaSchema();const sha=createHash("sha256").update(bytes).digest("hex"),prepared=[];
 const existing=(await getPool().query("SELECT owner,sha256 FROM app_media_assets WHERE key=$1",[key])).rows[0];
 if(existing&&(existing.owner!==owner.toLowerCase()||existing.sha256!==sha))throw Error("素材归属或内容不匹配");
 const ownerKey=createHash("sha256").update(owner.toLowerCase()).digest("hex").slice(0,16);
 const original=await writeStoredObject(bytes,meta.mime,key);
 for(const [name,body] of Object.entries(previews)){
  const format=(await sharp(body).metadata()).format!,variantKey=`media-variants/${ownerKey}-${sha}-${name}-${createHash("sha256").update(body).digest("hex").slice(0,16)}.${format}`;
  const saved=await writeStoredObject(body,`image/${format}`,variantKey);prepared.push({name,key:variantKey,body,ready:saved.remoteReady,mime:`image/${format}`});
 }
 const tx=await getPool().connect();
 try{
  await tx.query("BEGIN");
  const driver=(await import("./storage")).storageDriver;
  for(const item of [{key,body:bytes,ready:original.remoteReady,mime:meta.mime},...prepared]){
   const dimensions=item.key===key?meta:await sharp(item.body).metadata();
   const result=await tx.query(`INSERT INTO app_media_assets(key,owner,public,driver,remote_ready,content_type,sha256,bytes,width,height)
    VALUES($1,$2,false,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(key) DO UPDATE SET remote_ready=EXCLUDED.remote_ready
    WHERE app_media_assets.owner=EXCLUDED.owner AND app_media_assets.sha256=EXCLUDED.sha256 RETURNING key`,[item.key,owner.toLowerCase(),driver,item.ready,item.mime,createHash("sha256").update(item.body).digest("hex"),item.body.length,dimensions.width,dimensions.height]);
   if(!result.rowCount)throw Error("素材归属或内容不匹配");
  }
  await tx.query("UPDATE app_media_assets SET thumbnail_key=$2,preview_key=$3 WHERE key=$1 AND owner=$4",[key,prepared.find(v=>v.name==="thumbnail")!.key,prepared.find(v=>v.name==="preview")!.key,owner.toLowerCase()]);
  await tx.query("COMMIT");
 }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
 return {url:`/media/${key}`,...meta};
}
