import 'server-only';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { MEDIA_DIR, storageDriver, storageKeyFromManagedUrl, dataUrlToBytes } from "./object-storage/runtime";
import { getMediaAsset } from "./media-assets-reader";
export async function mediaCacheVersion(raw:string):Promise<string|null>{
  const inline=dataUrlToBytes(raw);
  if(inline && inline.bytes.length<=32*1024*1024)return createHash('sha256').update(inline.bytes).digest('hex');
  const key=storageKeyFromManagedUrl(raw);if(!key)return null;
  const asset=await getMediaAsset(key);if(asset?.remote_ready&&storageDriver!=='local')return asset.sha256;
  const base=path.resolve(MEDIA_DIR),file=path.resolve(base,key);if(!file.startsWith(base+path.sep))return null;
  try{const info=await stat(file);return info.isFile()?`local:${info.size}:${info.mtimeMs}`:null;}catch{return null;}
}
