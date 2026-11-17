import 'server-only';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { MEDIA_DIR, storageDriver, storageKeyFromManagedUrl, dataUrlToBytes } from "./object-storage/runtime";
import { getMediaAsset, getMediaAssets, type MediaAsset } from "./media-assets-reader";
function inlineVersion(raw:string){
  const inline=dataUrlToBytes(raw);
  return inline && inline.bytes.length<=32*1024*1024?createHash('sha256').update(inline.bytes).digest('hex'):null;
}
async function storedVersion(key:string,asset:MediaAsset|null|undefined){
  if(asset?.remote_ready&&storageDriver!=='local')return asset.sha256;
  const base=path.resolve(MEDIA_DIR),file=path.resolve(base,key);if(!file.startsWith(base+path.sep))return null;
  try{const info=await stat(file);return info.isFile()?`local:${info.size}:${info.mtimeMs}`:null;}catch{return null;}
}
export async function mediaCacheVersion(raw:string,signal?:AbortSignal):Promise<string|null>{
  signal?.throwIfAborted();
  const inline=inlineVersion(raw);if(inline)return inline;
  const key=storageKeyFromManagedUrl(raw);
  return key?storedVersion(key,signal?(await getMediaAssets([key],signal)).get(key):await getMediaAsset(key)):null;
}

/** Already authorized sources only. One catalogue SQL read, no storage body
 * fetch; local stat work begins after the database connection returns. */
export async function mediaCacheVersions(rawUrls:readonly string[],signal:AbortSignal){
  const items=[...new Set(rawUrls)].map(raw=>({raw,key:storageKeyFromManagedUrl(raw)}));
  const assets=await getMediaAssets(items.flatMap(item=>item.key?[item.key]:[]),signal);
  const versions=new Map<string,string>();
  for(const {raw,key} of items){
    signal.throwIfAborted();
    const hash=key?await storedVersion(key,assets.get(key)):inlineVersion(raw);
    if(hash)versions.set(raw,hash);
  }
  signal.throwIfAborted();return versions;
}
