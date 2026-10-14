import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getPool } from '@/lib/db';
import { ensureFleetSchema, assertInstanceAccess, FleetError } from './server';
import { canonical, digest, type FleetActor } from './contracts';

const sha=z.string().regex(/^[a-f0-9]{40}$/),imageDigest=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const flavorSchema=z.object({reference:z.string().max(200),digest:imageDigest,tag:z.string().max(160),imageId:imageDigest,offline:z.object({name:z.string().max(180),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().min(1).max(2*1024**3-1)}).strict().optional()}).strict();
export const releaseManifestSchema=z.object({schemaVersion:z.literal(1),sourceCommit:sha,buildVersion:z.number().int().positive(),platform:z.literal('linux/amd64'),mediaVariants:z.literal(true),provenance:z.object({repository:z.literal('JesstLe/naumi'),workflowCommit:sha,runId:z.string().regex(/^[1-9][0-9]*$/),attempt:z.string().regex(/^[1-9][0-9]*$/)}).strict(),images:z.object({ui:flavorSchema,desktop:flavorSchema,enterprise:flavorSchema}).strict()}).strict().superRefine((manifest,context)=>{
  for(const [flavor,row] of Object.entries(manifest.images)){
    const tag='ghcr.io/jesstle/naumi:'+manifest.sourceCommit+(flavor==='ui'?'':'-'+flavor);
    if(row.reference!=='ghcr.io/jesstle/naumi@'+row.digest||row.tag!==tag||row.offline&&row.offline.name!==`naumi-${flavor}-${manifest.sourceCommit}.tar.gz`)context.addIssue({code:'custom',message:'镜像来源不匹配'});
  }
});
export const releaseRegistrationSchema=z.object({action:z.literal('release-register'),id:z.string().uuid(),sourceInstanceId:z.string().uuid(),manifest:releaseManifestSchema,evidenceSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const releasePolicySchema=z.object({action:z.literal('release-policy'),instanceId:z.string().uuid(),sourceInstanceId:z.string().uuid(),enabled:z.boolean(),expectedVersion:z.number().int().min(0)}).strict();
export const releasePlanChangeSchema=z.object({action:z.literal('release-plan-review'),planId:z.string().uuid(),decision:z.enum(['hold','resume']),expectedVersion:z.number().int().min(0)}).strict();
export function shanghaiDay(now:Date){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return {day:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour)};}
let ready:Promise<void>|undefined;
export async function ensureFleetReleaseSchema(){
  if(!ready)ready=(async()=>{await ensureFleetSchema();await getPool().query(`
    CREATE TABLE IF NOT EXISTS app_fleet_releases(id uuid PRIMARY KEY,source_instance_id uuid NOT NULL REFERENCES app_fleet_instances(id),manifest jsonb NOT NULL,fingerprint text NOT NULL,evidence_sha text NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_fleet_release_policy(instance_id uuid PRIMARY KEY REFERENCES app_fleet_instances(id),source_instance_id uuid NOT NULL REFERENCES app_fleet_instances(id),enabled boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 0,actor text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_fleet_release_plans(id uuid PRIMARY KEY,instance_id uuid NOT NULL REFERENCES app_fleet_instances(id),release_id uuid NOT NULL REFERENCES app_fleet_releases(id),local_day date NOT NULL,base_source text NOT NULL,base_version text NOT NULL,state text NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','held','preparing','ready','accepted','failed','blocked')),checks jsonb NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(instance_id,local_day));
    ALTER TABLE app_fleet_release_plans ADD COLUMN IF NOT EXISTS lease_id uuid;
    ALTER TABLE app_fleet_release_plans ADD COLUMN IF NOT EXISTS leased_until timestamptz;
  `);})().catch(error=>{ready=undefined;throw error;});await ready;
}
export async function registerRelease(actor:string,raw:z.infer<typeof releaseRegistrationSchema>){
  const input=releaseRegistrationSchema.parse(raw);await ensureFleetReleaseSchema();const tx=await getPool().connect(),fingerprint=digest(canonical(input));
  try{await tx.query('BEGIN');await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[input.id]);
    const previous=await tx.query('SELECT fingerprint FROM app_fleet_releases WHERE id=$1',[input.id]);if(previous.rowCount){if(previous.rows[0].fingerprint!==fingerprint)throw new FleetError('发布记录已冻结',409);await tx.query('COMMIT');return {id:input.id,replayed:true};}
    const source=(await tx.query('SELECT * FROM app_fleet_instances WHERE id=$1 FOR UPDATE',[input.sourceInstanceId])).rows[0];
    if(!source||source.kind!=='main'||!source.enabled||!source.last_seen||Math.abs(Date.now()-new Date(source.last_seen).getTime())>120000)throw new FleetError('主站状态未确认',409);
    if(source.status.source!==input.manifest.sourceCommit||String(source.status.version)!==String(input.manifest.buildVersion))throw new FleetError('候选与主站实际运行版本不一致',409);
    await tx.query('INSERT INTO app_fleet_releases(id,source_instance_id,manifest,fingerprint,evidence_sha,actor) VALUES($1,$2,$3,$4,$5,$6)',[input.id,input.sourceInstanceId,JSON.stringify(input.manifest),fingerprint,input.evidenceSha256,actor]);
    await tx.query("INSERT INTO app_fleet_audit(instance_id,actor,action) VALUES($1,$2,$3)",[input.sourceInstanceId,actor,'release-accepted:'+input.id]);await tx.query('COMMIT');return {id:input.id,replayed:false};
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
export async function saveReleasePolicy(actor:FleetActor,raw:z.infer<typeof releasePolicySchema>){
  const input=releasePolicySchema.parse(raw);await ensureFleetReleaseSchema();const tx=await getPool().connect();
  try{await tx.query('BEGIN');
    const target=(await tx.query('SELECT kind FROM app_fleet_instances WHERE id=$1 FOR UPDATE',[input.instanceId])).rows[0];
    await assertInstanceAccess(tx,actor,input.instanceId,'release');
    const source=(await tx.query('SELECT kind FROM app_fleet_instances WHERE id=$1',[input.sourceInstanceId])).rows[0];if(target?.kind!=='enterprise'||source?.kind!=='main'||input.instanceId===input.sourceInstanceId)throw new FleetError('发布跟随实例无效');
    const current=(await tx.query('SELECT version FROM app_fleet_release_policy WHERE instance_id=$1 FOR UPDATE',[input.instanceId])).rows[0];if((current?.version||0)!==input.expectedVersion)throw new FleetError('发布策略已更新',409);
    await tx.query('INSERT INTO app_fleet_release_policy(instance_id,source_instance_id,enabled,version,actor) VALUES($1,$2,$3,$4,$5) ON CONFLICT(instance_id) DO UPDATE SET source_instance_id=excluded.source_instance_id,enabled=excluded.enabled,version=excluded.version,actor=excluded.actor,updated_at=now()',[input.instanceId,input.sourceInstanceId,input.enabled,input.expectedVersion+1,actor.actor]);
    await tx.query('INSERT INTO app_fleet_audit(instance_id,actor,action) VALUES($1,$2,$3)',[input.instanceId,actor.actor,'release-policy:'+String(input.enabled)]);await tx.query('COMMIT');return {version:input.expectedVersion+1};
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
/** Creates frozen plans, never deploys, connects SSH or modifies business data. */
export async function planNightlyReleases(now=new Date()){
  await ensureFleetReleaseSchema();const {day,hour}=shanghaiDay(now);if(hour<20)return {created:0,skipped:0,reason:'before-window'};
  const tx=await getPool().connect();let created=0,skipped=0;
  try{await tx.query('BEGIN');await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['fleet-nightly:'+day]);
    const policies=(await tx.query('SELECT p.*,i.status,i.enabled AS target_enabled FROM app_fleet_release_policy p JOIN app_fleet_instances i ON i.id=p.instance_id WHERE p.enabled ORDER BY p.instance_id')).rows;
    for(const policy of policies){
      if(!policy.target_enabled){skipped++;continue;}
      if((await tx.query("SELECT 1 FROM app_fleet_release_plans WHERE instance_id=$1 AND (state='preparing' OR state='blocked' AND lease_id IS NOT NULL) LIMIT 1",[policy.instance_id])).rowCount){skipped++;continue;}
      const source=(await tx.query('SELECT * FROM app_fleet_instances WHERE id=$1',[policy.source_instance_id])).rows[0];
      if(!source?.enabled||!source.last_seen||now.getTime()-new Date(source.last_seen).getTime()>120000||now.getTime()<new Date(source.last_seen).getTime()-120000){skipped++;continue;}
      const release=(await tx.query("SELECT * FROM app_fleet_releases WHERE source_instance_id=$1 AND manifest->>'sourceCommit'=$2 AND manifest->>'buildVersion'=$3 ORDER BY created_at DESC,id LIMIT 1",[policy.source_instance_id,source.status.source,String(source.status.version)])).rows[0];
      if(!release||policy.status.source===source.status.source&&String(policy.status.version)===String(source.status.version)){skipped++;continue;}
      const inserted=await tx.query("INSERT INTO app_fleet_release_plans(id,instance_id,release_id,local_day,base_source,base_version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(instance_id,local_day) DO NOTHING RETURNING id",[randomUUID(),policy.instance_id,release.id,day,policy.status.source||'unknown',policy.status.version||'unknown']);
      if(inserted.rowCount){created++;await tx.query('INSERT INTO app_fleet_audit(instance_id,actor,action) VALUES($1,$2,$3)',[policy.instance_id,'scheduler','release-planned:'+inserted.rows[0].id]);}else skipped++;
    }
    await tx.query('COMMIT');return {created,skipped,reason:'window'};
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
export async function reviewReleasePlan(actor:FleetActor,raw:z.infer<typeof releasePlanChangeSchema>){
  const input=releasePlanChangeSchema.parse(raw);await ensureFleetReleaseSchema();const tx=await getPool().connect();
  try{await tx.query('BEGIN');const plan=(await tx.query('SELECT * FROM app_fleet_release_plans WHERE id=$1 FOR UPDATE',[input.planId])).rows[0];if(!plan)throw new FleetError('发布计划不存在',404);await assertInstanceAccess(tx,actor,plan.instance_id,'release');if(plan.version!==input.expectedVersion||!['planned','held'].includes(plan.state))throw new FleetError('发布状态已变化',409);
    const state=input.decision==='hold'?'held':'planned';await tx.query('UPDATE app_fleet_release_plans SET state=$2,version=version+1 WHERE id=$1',[input.planId,state]);await tx.query('INSERT INTO app_fleet_audit(instance_id,actor,action) VALUES($1,$2,$3)',[plan.instance_id,actor.actor,'release-plan:'+state]);await tx.query('COMMIT');return {state,version:plan.version+1};
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
export async function releaseSnapshot(actor:FleetActor){
  await ensureFleetReleaseSchema();const email=actor.root?null:actor.actor;
  const scope="($1::text IS NULL OR EXISTS(SELECT 1 FROM app_fleet_grants g WHERE g.instance_id=p.instance_id AND g.email=$1 AND g.allowed ? 'read' AND (g.expires_at IS NULL OR g.expires_at>now())))";
  const [policies,plans,releases]=await Promise.all([getPool().query('SELECT p.* FROM app_fleet_release_policy p WHERE '+scope,[email]),getPool().query('SELECT p.*,r.manifest,r.evidence_sha FROM app_fleet_release_plans p JOIN app_fleet_releases r ON r.id=p.release_id WHERE '+scope+' ORDER BY p.created_at DESC LIMIT 100',[email]),actor.root?getPool().query('SELECT * FROM app_fleet_releases ORDER BY created_at DESC LIMIT 50'):Promise.resolve({rows:[]})]);
  const sources=await getPool().query("SELECT id,name,kind FROM app_fleet_instances WHERE kind='main' AND enabled ORDER BY created_at LIMIT 20");
  return {policies:policies.rows,plans:plans.rows,releases:releases.rows,sources:sources.rows,timeZone:'Asia/Shanghai',hour:20,executorEnabled:process.env.FLEET_RELEASE_DISPATCH_ENABLED==='1'};
}
export async function leaseRelease(instanceId:string,expectedTokenHash?:string){
  if(process.env.FLEET_RELEASE_DISPATCH_ENABLED!=='1')return null;
  const {releaseSigningKey}=await import('./release-keys');const signingKey=await releaseSigningKey();
  if(!signingKey)throw new FleetError('发布签名密钥未配置',503);
  await ensureFleetReleaseSchema();const tx=await getPool().connect();
  try{await tx.query('BEGIN');const target=(await tx.query('SELECT * FROM app_fleet_instances WHERE id=$1 FOR UPDATE',[instanceId])).rows[0];if(!target?.enabled||target.kind!=='enterprise'||expectedTokenHash&&target.token_hash!==expectedTokenHash){await tx.query('COMMIT');return null;}
    if((await tx.query("SELECT 1 FROM app_fleet_release_plans WHERE instance_id=$1 AND state='blocked' AND lease_id IS NOT NULL LIMIT 1",[instanceId])).rowCount){await tx.query('COMMIT');return null;}
    const row=(await tx.query("SELECT p.*,r.manifest,r.source_instance_id FROM app_fleet_release_plans p JOIN app_fleet_releases r ON r.id=p.release_id WHERE p.instance_id=$1 AND p.state IN ('planned','preparing') ORDER BY p.created_at LIMIT 1 FOR UPDATE OF p",[instanceId])).rows[0];if(!row){await tx.query('COMMIT');return null;}
    if(row.state==='preparing'){if(row.leased_until&&new Date(row.leased_until).getTime()<Date.now()){await tx.query("UPDATE app_fleet_release_plans SET state='blocked',checks=$2,version=version+1 WHERE id=$1",[row.id,JSON.stringify({code:'UNKNOWN'})]);await tx.query('COMMIT');return null;}await tx.query('COMMIT');return row.checks?.envelope||null;}
    const source=(await tx.query('SELECT * FROM app_fleet_instances WHERE id=$1',[row.source_instance_id])).rows[0],policy=(await tx.query('SELECT enabled FROM app_fleet_release_policy WHERE instance_id=$1',[instanceId])).rows[0];
    if(!policy?.enabled||!source?.enabled||!source.last_seen||Math.abs(Date.now()-new Date(source.last_seen).getTime())>120000||source.status.source!==row.manifest.sourceCommit||String(source.status.version)!==String(row.manifest.buildVersion)){await tx.query("UPDATE app_fleet_release_plans SET state='held',checks=$2,version=version+1 WHERE id=$1",[row.id,JSON.stringify({code:'SOURCE_CHANGED'})]);await tx.query('COMMIT');return null;}
    if(target.status.source!==row.base_source||String(target.status.version)!==row.base_version||!/^[a-f0-9]{40}$/.test(row.base_source)||!/^[0-9]+$/.test(row.base_version)){await tx.query("UPDATE app_fleet_release_plans SET state='blocked',checks=$2,version=version+1 WHERE id=$1",[row.id,JSON.stringify({code:'BASELINE_CHANGED'})]);await tx.query('COMMIT');return null;}
    const leaseId=randomUUID(),expiresAt=Date.now()+300000;
    const {signRelease}=await import('./release-wire');const envelope=signRelease({id:row.id,instanceId,leaseId,expiresAt,baseSource:row.base_source,baseVersion:row.base_version,manifest:row.manifest},signingKey);
    await tx.query("UPDATE app_fleet_release_plans SET state='preparing',lease_id=$2,leased_until=$3,checks=$4,version=version+1 WHERE id=$1",[row.id,leaseId,new Date(expiresAt),JSON.stringify({envelope})]);
    await tx.query("INSERT INTO app_fleet_audit(instance_id,actor,action) VALUES($1,'release-dispatch',$2)",[instanceId,'release-leased:'+row.id]);await tx.query('COMMIT');
    return envelope;
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
export async function recordReleaseResult(instanceId:string,raw:unknown,expectedTokenHash?:string){
  const {releaseResultSchema}=await import('./release-wire');const result=releaseResultSchema.parse(raw);await ensureFleetReleaseSchema();const tx=await getPool().connect();
  try{await tx.query('BEGIN');if(expectedTokenHash){const target=(await tx.query('SELECT token_hash,enabled FROM app_fleet_instances WHERE id=$1 FOR SHARE',[instanceId])).rows[0];if(!target?.enabled||target.token_hash!==expectedTokenHash)throw new FleetError('实例认证失败',401);}const plan=(await tx.query('SELECT p.*,r.manifest FROM app_fleet_release_plans p JOIN app_fleet_releases r ON r.id=p.release_id WHERE p.id=$1 AND p.instance_id=$2 FOR UPDATE OF p',[result.planId,instanceId])).rows[0];if(!plan)throw new FleetError('发布计划不存在',404);
    if(plan.lease_id!==result.leaseId)throw new FleetError('发布租约不匹配',409);
    if(['accepted','failed'].includes(plan.state)){if(canonical(plan.checks)!==canonical(result))throw new FleetError('发布结果冲突',409);await tx.query('COMMIT');return {ok:true,replayed:true};}
    if(plan.state==='blocked'&&canonical(plan.checks)===canonical(result)){await tx.query('COMMIT');return {ok:true,replayed:true};}
    if(!['preparing','blocked'].includes(plan.state))throw new FleetError('发布状态无效',409);
    if(result.state==='accepted'&&(result.code!=='OK'||result.source!==plan.manifest.sourceCommit||result.version!==String(plan.manifest.buildVersion)||!result.evidenceSha))throw new FleetError('发布验收证据不匹配',409);
    await tx.query('UPDATE app_fleet_release_plans SET state=$2,checks=$3,version=version+1 WHERE id=$1',[plan.id,result.state,JSON.stringify(result)]);await tx.query("INSERT INTO app_fleet_audit(instance_id,actor,action) VALUES($1,'release-connector',$2)",[instanceId,'release-result:'+result.state]);await tx.query('COMMIT');return {ok:true,replayed:false};
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
