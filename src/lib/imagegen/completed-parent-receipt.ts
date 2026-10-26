import 'server-only';
import {createHash} from 'node:crypto';
import {dbEnabled,getPool} from '@/platform/db/pool';
import {assertMutableStagingTask} from '../staging-history';
import {recordImageStateTx} from '../saas/creation-writer';
import {readCanvasOutput} from '../canvas-image-input';
import {inspectImagegenPixels} from './postprocess';
import {plainGeneratedOutput} from './receipt-policy';
import type {ImagegenPlan,ImagegenResult} from './types';

const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const expiredOrEmpty=(row:Record<string,any>)=>!row.lease_token||row.lease_until&&row.lease_live===false;

/** Project one already settled, fully stored child. No generator, supplier,
 * settlement, release-activity mutation, or general UNKNOWN recovery is used.
 * The old activity remains audit evidence; this is a separate result receipt. */
export async function finalizeCompletedParent(parentId:string,owner:string):Promise<boolean>{
 if(!dbEnabled)return false;
 const pool=getPool();owner=owner.toLowerCase();
 const read=async(id:string,kind:string)=>(await pool.query("SELECT *,lease_until>clock_timestamp() AS lease_live FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind=$3",[id,owner,kind])).rows[0];
 const parent=await read(parentId,'imagegen');
 if(!parent||!['pending','running'].includes(parent.snapshot.status)||!expiredOrEmpty(parent))return false;
 const plan=parent.payload.plan as ImagegenPlan;
 if(!Array.isArray(plan?.steps)||plan.steps.length!==1||!plainGeneratedOutput(plan))return false;
 const children=parent.snapshot.children||{},keys=Object.keys(children),step=plan.steps[0];
 const link=children[step.key];
 if(keys.length!==1||!link?.jobId||!['submitted','done'].includes(link.state))return false;
 if(Object.values(parent.snapshot.paidOperations||{}).length)return false;
 const child=await read(link.jobId,'generate');
 if(!child||child.snapshot.status!=='done'||!child.billing_settled||!expiredOrEmpty(child)||child.snapshot.imagegenOutputError)return false;
 if(Object.values(child.snapshot.paidOperations||{}).some((a:any)=>!['done','rejected'].includes(a.state)||Object.values(a.children||{}).some((v:any)=>!['done','rejected'].includes(v.state))))return false;
 const images=child.snapshot.images;
 if(!Array.isArray(images)||images.length<1||images.length>4||images.length!==plan.request.variants)return false;
 const ids=images.map((image:any)=>image.id);
 if(ids.some((id:unknown)=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)return false;
 await assertMutableStagingTask(pool,'app_image_jobs',parentId);
 await assertMutableStagingTask(pool,'app_image_jobs',child.id);
 const works=(await pool.query("SELECT id,image_url FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL",[owner,ids])).rows;
 if(works.length!==ids.length)return false;
 const artifacts:ImagegenResult['artifacts']=[];
 for(const id of ids){
  const work=works.find(w=>w.id===id)!;
  const input=await readCanvasOutput(work.image_url,'http://internal',owner),pixels=await inspectImagegenPixels(input.buffer);
  if(!pixels.visiblePixels||plan.intent.background==='transparent'&&!pixels.transparentPixels)return false;
  artifacts.push({artworkId:id,url:work.image_url,mime:input.mimeType,...pixels});
 }
 const tx=await pool.connect();
 try{
  await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='8s'");
  const locked=(await tx.query("SELECT *,lease_until>clock_timestamp() AS lease_live FROM app_image_jobs WHERE id=ANY($1::text[]) AND email=$2 ORDER BY id FOR UPDATE",[[parentId,child.id],owner])).rows;
  const p=locked.find(r=>r.id===parentId),c=locked.find(r=>r.id===child.id);
  if(!p||!c||!expiredOrEmpty(p)||!expiredOrEmpty(c)||p.kind!=='imagegen'||c.kind!=='generate'||!c.billing_settled||p.lease_token!==parent.lease_token||c.lease_token!==child.lease_token||
    digest(p.snapshot)!==digest(parent.snapshot)||digest(p.payload)!==digest(parent.payload)||digest(c.snapshot)!==digest(child.snapshot)||digest(c.payload)!==digest(child.payload)){
   await tx.query('ROLLBACK');return false;
  }
  const currentWorks=(await tx.query("SELECT id,image_url FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL ORDER BY id FOR SHARE",[owner,ids])).rows;
  if(currentWorks.length!==works.length||currentWorks.some(w=>works.find(old=>old.id===w.id)?.image_url!==w.image_url)){await tx.query('ROLLBACK');return false;}
  const billing=(await tx.query("SELECT state,charged_credits FROM app_billing_operations WHERE id=$1 AND email=$2 FOR SHARE",[child.id,owner])).rows[0];
  const ledger=(await tx.query("SELECT -sum(delta)::int AS charged FROM app_ledger WHERE id=$1 AND email=$2 AND kind='consume'",['led-image-'+child.id,owner])).rows[0]?.charged;
  const charged=billing&&['settled','released'].includes(billing.state)?Number(billing.charged_credits):ledger!=null?Number(ledger):child.metered===false?0:null;
  if(charged===null||!Number.isSafeInteger(charged)||charged<0||billing&&!['settled','released'].includes(billing.state)){
   await tx.query('ROLLBACK');return false;
  }
  const warnings=[...new Set([...(parent.snapshot.result?.warnings||[]),...(child.snapshot.imagegenOutputWarning?[child.snapshot.imagegenOutputWarning]:[])])];
  const result={...parent.snapshot.result,status:'succeeded',stage:'done',artifacts,chargedCredits:charged,billingStatus:'confirmed',warnings};delete result.error;
  const snapshot={...parent.snapshot,status:'done',result,children:{...children,[step.key]:{...link,state:'done',ids}},
   completedChildReceipt:{version:1,childId:child.id,childSnapshotSha256:digest(child.snapshot),previousParentSnapshotSha256:digest(parent.snapshot),previousExpiredLeaseSha256:parent.lease_token?digest(parent.lease_token):null,observedAt:new Date().toISOString()}};
  await tx.query("UPDATE app_image_jobs SET snapshot=$3::jsonb,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND email=$2",[parentId,owner,JSON.stringify(snapshot)]);
  await recordImageStateTx(tx,parentId,snapshot);
  await tx.query('COMMIT');return true;
 }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
