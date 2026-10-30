import "server-only";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {registerMediaAsset} from "../media-assets";
import {writeStoredObject,readManagedObject} from "../storage";
import {decodeImagegenPixels} from "./pixels";
import {bindCreationMedia} from '../saas/creation-context';
import {readImagegenInputAssetReference} from './input-asset-reference';
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
 const reference=await readImagegenInputAssetReference(id,owner);
 const original=await readManagedObject(reference.url,12*1024*1024);
 return {buffer:Buffer.from(original.bytes),...reference};
}
