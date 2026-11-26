import "server-only";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {lstat,unlink} from "node:fs/promises";
import path from "node:path";
import {matchesRemoteMedia} from "./verified-remote";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureMediaSchema} from "../media-assets-schema";
import {MEDIA_DIR,privateMedia,safeKey,storageDriver} from "../object-storage/runtime";

/** Hours a NAS-acknowledged object keeps its local copy. Unset → 12, "off" → never evict.
 * 47 measured ~1.2 GiB/hour of new media at peak, so 48h would fill the disk. */
export function localMirrorRetentionHours(value=process.env.NAUMI_NAS_LOCAL_MIRROR_RETENTION_HOURS):number|null{
  const raw=(value??"").trim().toLowerCase();
  if(raw==="off")return null;
  if(raw==="")return 12;
  const hours=Number(raw);
  return Number.isFinite(hours)&&hours>=0&&hours<=24*365?hours:12;
}

const DONE="infinity",CLAIM_MINUTES=10,RETRY_MISMATCH_HOURS=24,RETRY_REMOTE_MINUTES=60;
type Claimed={key:string;sha256:string;bytes:string|number;claim:string};
type Outcome="evicted"|"absent"|"deferred"|"mismatch"|"remote-unconfirmed";

async function sha256File(file:string){const hash=createHash("sha256");for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest("hex");}

/** Removes local copies of objects the NAS already holds. Never deletes catalog
 * rows, NAS objects, directories or a file whose bytes differ from the catalog.
 * A local copy is removed only after the NAS returns the same digest. */
export async function evictVerifiedLocalMirrors(options:{scan?:number;readbacks?:number;retentionHours?:number|null}={}){
  const retention=options.retentionHours===undefined?localMirrorRetentionHours():options.retentionHours;
  const result={scanned:0,evicted:0,bytesEvicted:0,absent:0,deferred:0,mismatch:0,remoteUnconfirmed:0};
  if(retention===null||!privateMedia||storageDriver==="local"||!dbEnabled)return result;
  await ensureMediaSchema();
  const pool=getPool(),root=path.resolve(MEDIA_DIR);
  const claimed=(await pool.query<Claimed>(`UPDATE app_media_assets a SET local_evict_after=now()+make_interval(mins=>${CLAIM_MINUTES})
    FROM (SELECT key FROM app_media_assets
      WHERE remote_ready AND local_evict_after IS DISTINCT FROM 'infinity'::timestamptz
        AND (local_evict_after IS NULL OR local_evict_after<=now())
        AND created_at<now()-($1::double precision*interval '1 hour')
      ORDER BY created_at,key LIMIT $2 FOR UPDATE SKIP LOCKED) due
    WHERE a.key=due.key RETURNING a.key,a.sha256,a.bytes,a.local_evict_after::text AS claim`,[retention,options.scan??200])).rows;
  let readbacks=options.readbacks??5;
  for(const row of claimed){
    result.scanned++;
    let outcome:Outcome;
    try{outcome=await evictOne(row,root,()=>readbacks-->0);}
    catch{outcome="remote-unconfirmed";}
    const next=outcome==="evicted"||outcome==="absent"?DONE:outcome==="deferred"?null
      :outcome==="mismatch"?`now()+interval '${RETRY_MISMATCH_HOURS} hours'`:`now()+interval '${RETRY_REMOTE_MINUTES} minutes'`;
    // The claim timestamp fences a concurrent scanner and a re-registered key.
    await pool.query(`UPDATE app_media_assets SET local_evict_after=${next===DONE?"'infinity'::timestamptz":next??"NULL"}
      WHERE key=$1 AND sha256=$2 AND local_evict_after=$3::timestamptz`,[row.key,row.sha256,row.claim]);
    if(outcome==="evicted"){result.evicted++;result.bytesEvicted+=Number(row.bytes);}
    else if(outcome==="absent")result.absent++;
    else if(outcome==="deferred")result.deferred++;
    else if(outcome==="mismatch")result.mismatch++;
    else result.remoteUnconfirmed++;
  }
  return result;
}

async function evictOne(row:Claimed,root:string,takeReadback:()=>boolean):Promise<Outcome>{
  const file=path.resolve(root,safeKey(row.key));
  if(file===root||!file.startsWith(root+path.sep))return "mismatch";
  let before;
  try{before=await lstat(file);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return "absent";throw error;}
  if(!before.isFile())return "mismatch";
  const bytes=Number(row.bytes);
  if(before.size!==bytes)return "mismatch";
  // Readback budget bounds NAS traffic per scan; unclaimed rows return next scan.
  if(!takeReadback())return "deferred";
  if(await sha256File(file)!==row.sha256)return "mismatch";
  if(!await matchesRemoteMedia(row.key,row.sha256,bytes))return "remote-unconfirmed";
  const after=await lstat(file);
  if(after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)return "mismatch";
  try{await unlink(file);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return "absent";throw error;}
  return "evicted";
}
