import {ensureMediaSchema} from "@/lib/media-assets-schema";
export {ensureMediaSchema};

import 'server-only';
import {createHash} from 'node:crypto';
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {currentBiContext} from "@/lib/bi/context";
import {readManagedObject} from './object-storage/managed-read';
import {storageDriver} from './object-storage/runtime';
import {getMediaAsset} from './media-assets-reader';
export {getMediaAsset,getMediaAssets,type MediaAsset} from './media-assets-reader';
import {ensureMediaVariants} from "./media-assets/variants";
export {ensureMediaVariants} from "./media-assets/variants";
export {recoverMediaMirrors} from "./media-assets/mirror-recovery";

function publicKey(key:string) { return /^(?:brand|library|templates|template-cache)\//.test(key); }

/** A request-local metadata snapshot; callers still authorize ownership for
 * every canonical source before using any variant. No cross-request ACL cache. */

export async function canReadMedia(key:string, owner:string|null) {
  if(publicKey(key)) return true;
  if(!dbEnabled) return false;
  const asset=await getMediaAsset(key);
  if(asset?.public) return true;
  if(!owner) return false;
  if(asset?.owner===owner.toLowerCase()) return true;
  // Legacy data and shared copies are authorized by actual DB references, never a client URL.
  await ensureSchema();
  const canonical=`/media/${key}`;
  if((await getPool().query(`SELECT 1 FROM app_artworks WHERE email=$1
    AND (image_url=$2 OR source_url=$2 OR video_url=$2) LIMIT 1`,[owner.toLowerCase(),canonical])).rowCount)return true;
  const competitor=(await getPool().query("SELECT to_regclass('app_competitor_items') AS table_name")).rows[0].table_name;
  return competitor?!!(await getPool().query(`SELECT 1 FROM app_competitor_items WHERE email=$1 AND
    (state->>'image'=$2 OR jsonb_path_exists(state,'$.versions[*].image ? (@ == $url)',jsonb_build_object('url',$2::text))) LIMIT 1`,[owner.toLowerCase(),canonical])).rowCount:false;
}

export async function importLegacyMedia(key:string, email?:string) {
  const asset=await getMediaAsset(key); if(asset) return asset;
  const original=await readManagedObject(`/media/${key}`,250*1024*1024);
  const ext=key.split('.').pop()?.toLowerCase(), mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif',mp4:'video/mp4',webm:'video/webm'} as Record<string,string>)[ext||''] || 'application/octet-stream';
  // Historical originals stay local initially; only bounded previews go to R2.
  await registerMediaAsset(key,original.bytes,mime,false,email);
  return getMediaAsset(key);
}
export async function registerMediaAsset(key:string, raw:Uint8Array, contentType:string, remoteReady:boolean, owner?:string,prepareVariants=true) {
  if(!dbEnabled) return;
  await ensureMediaSchema();
  const bytes=Buffer.from(raw), sha=createHash('sha256').update(bytes).digest('hex');
  await getPool().query(`INSERT INTO app_media_assets(key,owner,public,driver,remote_ready,content_type,sha256,bytes)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(key) DO UPDATE SET
    owner=COALESCE(app_media_assets.owner,EXCLUDED.owner),remote_ready=EXCLUDED.remote_ready,
    thumbnail_key=CASE WHEN app_media_assets.sha256=EXCLUDED.sha256 THEN app_media_assets.thumbnail_key ELSE NULL END,
    preview_key=CASE WHEN app_media_assets.sha256=EXCLUDED.sha256 THEN app_media_assets.preview_key ELSE NULL END,
    sha256=EXCLUDED.sha256,bytes=EXCLUDED.bytes,content_type=EXCLUDED.content_type`,
    [key,owner?.toLowerCase()||currentBiContext()?.email||null,publicKey(key),storageDriver,remoteReady,contentType,sha,bytes.length]);
  if(prepareVariants&&/^image\/(png|jpe?g|webp|gif|avif)$/.test(contentType)) await ensureMediaVariants(key,bytes).catch(()=>{});
}
