import {reportAccountReadable} from "../accounts/report-visibility";
import 'server-only';
import type {PoolClient} from 'pg';
import {getPool} from '@/platform/db/pool';
import {checkReadClientSocket,withOwnedReadClient} from '@/platform/db/owned-read-client';
import {ARTWORK_INPUT_COLUMNS,ARTWORK_INPUT_JOINS,artworkInputs} from './artwork-inputs';
import {readImagegenInputAssetReference} from '@/lib/imagegen/input-asset-reference';
import {ensureMediaSchema} from '@/lib/media-assets-schema';
import {isManagedImageUrl} from '@/lib/object-storage/runtime';

export type ArtworkPreviewSlot='result'|'input';
export class ArtworkPreviewNotAvailable extends Error {
 constructor(message:string,readonly status:404|422){super(message);}
}

function metadata<T>(signal:AbortSignal,read:(tx:PoolClient)=>Promise<T>){
 return withOwnedReadClient(getPool(),async tx=>{
  await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'"+checkReadClientSocket);
  const value=await read(tx);
  signal.throwIfAborted();await tx.query('COMMIT');return value;
 },signal);
}

/** Site admin authentication is a route precondition; each reference must also
 * belong to the artwork owner. No storage reads occur in metadata snapshots. */
export async function resolveArtworkPreview(id:string,slot:ArtworkPreviewSlot,index:number,signal:AbortSignal){
 const source=await metadata(signal,async tx=>{
  const {rows:[row]}=await tx.query(slot==='result'?'SELECT email,image_url FROM app_artworks WHERE id=$1':
   `SELECT a.email,a.image_url,a.creation_provenance,a.source_url,j.kind AS job_kind,c.kind AS canvas_task_kind,${ARTWORK_INPUT_COLUMNS}
     FROM app_artworks a ${ARTWORK_INPUT_JOINS} WHERE a.id=$1`,[id]);
  if(!row)throw new ArtworkPreviewNotAvailable('作品不存在',404);
  const email=String(row.email);
  if(!await reportAccountReadable(email,tx))throw new ArtworkPreviewNotAvailable("作品不存在",404);
  if(slot==='result')return {email,url:String(row.image_url)};
  const input=artworkInputs(row).inputs[index];
  if(!input)throw new ArtworkPreviewNotAvailable('原图记录不存在',404);
  if(input.url){
   if(!isManagedImageUrl(input.url))throw new ArtworkPreviewNotAvailable('原图记录不可读取',422);
   return {email,url:input.url};
  }
  if(!input.artworkId)throw new ArtworkPreviewNotAvailable('原图记录无效',422);
  if(input.artworkId.startsWith('asset-'))return {email,assetId:input.artworkId};
  const {rows:[original]}=await tx.query('SELECT image_url FROM app_artworks WHERE id=$1 AND email=$2',[input.artworkId,email]);
  if(!original?.image_url)throw new ArtworkPreviewNotAvailable('原图已失效',404);
  return {email,url:String(original.image_url)};
 });
 if(source.url!==undefined)return {email:source.email,url:source.url};
 signal.throwIfAborted();await ensureMediaSchema();
 const {url}=await metadata(signal,tx=>readImagegenInputAssetReference(source.assetId,source.email,tx));
 // Same private reference ceiling as the original input reader, which used
 // to download the file during the lookup and a second time during preview.
 return {email:source.email,url,maxBytes:12*1024*1024};
}
