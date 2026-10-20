import "server-only";
import { getMediaAsset } from "../media-assets";
import { isManagedImageUrl, storageKeyFromManagedUrl, readManagedObject } from "../storage";

/** Call only after artwork ownership is checked. Never create variants on this read path. */
export async function readCanvasVisionReference(image: string) {
  if (!isManagedImageUrl(image)) return null;
  const key=storageKeyFromManagedUrl(image);
  const asset=key?await getMediaAsset(key):null;
  if(asset?.preview_key){
    try{return await readManagedObject(`/media/${asset.preview_key}`,4*1024*1024);}
    catch{/* Legacy or unavailable preview: keep the existing bounded original fallback. */}
  }
  return readManagedObject(image,12*1024*1024);
}
