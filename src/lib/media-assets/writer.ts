import "server-only";
import type {Pool,PoolClient} from "pg";
import type {StorageDriver} from "../object-storage/config";

export type PreparedMediaMetadata={key:string;sha256:string;bytes:number;contentType:string;remoteReady:boolean;width:number;height:number};
export type OriginalMediaSet={owner:string;driver:StorageDriver;original:PreparedMediaMetadata;thumbnail:PreparedMediaMetadata;preview:PreparedMediaMetadata};

/** Existing mutable registration contract: preserve owner and invalidate old
 * derivatives when source bytes change. Policy is distinct from immutable sets. */
export async function registerMediaMetadata(db:Pick<Pool,"query">,input:{key:string;owner:string|null;public:boolean;driver:StorageDriver;remoteReady:boolean;contentType:string;sha256:string;bytes:number}){
 await db.query(`INSERT INTO app_media_assets(key,owner,public,driver,remote_ready,content_type,sha256,bytes)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(key) DO UPDATE SET
 owner=COALESCE(app_media_assets.owner,EXCLUDED.owner),remote_ready=EXCLUDED.remote_ready,local_evict_after=NULL,
 thumbnail_key=CASE WHEN app_media_assets.sha256=EXCLUDED.sha256 THEN app_media_assets.thumbnail_key ELSE NULL END,
 preview_key=CASE WHEN app_media_assets.sha256=EXCLUDED.sha256 THEN app_media_assets.preview_key ELSE NULL END,
 sha256=EXCLUDED.sha256,bytes=EXCLUDED.bytes,content_type=EXCLUDED.content_type`,
 [input.key,input.owner,input.public,input.driver,input.remoteReady,input.contentType,input.sha256,input.bytes]);
}
/** Publish a prepared private immutable result with its artwork/creation in the
 * caller's transaction. Pending raw checkpoints have no public media ACL row. */
export async function registerPrivateMediaTx(tx:PoolClient,input:{key:string;owner:string;driver:StorageDriver;remoteReady:boolean;contentType:string;sha256:string;bytes:number}){
 const saved=await tx.query(`INSERT INTO app_media_assets(key,owner,public,driver,remote_ready,content_type,sha256,bytes)
 VALUES($1,$2,false,$3,$4,$5,$6,$7) ON CONFLICT(key) DO UPDATE SET remote_ready=EXCLUDED.remote_ready,local_evict_after=NULL
 WHERE app_media_assets.owner=EXCLUDED.owner AND app_media_assets.sha256=EXCLUDED.sha256 AND app_media_assets.public=false RETURNING key`,
 [input.key,input.owner.toLowerCase(),input.driver,input.remoteReady,input.contentType,input.sha256,input.bytes]);
 if(!saved.rowCount)throw new Error("素材归属或内容不匹配");
}
/** Read-only preflight before object I/O; the Tx writer repeats the same fence. */
export async function assertOwnedMediaVersion(db:Pick<Pool,"query">,key:string,owner:string,sha256:string){
 const existing=(await db.query("SELECT owner,sha256 FROM app_media_assets WHERE key=$1",[key])).rows[0];
 if(existing&&(existing.owner!==owner.toLowerCase()||existing.sha256!==sha256))throw Error("素材归属或内容不匹配");
}
/** Only prepared facts enter this transaction: no bytes, codecs, network,
 * schema initialization, nested checkout or implicit commit. */
export async function registerOriginalWithPreviewsTx(tx:PoolClient,input:OriginalMediaSet){
 const owner=input.owner.toLowerCase();
 for(const item of [input.original,input.thumbnail,input.preview]){
  const registered=await tx.query(`INSERT INTO app_media_assets(key,owner,public,driver,remote_ready,content_type,sha256,bytes,width,height)
   VALUES($1,$2,false,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(key) DO UPDATE SET remote_ready=EXCLUDED.remote_ready,local_evict_after=NULL
   WHERE app_media_assets.owner=EXCLUDED.owner AND app_media_assets.sha256=EXCLUDED.sha256 RETURNING key`,
   [item.key,owner,input.driver,item.remoteReady,item.contentType,item.sha256,item.bytes,item.width,item.height]);
  if(!registered.rowCount)throw Error("素材归属或内容不匹配");
 }
 const attached=await tx.query("UPDATE app_media_assets SET thumbnail_key=$2,preview_key=$3 WHERE key=$1 AND owner=$4 AND sha256=$5 RETURNING key",[input.original.key,input.thumbnail.key,input.preview.key,owner,input.original.sha256]);
 if(!attached.rowCount)throw Error("原图元数据未保存，预览关联未完成");
}
/** A stale observation may populate its own probe cache, never a newer asset. */
export async function updateMediaDimensionsTx(tx:PoolClient,key:string,sha256:string,width:number|null,height:number|null){
 return !!(await tx.query("UPDATE app_media_assets SET width=$3,height=$4 WHERE key=$1 AND sha256=$2 RETURNING key",[key,sha256,width,height])).rowCount;
}
