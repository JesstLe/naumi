import 'server-only';
import {enterpriseCreationProjectionRead,enterpriseCreationRead} from '../server';
import {creationLedger} from '../analytics';
import {queryBi,queryEnterpriseOperations} from "@/lib/bi/repository";
import {ensureBiSchema} from "@/lib/bi/schema";

import {parseBiQuery} from '@/lib/bi/contracts';
import type {BiRow} from '@/lib/bi/contracts';
import {normalizeRecord} from './normalize';
import {assertEnterpriseAllowed,IntegrationError} from './policy';
import type {DeploymentPolicy,IntegratedRecord,RecordKind,RecordQuery} from './contracts';
import type {SourceRef} from '../../../../services/enterprise-workflow/src/contracts';

/** Read side only. The caller supplies a verified native login, not a browser role or arbitrary upstream URL. */
export class CreationAdapter{
 constructor(private email:string,readonly policy:DeploymentPolicy){}
 private check(ref:SourceRef){assertEnterpriseAllowed(this.policy,ref.enterpriseId);if(ref.instanceId!==this.policy.sourceInstanceId)throw new IntegrationError('SOURCE_INSTANCE_MISMATCH',409);}
 async records(input:RecordQuery,ref?:SourceRef){
  assertEnterpriseAllowed(this.policy,input.enterpriseId);if(ref){this.check(ref);if(ref.enterpriseId!==input.enterpriseId)throw new IntegrationError('SOURCE_REF_MISMATCH',400);}
  let q:ReturnType<typeof parseBiQuery>;try{q=parseBiQuery(new URLSearchParams({section:input.kind==='artworks'?'artworks':input.kind==='ledger'?'ledger':'operations',...(input.from?{from:input.from}:{}),...(input.to?{to:input.to}:{}),email:input.email||'',page:String(input.page||1),size:String(input.size||20)}));}catch{throw new IntegrationError('INVALID_SOURCE_QUERY',400);}
  await ensureBiSchema();const data=await enterpriseCreationProjectionRead(this.email,input.enterpriseId,async(tx,s)=>{
   if(q.email&&!s.visible.has(q.email))throw new IntegrationError('SOURCE_RECORD_NOT_VISIBLE',404);
   if(input.kind==='ledger')return creationLedger(tx,[...s.visible],{...q,...(ref?{recordId:ref.id}:{})});
   const access={client:tx,allowedEmails:[...s.visible]};
   const result=input.kind==='artworks'?await queryBi({...q,...(ref?{recordId:ref.id}:{})},access):await queryEnterpriseOperations(q,access,ref&&['image-job','canvas-task','video-task'].includes(ref.kind)?{kind:ref.kind as 'image-job'|'canvas-task'|'video-task',id:ref.id}:undefined);
   const names=(await tx.query('SELECT email,name FROM app_users WHERE email=ANY($1::text[])',[result.rows.map(r=>String(r.email))])).rows;return {...result,rows:result.rows.map(r=>({...r,name:names.find(n=>n.email===r.email)?.name??null}))};
  });
  const rows=data.rows.map(r=>normalizeRecord(this.policy.sourceInstanceId,input.enterpriseId,input.kind,r as BiRow));
  return {rows,total:data.total,page:data.page,size:data.size,instanceId:this.policy.sourceInstanceId,enterpriseId:input.enterpriseId,kind:input.kind,generatedAt:new Date().toISOString(),ownership:'current-membership-not-historical-ownership'};
 }
 async record(ref:SourceRef):Promise<IntegratedRecord>{
  this.check(ref);const kind:RecordKind=ref.kind==='artwork'?'artworks':ref.kind==='ledger'?'ledger':'generations';const page=await this.records({enterpriseId:ref.enterpriseId,kind,size:1},ref);
  const r=page.rows.find(r=>r.ref.id===ref.id&&r.ref.kind===ref.kind);if(!r)throw new IntegrationError('SOURCE_RECORD_NOT_VISIBLE',404);return r;
 }
 async media(ref:SourceRef){this.check(ref);if(ref.kind!=='artwork')throw new IntegrationError('SOURCE_MEDIA_NOT_FOUND',404);
  return enterpriseCreationRead(this.email,ref.enterpriseId,async(tx,s)=>{const row=(await tx.query('SELECT image_url FROM app_artworks WHERE id=$1 AND email=ANY($2::text[]) AND deleted_at IS NULL',[ref.id,[...s.visible]])).rows[0];if(!row?.image_url)throw new IntegrationError('SOURCE_MEDIA_NOT_FOUND',404);return String(row.image_url);});
 }
}

/** Never add operation quoted/charged fields to ledger deltas; they may describe the same debit. */
export function linkedLedgerSummary(rows:IntegratedRecord[],unavailable:number){
 const unique=new Map(rows.filter(r=>r.ref.kind==='ledger').map(r=>[JSON.stringify([r.ref.instanceId,r.ref.enterpriseId,r.ref.kind,r.ref.id]),r]));
 let consumed=0,refunded=0,other=0;for(const r of unique.values()){if(r.ledgerKind==='consume'&&r.credits.delta!==null&&r.credits.delta<0)consumed-=r.credits.delta;else if(r.ledgerKind==='refund'&&r.credits.delta!==null&&r.credits.delta>0)refunded+=r.credits.delta;else other++;}
 return {consumed,refunded,net:consumed-refunded,ledgerCount:unique.size,otherEvents:other,unavailable,scope:'explicit-linked-ledger-only',complete:false,exclusiveTaskCost:false};
}
