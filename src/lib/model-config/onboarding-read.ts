import 'server-only';
import {createHash,createHmac} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {checkReadClientSocket,withOwnedReportClient} from '@/platform/db/owned-read-client';
import {getPool} from '@/platform/db/pool';
import {readPublishedBillingConfig} from '../billing/catalog';
import {settingsSecret} from '../settings-secret';
import {modelTrustedOrigins} from './environment';
import {readPublishedModelSnapshot} from './published-repository';
import {decodeModelSnapshot} from './snapshot-value';
import {draftUpstreamFromRow,draftPublicModelFromRow,type DraftUpstreamRow,type DraftPublicModelRow} from './draft-row-values';
import {onboardingDraftEntries} from './onboarding';
import {ModelConfigError,type ModelConfig,type ModelSnapshot} from './types';
import type {OnboardingDraft} from './onboarding-contract';

export function onboardingDraftOwner(operator:string,version:number){
 const prefix=operator.slice(0,140)+'#model-onboarding:'+createHash('sha256').update(operator).digest('hex').slice(0,16)+':';
 return {prefix,actor:prefix+version};
}
export function emptyOnboardingDraftId(actor:string){
 const bytes=createHmac('sha256',settingsSecret()).update('model-onboarding-draft:'+actor).digest().subarray(0,16);
 bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128; // UUID v8, RFC variant.
 const id=bytes.toString('hex');return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`;
}

export type OnboardingReadPorts={pool:Pool;model:(tx:PoolClient)=>Promise<ModelSnapshot|null>;billingVersion:(tx:PoolClient)=>Promise<number>;trustedOrigins:readonly string[]};
export function publishedOnboardingRead():OnboardingReadPorts{
 const trustedOrigins=modelTrustedOrigins();
 return {pool:getPool(),trustedOrigins,model:tx=>readPublishedModelSnapshot(tx,{trustedOrigins}),billingVersion:async tx=>(await readPublishedBillingConfig(tx)).version};
}
type Row={id:string;revision:string;based_on_version:string;digest:string;base_config:unknown;publics:DraftPublicModelRow[];upstreams:DraftUpstreamRow[];business:ModelConfig['business']|null};
async function draftRows(tx:PoolClient,owner:{prefix:string;actor:string},history:boolean){
 // Limit before touching any child table. Only project fields consumed by the wizard.
 const scope=history?`left(actor,length($1))=$1 AND actor<>$2 ORDER BY updated_at DESC,id LIMIT 5`:`actor=$1`;
 return (await tx.query<Row>(`WITH selected AS MATERIALIZED (SELECT id,revision,based_on_version,updated_at FROM app_model_drafts WHERE ${scope})
  SELECT d.id,d.revision,d.based_on_version,v.digest,v.config AS base_config,b.config AS business,
    COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.position,p.id) FROM app_model_public_models p WHERE p.draft_id=d.id),'[]') AS publics,
    COALESCE((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.position,u.id) FROM app_model_upstreams u WHERE u.draft_id=d.id),'[]') AS upstreams
  FROM selected d JOIN app_model_config_versions v ON v.version=d.based_on_version
  LEFT JOIN app_model_business b ON b.draft_id=d.id ORDER BY d.updated_at DESC,d.id`,history?[owner.prefix,owner.actor]:[owner.actor])).rows;
}
export function readOnboardingDraft(ports:OnboardingReadPorts,operator:string,signal:AbortSignal):Promise<OnboardingDraft>{
 return withOwnedReportClient(ports.pool,async tx=>{
  await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='3s'"+checkReadClientSocket);
  const snapshot=await ports.model(tx);
  if(!snapshot)throw new ModelConfigError('CONFIG_UNAVAILABLE','模型配置暂时不可用，请稍后重试',503);
  const billingVersion=await ports.billingVersion(tx),owner=onboardingDraftOwner(operator,snapshot.version);
  const [current]=await draftRows(tx,owner,false);
  const entriesFor=(row:Row)=>{
   const base=Number(row.based_on_version)===snapshot.version?snapshot:decodeModelSnapshot({version:row.based_on_version,digest:row.digest,config:row.base_config},{trustedOrigins:ports.trustedOrigins});
   return onboardingDraftEntries({publicModels:row.publics.map(draftPublicModelFromRow),upstreamModels:row.upstreams.map(draftUpstreamFromRow),business:row.business??undefined},base.config);
  };
  let entries=current?entriesFor(current):[],recoveredFromVersion:number|undefined;
  if(!entries.length){
   const activeIds=new Set(snapshot.config.publicModels.map(m=>m.id));
   for(const row of await draftRows(tx,owner,true)){
    const available=entriesFor(row).filter(e=>!activeIds.has(e.publicId));
    if(available.length){entries=available;recoveredFromVersion=Number(row.based_on_version);break;}
   }
  }
  await tx.query('COMMIT');
  return {id:current?.id??emptyOnboardingDraftId(owner.actor),revision:Number(current?.revision??1),basedOnVersion:Number(current?.based_on_version??snapshot.version),billingVersion,entries,...(recoveredFromVersion?{recoveredFromVersion}:{})};
 },signal);
}
