'use strict';
// Exact maintenance runner; no generation/settlement API is called. Inputs and
// preimages are private files. This program is run inside the pinned current Web.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let planPlacement,fingerprint;
const EXPECTED='b15d4761b938428c449531e2d8744401a38a2ec7';
const file=process.argv[2],apply=process.argv.includes('--apply'),stage=process.argv.includes('--placement-only')?'placement':'status';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function load(source,deps){const exports={},module={exports};vm.runInNewContext(source,{module,exports,Buffer,Date,Set,Map,console,require:n=>n==='server-only'?{}:n.startsWith('node:')?require(n):deps[n]});return module.exports;}
async function main(){
 const input=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(input.sourceCommit,EXPECTED);assert.equal(process.env.SOURCE_COMMIT,EXPECTED);
 let content='';for await(const b of process.stdin)content+=b;const modules=JSON.parse(content);
 assert.equal(sha(Buffer.from(modules.receipt)),modules.receiptSha256);assert.equal(sha(Buffer.from(modules.ratio)),modules.ratioSha256);
 assert.equal(sha(Buffer.from(modules.placement)),modules.placementSha256);({planPlacement,fingerprint}=load(modules.placement,{}));
 require('/app/.next/server/app/api/imagegen/route.js');const r=require('/app/.next/server/webpack-runtime.js');r.C(require('/app/.next/server/chunks/7279.js'));
 const db=await r(35552),writer=await r(92930),media=await r(20231),pixels=await r(75381),policy=await r(1431),history=await r(93852),pool=db.getPool();
 assert.equal(typeof writer.oU,'function');assert.equal(typeof media.M,'function');assert.equal(typeof pixels.R,'function');assert.equal(typeof history.VI,'function');
 const read=async(q,args=[])=>{const c=await pool.connect();try{await c.query("BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ;SET LOCAL statement_timeout='15s';SET LOCAL lock_timeout='1s'");const rows=(await c.query(q,args)).rows;await c.query('COMMIT');return rows}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}};
 const auditPath=process.env.NAUMI_CANVAS_REPAIR_LOG;assert(auditPath?.startsWith('/release-state/canvas-sync47-20261026-'));
 const auditFd=fs.openSync(auditPath,'ax',0o600);
 const audit=(kind,data)=>{const line=JSON.stringify({kind,...data,observedAt:new Date().toISOString()})+'\n';fs.writeSync(auditFd,line);fs.fsyncSync(auditFd);process.stdout.write(line);};
 const creationSnapshot=async(c,id)=>{
  const records=(await c.query("SELECT DISTINCT a.* FROM app_creation_records a JOIN app_creation_links l ON l.creation_id=a.id WHERE l.target_id=$1 AND l.target_type LIKE 'image:%' ORDER BY a.id",[id])).rows;
  const ids=records.map(a=>a.id);const parts={records};for(const table of ['app_creation_links','app_creation_assets','app_creation_events'])parts[table]=(await c.query(`SELECT * FROM ${table} WHERE creation_id=ANY($1::text[]) ORDER BY to_jsonb(${table})::text`,[ids])).rows;return parts;
 };
 let current=null;
 const tracked={query:(...args)=>pool.query(...args),async connect(){const c=await pool.connect();let recorded=false;return {release:()=>c.release(),async query(q,args){
  if(apply&&!recorded&&current&&/^UPDATE app_image_jobs|^UPDATE app_creation_records/i.test(q)){
   const job=(await c.query('SELECT * FROM app_image_jobs WHERE id=$1 AND email=$2',[current.id,current.owner])).rows;
   audit('transaction-preimage',{target:current.id,job,creation:await creationSnapshot(c,current.id)});recorded=true;
  }
  const result=await c.query(q,args);if(recorded&&q==='COMMIT')audit('transaction-committed',{target:current.id});return result;
 }}}};
 const original=load(modules.receipt,{'../db':{dbEnabled:true,getPool:()=>tracked},'../staging-history':{assertMutableStagingTask:history.VI},'../saas/creation-writer':{recordImageStateTx:writer.oU},'../canvas-image-input':{readCanvasOutput:media.M},'./postprocess':{inspectImagegenPixels:pixels.R},'./receipt-policy':{plainGeneratedOutput:policy.F},'./output-advisory':load(modules.ratio,{})});
 const summaries=[];
 if(stage==='status')for(const t of input.statusTargets){
  current=t;assert(t.id.startsWith('imagegen-')&&t.childIds.length===1);const cid=t.childIds[0];
  const preserve=async()=>({child:await read('SELECT * FROM app_image_jobs WHERE id=$1 AND email=$2',[cid,t.owner]),billing:await read('SELECT * FROM app_billing_operations WHERE id=$1 AND email=$2',[cid,t.owner]),ledger:await read('SELECT * FROM app_ledger WHERE id=$1 AND email=$2 ORDER BY id',['led-image-'+cid,t.owner]),supplier:await read("SELECT * FROM app_supplier_calls WHERE user_email=$1 AND (operation_id=ANY($2::text[]) OR left(operation_id,length($3))=$3 OR left(operation_id,length($4))=$4) ORDER BY id",[t.owner,[t.id,cid],t.id+':',cid+':']),unknown:await read("SELECT * FROM app_release_activities WHERE state='unknown' AND (work_key IN ($1,$2,$3,$4) OR admission_key IN ($1,$2,$3,$4)) ORDER BY id",[t.id,'imagegen:'+t.id,cid,'generate:'+cid])});
  const before=await preserve();audit('protected-before',{target:t.id,rows:before});
  let changed=false,error=null;
  try{if(apply)changed=await original.finalizeCompletedParent(t.id,t.owner,{repairTerminalReceipt:true});}catch(e){error=e.code||e.name;}
  const after=await preserve();assert.equal(fingerprint(before),fingerprint(after),'PROTECTED_CHILD_BILLING_LEDGER_SUPPLIER_UNKNOWN_CHANGED');
  const parent=(await read("SELECT id,snapshot->>'status' status,snapshot#>>'{result,status}' result_status,snapshot#>'{result,artifacts}' artifacts,snapshot#>'{result,warnings}' warnings FROM app_image_jobs WHERE id=$1 AND email=$2",[t.id,t.owner]))[0];
  const creations=await read('SELECT id,status FROM app_creation_records WHERE source_id=$1 AND actor_email=$2 ORDER BY id',[t.id,t.owner]);
  const result={target:t.id,changed,error,parent,creations,protectedUnchanged:true};summaries.push(result);audit('status-result',result);
 }
 if(stage==='placement'){
  // Fresh geometry, rather than applying coordinates from an old inventory.
  const keys=[...new Set(input.placementTargets.map(t=>JSON.stringify([t.owner,t.groupId])))].map(v=>{const[email,group_id]=JSON.parse(v);return {email,group_id}});
  for(const correction of input.projectCorrections){keys.push({email:correction.owner,group_id:correction.expectedGroup},{email:correction.owner,group_id:correction.fromGroup});}
  const keyJson=JSON.stringify(keys),artworks=await read('SELECT a.* FROM app_artworks a JOIN jsonb_to_recordset($1::jsonb) AS k(email text,group_id text) ON a.email=k.email AND a.group_id=k.group_id ORDER BY a.email,a.id',[keyJson]);
  const unique=[...new Map(artworks.map(a=>[a.id,a])).values()];
  const textNodes=await read("SELECT t.* FROM app_canvas_text_nodes t JOIN jsonb_to_recordset($1::jsonb) AS k(email text,group_id text) ON t.email=k.email AND t.project_key='tree:'||k.group_id",[keyJson]);
  const videoNodes=await read("SELECT t.* FROM app_canvas_video_nodes t JOIN jsonb_to_recordset($1::jsonb) AS k(email text,group_id text) ON t.email=k.email AND t.project_key='tree:'||k.group_id AND t.deleted_at IS NULL",[keyJson]);
  const locked=await read("SELECT node_id FROM app_canvas_node_settings WHERE settings->>'locked'='true' AND email=ANY($1::text[])",[[...new Set(keys.map(k=>k.email))]]);const lockedIds=new Set(locked.map(a=>a.node_id));
  const successParents=await read("SELECT id FROM app_image_jobs WHERE id=ANY($1::text[]) AND snapshot->>'status'='done' AND snapshot#>>'{result,status}'='succeeded'",[[...new Set(input.placementTargets.map(t=>t.parentId))]]);
  const successIds=new Set(successParents.map(p=>p.id));
  const targets=input.placementTargets.filter(t=>successIds.has(t.parentId)).map(t=>({...t,locked:lockedIds.has(t.artworkId)}));
  // A coordinate-less completed root with no live lineage remains explicit;
  // never attach it to an unrelated project merely to clear the queue.
  const plan=planPlacement({artworks:unique,textNodes,videoNodes,targets});audit('placement-plan',plan);
  if(apply)for(const change of plan.changes){
   const c=await pool.connect();try{
    await c.query("BEGIN;SET LOCAL statement_timeout='8s';SET LOCAL lock_timeout='2s'");await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[change.owner]);
    const row=(await c.query('SELECT * FROM app_artworks WHERE id=$1 AND email=$2 FOR UPDATE',[change.id,change.owner])).rows[0];
    assert(row);const actual=Object.fromEntries(Object.keys(change.before).map(k=>[k,row[k]]));
    if(fingerprint(actual)!==fingerprint(change.before)){await c.query('ROLLBACK');audit('placement-skipped',{id:change.id,reason:'CURRENT_ROW_CHANGED'});continue;}
    if(change.anchorId){
     const anchor=(await c.query('SELECT * FROM app_artworks WHERE id=$1 AND email=$2 FOR SHARE',[change.anchorId,change.owner])).rows[0];assert(anchor&&anchor.group_id===row.group_id&&!!anchor.deleted_at===change.historicalAnchor);
     const previous=unique.find(a=>a.id===change.anchorId);const anchorPlanned=plan.changes.find(a=>a.id===change.anchorId);assert.equal(anchor.canvas_x,anchorPlanned?.after.canvas_x??previous.canvas_x);assert.equal(anchor.canvas_y,anchorPlanned?.after.canvas_y??previous.canvas_y);
    }else assert(change.rootSeed&&row.id===row.group_id&&!row.parent_id);
    audit('placement-preimage',{id:change.id,before:row,change});
    await c.query('UPDATE app_artworks SET canvas_x=$3,canvas_y=$4 WHERE id=$1 AND email=$2',[change.id,change.owner,change.after.canvas_x,change.after.canvas_y]);await c.query('COMMIT');audit('placement-committed',{id:change.id,owner:change.owner,anchorId:change.anchorId,after:change.after});
   }catch(e){await c.query('ROLLBACK');audit('placement-error',{id:change.id,error:e.code||e.name});}finally{c.release()}
  }
  for(const fix of input.projectCorrections){
   const c=await pool.connect();try{
    await c.query("BEGIN;SET LOCAL statement_timeout='8s';SET LOCAL lock_timeout='2s'");await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[fix.owner]);
    const p=(await c.query('SELECT payload,snapshot FROM app_image_jobs WHERE id=$1 AND email=$2',[fix.parentId,fix.owner])).rows[0];assert(p?.snapshot.status==='done'&&p.payload.creationScope.parentContext==='tree:'+fix.expectedGroup);
    const rows=(await c.query('SELECT * FROM app_artworks WHERE id=ANY($1::text[]) AND email=$2 ORDER BY id FOR UPDATE',[[fix.artworkId,fix.sourceId],fix.owner])).rows;const a=rows.find(a=>a.id===fix.artworkId);let source=rows.find(a=>a.id===fix.sourceId);assert(a&&source&&!a.deleted_at);
    const seen=new Set();while(source.deleted_at){assert(source.parent_id&&!seen.has(source.id));seen.add(source.id);source=(await c.query('SELECT * FROM app_artworks WHERE id=$1 AND email=$2 FOR SHARE',[source.parent_id,fix.owner])).rows[0];assert(source&&source.group_id===fix.expectedGroup);}
    assert(source.group_id===fix.expectedGroup);if(a.group_id===fix.expectedGroup){await c.query('ROLLBACK');audit('project-already-correct',{id:a.id});continue;}
    assert(a.group_id===fix.fromGroup&&fix.fromGroup===a.id&&!a.parent_id&&a.parent_ids.length===0&&a.origin==='canvas');assert(p.snapshot.result.artifacts.some(v=>v.artworkId===a.id));
    const followers=(await c.query('SELECT count(*)::int n FROM app_artworks WHERE email=$1 AND group_id=$2 AND id<>$3 AND deleted_at IS NULL',[fix.owner,a.group_id,a.id])).rows[0].n;assert.equal(followers,0);
    audit('project-preimage',{id:a.id,before:a,expectedGroup:fix.expectedGroup});
    if(apply)await c.query('UPDATE app_artworks SET group_id=$3,parent_id=$4 WHERE id=$1 AND email=$2',[a.id,fix.owner,fix.expectedGroup,source.id]);await c.query(apply?'COMMIT':'ROLLBACK');audit('project-result',{id:a.id,applied:apply,groupId:fix.expectedGroup,anchorId:source.id,coordinatesUnchanged:true});
   }catch(e){await c.query('ROLLBACK');audit('project-error',{id:fix.artworkId,error:e.code||e.name});}finally{c.release()}
  }
 }
 audit('summary',{stage,apply,statusTargets:summaries.length,statusSucceeded:summaries.filter(s=>s.parent?.result_status==='succeeded'&&s.creations.every(c=>c.status==='succeeded')).length,statusRemaining:summaries.filter(s=>s.parent?.result_status!=='succeeded').map(s=>s.target),newGenerationPosts:0,newCharges:0});
 await pool.end();process.exit(0);
}
main().catch(e=>{console.error(JSON.stringify({kind:'fatal',error:e.code||e.name,assertion:e.operator||null}));process.exit(1)});
