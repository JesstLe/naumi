import "server-only";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {getPool} from "@/platform/db/pool";
import {ensureMediaSchema,registerMediaAsset} from "../media-assets";
import {writeStoredObject,readManagedObject} from "../storage";
import {decodeImagegenPixels} from "./pixels";
import {bindCreationMedia} from "@/lib/saas/creation-access";
/** Private original references, including masks; not gallery artworks or arbitrary URLs. */
export async function saveImagegenInput(bytes:Buffer,owner:string){
 const decoded=await decodeImagegenPixels(bytes),id=randomUUID(),meta=await sharp(bytes).metadata();
 const mime=meta.format==="jpeg"?"image/jpeg":meta.format==="webp"?"image/webp":"image/png";
 const key=`imagegen-inputs/${id}.${mime==="image/jpeg"?"jpg":mime==="image/webp"?"webp":"png"}`;
 const stored=await writeStoredObject(bytes,mime,key);
 // Prepared references are private transport assets, never gallery thumbnails.
 await registerMediaAsset(key,bytes,mime,stored.remoteReady,owner,false);
 await bindCreationMedia(owner,`asset-${id}`);
 return {artworkId:`asset-${id}`,url:`/media/${key}`,width:decoded.info.width,height:decoded.info.height};
}
export async function readImagegenInputAsset(id:string,owner:string){
 if(!/^asset-[a-f0-9-]{36}$/i.test(id))throw new Error("素材编号无效");
 await ensureMediaSchema();
 const row=(await getPool().query("SELECT key,content_type FROM app_media_assets WHERE owner=$1 AND key=ANY($2::text[])",[owner.toLowerCase(),["png","jpg","webp"].map(ext=>`imagegen-inputs/${id.slice(6)}.${ext}`)])).rows[0];
 if(!row)throw new Error("素材不存在或无权访问");
 const original=await readManagedObject(`/media/${row.key}`,12*1024*1024);
 return {buffer:Buffer.from(original.bytes),mimeType:row.content_type as string,url:`/media/${row.key}`};
}
