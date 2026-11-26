import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureMediaSchema} from "../media-assets-schema";
import {withBackgroundActivity,bindBackgroundClaim} from "../release-runtime/background-activity";
import {matchesRemoteMedia} from "./verified-remote";
import {readPendingStoredObject,mirrorStoredObject,privateMedia,storageDriver} from "../object-storage/runtime";
import {evictVerifiedLocalMirrors} from "./mirror-eviction";

// One pass drains small claims back to back within a time budget. A fixed
// two-item pass per tick fell behind normal daily writes (47, 2026-11-06).
const MIRROR_PASS_LIMIT=64, MIRROR_CLAIM_SIZE=4, MIRROR_PASS_BUDGET_MS=12_000;

// Only retry saving bytes, never repeat a model request or touch billing.
async function recoverMediaMirrorsLocal(limit=MIRROR_PASS_LIMIT) {
  if(!privateMedia || storageDriver==='local'||!dbEnabled) return 0;
  await ensureMediaSchema();
  const started=Date.now();let processed=0;
  // Small claims keep unprocessed rows due: a pass that runs out of budget
  // never parks claimed rows behind the five-minute retry lease.
  while(processed<limit&&Date.now()-started<MIRROR_PASS_BUDGET_MS) {
    // Claim atomically, then release row locks before touching the NAS. The
    // exact retry timestamp plus content digest fences a superseded upload.
    const pending=(await getPool().query(`UPDATE app_media_assets a SET retry_after=now()+interval '5 minutes'
      FROM (SELECT key FROM app_media_assets WHERE NOT remote_ready AND retry_after<=now()
        ORDER BY retry_after,key LIMIT $1 FOR UPDATE SKIP LOCKED) due WHERE a.key=due.key
      RETURNING a.key,a.content_type,a.sha256,a.bytes,a.retry_after::text AS claim_until`,[Math.min(MIRROR_CLAIM_SIZE,limit-processed)])).rows;
    if(!pending.length)break;
    for(const row of pending) {
      await bindBackgroundClaim(row.key);
      let ready=false;
      try {
        let saved;
        try {
          saved=await readPendingStoredObject(row.key,250*1024*1024);
        } catch(error) {
          if((error as NodeJS.ErrnoException)?.code!=='ENOENT')throw error;
          // An imported or evicted original can already be present on the NAS.
          // Only a complete content match may promote its exact claim below.
          ready=await matchesRemoteMedia(row.key,row.sha256,Number(row.bytes));
        }
        if(saved) {
          if(saved.size!==Number(row.bytes)||createHash('sha256').update(saved.bytes).digest('hex')!==row.sha256)
            throw new Error('待补传素材校验失败');
          ready=(await mirrorStoredObject(saved.bytes,row.content_type,row.key)).remoteReady;
        }
      } catch {console.warn('MEDIA_MIRROR_RETRY_DEFERRED');}
      // One missing/corrupt object must not continuously starve the queue.
      await getPool().query(`UPDATE app_media_assets SET remote_ready=$2,retry_after=now()+interval '5 minutes'
        WHERE key=$1 AND sha256=$3 AND retry_after=$4::timestamptz AND NOT remote_ready`,[row.key,ready,row.sha256,row.claim_until]);
    }
    processed+=pending.length;
  }
  return processed;
}

export async function recoverMediaMirrors(limit=MIRROR_PASS_LIMIT) {
  return withBackgroundActivity("media-mirror", `media-mirror-scan:${randomUUID()}`, "claim", async () => {
    const uploaded=await recoverMediaMirrorsLocal(limit);
    // Same single-flight lane: once the NAS holds the bytes, the local copy is
    // only a cache. Eviction failure never fails or delays the upload pass.
    await evictVerifiedLocalMirrors().catch(()=>console.warn('MEDIA_MIRROR_EVICTION_DEFERRED'));
    return uploaded;
  }, () => 0);
}
