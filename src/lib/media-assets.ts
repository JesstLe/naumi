import { withBackgroundActivity, bindBackgroundClaim } from "@/lib/release-runtime/background-activity";
import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {dbEnabled, getPool, ensureSchema} from './db';
import {currentBiContext} from './bi/model-observer';
import {readManagedObject, readImageJobResult, readPendingStoredObject, writeStoredObject, mirrorStoredObject, privateMedia, storageDriver} from './storage';
import {makeMediaVariants} from './media-variants';
import type {PoolClient} from 'pg';

export type MediaAsset = {key:string; owner:string|null; public:boolean; remote_ready:boolean; content_type:string;
  sha256:string; bytes:number; width:number|null; height:number|null; thumbnail_key:string|null; preview_key:string|null};
let schema: Promise<void>|null = null;
export async function ensureMediaSchema() {
  if (!schema) schema = ensureSchema().then(()=>getPool().query(`
    CREATE TABLE IF NOT EXISTS app_media_assets (
      id uuid NOT NULL DEFAULT gen_random_uuid(), key text PRIMARY KEY, owner text, public boolean NOT NULL DEFAULT false,
      driver text NOT NULL, remote_ready boolean NOT NULL DEFAULT false, content_type text NOT NULL,
      sha256 text NOT NULL, bytes bigint NOT NULL, width integer, height integer,
      thumbnail_key text, preview_key text, retry_after timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS app_media_asset_pending_idx ON app_media_assets(retry_after) WHERE NOT remote_ready;
    CREATE TABLE IF NOT EXISTS app_media_uploads (
      id uuid PRIMARY KEY, owner text NOT NULL, staging_key text NOT NULL, content_type text NOT NULL,
      bytes integer NOT NULL CHECK(bytes>0 AND bytes<=67108864), expires_at timestamptz NOT NULL,
      asset_key text, committed_id text, created_at timestamptz NOT NULL DEFAULT now()
    );
    DO $upgrade$ BEGIN
     IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='app_media_uploads'::regclass AND conname='app_media_uploads_bytes_check' AND pg_get_constraintdef(oid) LIKE '%12582912%') THEN
      ALTER TABLE app_media_uploads DROP CONSTRAINT app_media_uploads_bytes_check;
      ALTER TABLE app_media_uploads ADD CONSTRAINT app_media_uploads_bytes_check CHECK(bytes>0 AND bytes<=67108864);
     END IF;
    END $upgrade$;
  `)).then(()=>{}).catch(e=>{schema=null;throw e;});
  return schema;
}
function publicKey(key:string) { return /^(?:brand|library|templates|template-cache)\//.test(key); }
export async function getMediaAsset(key:string): Promise<MediaAsset|null> {
  if(!dbEnabled) return null;
  await ensureMediaSchema();
  return (await getPool().query('SELECT * FROM app_media_assets WHERE key=$1',[key])).rows[0] || null;
}
/** Caller owns a transaction after media schema initialization. */
export async function getMediaAssetTx(tx:PoolClient,key:string):Promise<MediaAsset|null>{
  return (await tx.query('SELECT * FROM app_media_assets WHERE key=$1 FOR SHARE',[key])).rows[0]||null;
}
/** A request-local metadata snapshot; callers still authorize ownership for
 * every canonical source before using any variant. No cross-request ACL cache. */
export async function getMediaAssets(keys:string[]):Promise<Map<string,MediaAsset>> {
 if(!dbEnabled||!keys.length)return new Map();await ensureMediaSchema();
 const rows=(await getPool().query('SELECT * FROM app_media_assets WHERE key=ANY($1::text[])',[Array.from(new Set(keys))])).rows;
 return new Map(rows.map(row=>[String(row.key),row as MediaAsset]));
}
export async function canReadMedia(key:string, owner:string|null) {
  // Paid checkpoints are server-internal, not user-facing artworks or inputs.
  if(key.toLowerCase().startsWith('image-job-results/')) return false;
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
async function ensureMediaVariantsLocal(key:string, bytes?:Buffer) {
  const asset=await getMediaAsset(key); if(!asset || asset.thumbnail_key&&asset.preview_key) return asset;
  const tx=await getPool().connect();
  let locked=false,inTransaction=false;
  try {
    // Do not queue every image GET behind a slow remote upload. The winner is
    // single-flight across processes; contenders may serve the original.
    locked=(await tx.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',[`media-variants:${key}`])).rows[0].acquired;
    if(!locked)return asset;
    const current=(await tx.query('SELECT * FROM app_media_assets WHERE key=$1',[key])).rows[0] as MediaAsset;
    if(!current||current.thumbnail_key&&current.preview_key)return current;
    const input=bytes || (await readManagedObject(`/media/${key}`,32*1024*1024)).bytes;
    if(createHash('sha256').update(input).digest('hex')!==current.sha256)throw new Error('素材版本已改变');
    const v=await makeMediaVariants(input);
    const prefix=`media-variants/${current.sha256}`, thumbnail=`${prefix}-512.webp`, preview=`${prefix}-1600.webp`;
    const thumbResult=await writeStoredObject(v.thumbnail,'image/webp',thumbnail),previewResult=await writeStoredObject(v.preview,'image/webp',preview);
    // Only metadata is transactional. Network I/O never holds a DB transaction.
    await tx.query('BEGIN');inTransaction=true;
    for(const [k,body,ready] of [[thumbnail,v.thumbnail,thumbResult.remoteReady],[preview,v.preview,previewResult.remoteReady]] as const)
      await tx.query(`INSERT INTO app_media_assets(key,owner,public,driver,remote_ready,content_type,sha256,bytes,width,height)
        VALUES($1,$2,$3,$4,$5,'image/webp',$6,$7,$8,$9) ON CONFLICT(key) DO NOTHING`,
        [k,current.owner,current.public,storageDriver,ready,createHash('sha256').update(body).digest('hex'),body.length,v.width,v.height]);
    const attached=await tx.query('UPDATE app_media_assets SET thumbnail_key=$2,preview_key=$3,width=$4,height=$5 WHERE key=$1 AND sha256=$6',[key,thumbnail,preview,v.width,v.height,current.sha256]);
    await tx.query('COMMIT');inTransaction=false;
    if(!attached.rowCount)return getMediaAsset(key);
    return {...current,thumbnail_key:thumbnail,preview_key:preview,width:v.width,height:v.height};
  } catch(e) {if(inTransaction)await tx.query('ROLLBACK').catch(()=>{});throw e;}
  finally {if(locked)await tx.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`media-variants:${key}`]).then(()=>tx.release(),()=>tx.release(true));else tx.release();}
}

// Only retry saving bytes, never repeat a model request or touch billing.
async function recoverMediaMirrorsLocal(limit=2) {
  if(!privateMedia || storageDriver==='local'||!dbEnabled) return 0;
  await ensureMediaSchema();
    // Claim atomically, then release row locks before touching the NAS. The
    // exact retry timestamp plus content digest fences a superseded upload.
    const pending=(await getPool().query(`UPDATE app_media_assets a SET retry_after=now()+interval '5 minutes'
      FROM (SELECT key FROM app_media_assets WHERE NOT remote_ready AND retry_after<=now()
        ORDER BY retry_after,key LIMIT $1 FOR UPDATE SKIP LOCKED) due WHERE a.key=due.key
      RETURNING a.key,a.content_type,a.sha256,a.bytes,a.retry_after::text AS claim_until`,[limit])).rows;
    for(const row of pending) {
      await bindBackgroundClaim(row.key);
      let ready=false;
      try {
        let saved;
        try {saved=await readPendingStoredObject(row.key,250*1024*1024);}
        catch(error) {
          if((error as NodeJS.ErrnoException)?.code!=='ENOENT')throw error;
          // Legacy catalog imports can reference an existing remote original.
          if(row.key.startsWith('image-job-results/')) {
            const bytes=await readImageJobResult(`/media/${row.key}`,'managed',64*1024*1024);
            saved={bytes,size:bytes.length,contentType:row.content_type};
          } else saved=await readManagedObject(`/media/${row.key}`,250*1024*1024);
        }
        if(saved.size!==Number(row.bytes)||createHash('sha256').update(saved.bytes).digest('hex')!==row.sha256)
          throw new Error('待补传素材校验失败');
        ready=(await mirrorStoredObject(saved.bytes,row.content_type,row.key)).remoteReady;
      } catch {console.warn('MEDIA_MIRROR_RETRY_DEFERRED');}
      // One missing/corrupt object must not continuously starve the queue.
      await getPool().query(`UPDATE app_media_assets SET remote_ready=$2,retry_after=now()+interval '5 minutes'
        WHERE key=$1 AND sha256=$3 AND retry_after=$4::timestamptz AND NOT remote_ready`,[row.key,ready,row.sha256,row.claim_until]);
    }
    return pending.length;
}

export async function recoverMediaMirrors(limit=2) {
  return withBackgroundActivity("media-mirror", `media-mirror-scan:${randomUUID()}`, "claim", () => recoverMediaMirrorsLocal(limit), () => 0);
}
export async function ensureMediaVariants(key:string,bytes?:Buffer) {
  return withBackgroundActivity("media-variant", key, "continuation", () => ensureMediaVariantsLocal(key,bytes), () => getMediaAsset(key));
}
