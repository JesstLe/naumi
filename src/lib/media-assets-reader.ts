import type {PoolClient} from "pg";
import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {checkReadClientSocket,withOwnedReadClient} from "@/platform/db/owned-read-client";
import {ensureMediaSchema} from "./media-assets-schema";
export type MediaAsset = {key:string; owner:string|null; public:boolean; remote_ready:boolean; content_type:string;
  sha256:string; bytes:number; width:number|null; height:number|null; thumbnail_key:string|null; preview_key:string|null};
const fields='key,owner,public,remote_ready,content_type,sha256,bytes,width,height,thumbnail_key,preview_key';

export async function getMediaAsset(key:string): Promise<MediaAsset|null> {
  if(!dbEnabled) return null;
  await ensureMediaSchema();
  return (await getPool().query(`SELECT ${fields} FROM app_media_assets WHERE key=$1`,[key])).rows[0] || null;
}

export async function getMediaAssets(keys:string[],signal?:AbortSignal):Promise<Map<string,MediaAsset>> {
 signal?.throwIfAborted();
 if(!dbEnabled||!keys.length)return new Map();await ensureMediaSchema();
 const query=`SELECT ${fields} FROM app_media_assets WHERE key=ANY($1::text[])`, params=[Array.from(new Set(keys))];
 const rows=signal?await withOwnedReadClient(getPool(),async tx=>{
   await tx.query('BEGIN READ ONLY');
   await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'"+checkReadClientSocket);
   const result=await tx.query(query,params);signal.throwIfAborted();await tx.query('COMMIT');return result.rows;
 },signal):(await getPool().query(query,params)).rows;
 return new Map(rows.map(row=>[String(row.key),row as MediaAsset]));
}

/** Caller owns the initialized media transaction; no pool borrowing here. */
export async function getMediaAssetTx(tx:PoolClient,key:string):Promise<MediaAsset|null>{
 return (await tx.query(`SELECT ${fields} FROM app_media_assets WHERE key=$1 FOR SHARE`,[key])).rows[0]||null;
}
