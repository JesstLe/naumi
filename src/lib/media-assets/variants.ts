import "server-only";
import {createHash} from "node:crypto";
import {getPool} from "@/platform/db/pool";
import {withBackgroundActivity} from "../release-runtime/background-activity";
import {getMediaAsset,type MediaAsset} from "../media-assets-reader";
import {readManagedObject} from "../object-storage/managed-read";
import {writeStoredObject,storageDriver} from "../object-storage/runtime";
import {makeMediaVariants} from "../media-variants";

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

export async function ensureMediaVariants(key:string,bytes?:Buffer) {
  return withBackgroundActivity("media-variant", key, "continuation", () => ensureMediaVariantsLocal(key,bytes), () => getMediaAsset(key));
}
