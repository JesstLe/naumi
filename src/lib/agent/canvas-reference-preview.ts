import "server-only";
import { getMediaAsset } from "../media-assets-reader";
import { isManagedImageUrl, storageKeyFromManagedUrl } from "../object-storage/runtime";
import { readManagedObject } from "../object-storage/managed-read";

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
