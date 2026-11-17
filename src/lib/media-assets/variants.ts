import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {getPool} from "@/platform/db/pool";
import {withTransaction} from "@/platform/db/transaction";
import {withBackgroundActivity} from "../release-runtime/background-activity";
import {getMediaAsset,type MediaAsset} from "../media-assets-reader";
import {readManagedObject} from "../object-storage/managed-read";
import {writeStoredObject,storageDriver} from "../object-storage/runtime";
import {makeMediaVariants} from "../media-variants";

const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const slotKey=Symbol.for('naumi.media.variant-slots.v1');
const runtime=process as typeof process & {[slotKey]?:Set<string>};
const slots=runtime[slotKey] ||= new Set<string>();
// CPU and NAS work is bounded independently of business database capacity.
// Contenders keep the existing original-image fallback; no in-memory queue.
const variantSlots=2;
const claimMinutes=10;

async function claim(asset:MediaAsset,id:string) {
  const result=await getPool().query(`WITH candidate AS MATERIALIZED (
    SELECT key FROM app_media_assets
     WHERE key=$1 AND sha256=$2 AND owner IS NOT DISTINCT FROM $3 AND public=$4
       AND (thumbnail_key IS NULL OR preview_key IS NULL)
       AND (variant_claim_until IS NULL OR variant_claim_until<=clock_timestamp())
       AND pg_try_advisory_xact_lock(hashtextextended('media-variants:'||key,0))
     FOR UPDATE SKIP LOCKED
    ) UPDATE app_media_assets a SET variant_claim_id=$5,variant_claim_until=clock_timestamp()+make_interval(mins=>$6)
       FROM candidate WHERE a.key=candidate.key RETURNING a.key`,
    [asset.key,asset.sha256,asset.owner,asset.public,id,claimMinutes]);
  return !!result.rowCount;
}

async function release(key:string,id:string) {
  await getPool().query(`WITH candidate AS (
    SELECT key FROM app_media_assets WHERE key=$1 AND variant_claim_id=$2 FOR UPDATE SKIP LOCKED
    ) UPDATE app_media_assets a SET variant_claim_id=NULL,variant_claim_until=NULL FROM candidate
       WHERE a.key=candidate.key AND a.variant_claim_id=$2`,[key,id]);
}

type Derived={key:string;digest:string;bytes:number;remoteReady:boolean};
async function publish(asset:MediaAsset,id:string,width:number,height:number,thumbnail:Derived,preview:Derived) {
  return withTransaction(getPool(),async tx=>{
    await tx.query("SET LOCAL lock_timeout='750ms'");
    const attached=await tx.query(`UPDATE app_media_assets SET thumbnail_key=$6,preview_key=$7,width=$8,height=$9,
      variant_claim_id=NULL,variant_claim_until=NULL
      WHERE key=$1 AND sha256=$2 AND owner IS NOT DISTINCT FROM $3 AND public=$4 AND variant_claim_id=$5
       AND variant_claim_until>clock_timestamp() AND (thumbnail_key IS NULL OR preview_key IS NULL) RETURNING key`,
      [asset.key,asset.sha256,asset.owner,asset.public,id,thumbnail.key,preview.key,width,height]);
    if(!attached.rowCount)return false;
    for(const part of [thumbnail,preview]){
      const saved=await tx.query(`INSERT INTO app_media_assets(key,owner,public,driver,remote_ready,content_type,sha256,bytes,width,height)
        VALUES($1,$2,$3,$4,$5,'image/webp',$6,$7,$8,$9)
        ON CONFLICT(key) DO UPDATE SET remote_ready=app_media_assets.remote_ready OR EXCLUDED.remote_ready,local_evict_after=NULL
        WHERE app_media_assets.owner IS NOT DISTINCT FROM EXCLUDED.owner AND app_media_assets.public=EXCLUDED.public
          AND app_media_assets.sha256=EXCLUDED.sha256 AND app_media_assets.bytes=EXCLUDED.bytes RETURNING key`,
        [part.key,asset.owner,asset.public,storageDriver,part.remoteReady,part.digest,part.bytes,width,height]);
      if(!saved.rowCount)throw new Error('派生素材归属或内容不匹配');
    }
    return true;
  });
}

async function prepareVariants(asset:MediaAsset,bytes?:Buffer) {
  const id=randomUUID();
  // Probe the legacy advisory key only for this statement: an already-running
  // old build may finish its work. No DB connection remains checked out here.
  if(!await claim(asset,id))return asset;
  let attached=false;
  try {
    const input=bytes || (await readManagedObject(`/media/${asset.key}`,32*1024*1024)).bytes;
    if(sha(input)!==asset.sha256)throw new Error('素材版本已改变');
    const {width,height,thumbnail,preview}=await makeMediaVariants(input);
    // Immutable scoped names: even a fenced writer can only leave unreferenced
    // bytes, not overwrite another owner or a winner's different output.
    const scope=sha(JSON.stringify([asset.key,asset.owner,asset.public,asset.sha256]));
    const store=async(size:number,body:Buffer):Promise<Derived>=>{
      const digest=sha(body),key=`media-variants/v2/${scope}-${size}-${digest}.webp`;
      const {remoteReady}=await writeStoredObject(body,'image/webp',key);
      return {digest,key,remoteReady,bytes:body.length};
    };
    const thumb=await store(512,thumbnail),view=await store(1600,preview);
    attached=await publish(asset,id,width,height,thumb,view);
    if(!attached)return await getMediaAsset(asset.key);
    return {...asset,thumbnail_key:thumb.key,preview_key:view.key,width,height};
  }finally{
    if(!attached)await release(asset.key,id).catch(()=>{});
  }
}

export async function ensureMediaVariants(key:string,bytes?:Buffer) {
  const asset=await getMediaAsset(key);
  if(!asset || asset.thumbnail_key&&asset.preview_key || slots.has(key) || slots.size>=variantSlots)return asset;
  slots.add(key);
  try {return await withBackgroundActivity('media-variant',key,'continuation',()=>prepareVariants(asset,bytes),()=>getMediaAsset(key));}
  finally {slots.delete(key);}
}
