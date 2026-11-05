import 'server-only';
import {createHash} from 'node:crypto';
import { privateMedia, storageKeyFromManagedUrl } from "./object-storage/runtime";
import { readManagedObject } from "./object-storage/managed-read";
import { uploadImage } from "./media-upload";
import { getMediaAsset } from "./media-assets-reader";

// Called only for server-owned published template rows, never arbitrary client URLs.
async function publishedCopy(source:string) {
  const key=storageKeyFromManagedUrl(source);
  if(!privateMedia||!key||/^(?:brand|library|templates|template-cache)\//.test(key))return source;
  const object=await readManagedObject(source,32*1024*1024);
  const hash=createHash('sha256').update(object.bytes).digest('hex');
  const extension=key.split('.').pop()?.toLowerCase()||'png';
  const mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif'} as Record<string,string>)[extension];
  if(!mime)throw new Error('模板图片类型不支持');
  const published=`templates/published/${hash}.${extension}`;
  if(!await getMediaAsset(published))await uploadImage(object.bytes,mime,published);
  return `/media/${published}`;
}
export async function publishTemplateMedia<T extends {image:string;sourceImage?:string}>(row:T):Promise<T> {
  return {...row,image:await publishedCopy(row.image),...(row.sourceImage?{sourceImage:await publishedCopy(row.sourceImage)}:{})};
}
