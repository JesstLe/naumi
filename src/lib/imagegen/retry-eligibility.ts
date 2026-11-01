import 'server-only';
import {dbEnabled,getPool} from '@/platform/db/pool';
import {readImageRejectionEvidence} from '../model-config/image-rejection-evidence';
import {imageJobHasResults} from '../image-job-failure';
import {assertAcceptedImagegenCreationScope} from './creation-scope';
import {readImagegenBilling} from './delivery-billing';
import type {ImagegenPlan,ImagegenResult} from './types';

const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** Generation owns paid-attempt structure; model execution owns stage proof.
 * Shared by new parent classification and old batch-receipt consumption. */
export async function hasProvenImagegenRejection(paidOperations:unknown):Promise<boolean>{
 if(!record(paidOperations)||!Object.keys(paidOperations).length)return false;
 for(const [operation,attempt]of Object.entries(paidOperations)){
  if(!record(attempt)||attempt.state!=='rejected'||attempt.children!==undefined&&!record(attempt.children))return false;
  const children=record(attempt.children)?Object.entries(attempt.children):[];
  if(children.some(([,unit])=>!record(unit)||unit.state!=='rejected'))return false;
  if(!await readImageRejectionEvidence(operation,children.length?children.map(([id])=>id):[operation]))return false;
 }
 return true;
}

/** Recheck original owned facts before an automatic successor purchase. A saved
 * NOT_ACCEPTED label, a missing historical proof or a zero projected charge alone
 * is never permission. No planner, generator, mutation or supplier call lives here. */
export async function canRetryImagegen(operationId:string,owner:string):Promise<boolean>{
 if(!dbEnabled)return false;
 try{
  owner=owner.toLowerCase();const id='imagegen-'+operationId,pool=getPool();
  const parent=(await pool.query("SELECT snapshot,payload FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='imagegen'",[id,owner])).rows[0];
  if(!parent)return false;
  const snapshot=parent.snapshot,result=snapshot.result as ImagegenResult,plan=parent.payload.plan as ImagegenPlan;
  if(snapshot.status!=='error'||result?.status!=='failed'||result.operationId!==operationId||result.jobId!==id||result.error?.code!=='NOT_ACCEPTED'||result.chargedCredits!==0||result.artifacts?.length!==0)return false;
  await assertAcceptedImagegenCreationScope(parent.payload.creationScope,owner,plan.request);
  const children=Object.values(snapshot.children||{})as {state?:string;jobId?:string}[];
  if(!children.length||children.some(child=>child.state!=='submitted'||!child.jobId))return false;
  const ids=children.map(child=>child.jobId!),unique=[...new Set(ids)];if(unique.length!==ids.length)return false;
  const rows=(await pool.query("SELECT id,snapshot FROM app_image_jobs WHERE id=ANY($1::text[]) AND email=$2 AND kind='generate'",[unique,owner])).rows;
  if(rows.length!==unique.length||rows.some(row=>row.snapshot.status!=='error'||imageJobHasResults(row.snapshot)))return false;
  const billing=await readImagegenBilling(owner,snapshot.children,plan);if(!billing.confirmed||billing.chargedCredits!==0)return false;
  for(const row of rows)if(!await hasProvenImagegenRejection(row.snapshot.paidOperations))return false;
  return true;
 }catch{return false;}
}
