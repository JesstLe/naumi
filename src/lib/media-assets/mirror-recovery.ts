import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureMediaSchema} from "../media-assets-schema";
import {withBackgroundActivity,bindBackgroundClaim} from "../release-runtime/background-activity";
import {readManagedObject,readManagedObjectInternal} from "../object-storage/managed-read";
import {readPendingStoredObject,mirrorStoredObject,privateMedia,storageDriver} from "../object-storage/runtime";

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
          if(row.key.startsWith("image-job-results/")){
            const {bytes}=await readManagedObjectInternal(`/media/${row.key}`,64*1024*1024);
            saved={bytes,size:bytes.length,contentType:row.content_type};
          }else saved=await readManagedObject(`/media/${row.key}`,250*1024*1024);
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
