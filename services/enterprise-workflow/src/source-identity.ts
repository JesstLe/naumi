import { createPublicKey,verify,randomUUID,type KeyObject } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Pool,PoolClient } from 'pg';
import { z } from 'zod';
import { id,WorkflowError,type Principal } from './contracts';
import { resolveDatabaseActor } from './identity';
const instance=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/),subject=z.string().trim().min(1).max(254);
export const sourceIdentitySchema=z.strictObject({sourceInstance:instance,sourceEnterprise:id,sourceSubject:subject,teamId:id.optional()});
export type SourceIdentity=z.infer<typeof sourceIdentitySchema>;
const claims=sourceIdentitySchema.extend({iss:z.string(),aud:z.string(),iat:z.number().int(),exp:z.number().int(),jti:id});
function ensure(v:unknown,code:string,status=403):asserts v {if(!v)throw new WorkflowError(status,code);}
export function createSourceVerifier(options:{issuer:string;audience:string;publicKeys:Record<string,string|KeyObject>;now?:()=>number}){
 ensure(options.issuer&&options.audience&&Object.keys(options.publicKeys).length,'SOURCE_TRUST_REQUIRED',503);
 const keys=new Map(Object.entries(options.publicKeys).map(([id,value])=>{const key=typeof value==='string'?createPublicKey(value):value;ensure(key.type==='public'&&key.asymmetricKeyType==='ed25519','ED25519_PUBLIC_KEY_REQUIRED',503);return [id,key];}));
 return async(req:IncomingMessage):Promise<SourceIdentity|null>=>{try{
  const auth=req.headers.authorization;if(!auth?.startsWith('Bearer ')||auth.length>8192)return null;const parts=auth.slice(7).split('.');if(parts.length!==3||parts.some(p=>!/^[A-Za-z0-9_-]+$/.test(p)))return null;
  const h=z.strictObject({alg:z.literal('EdDSA'),typ:z.literal('JWT'),kid:z.string().min(1).max(80)}).parse(JSON.parse(Buffer.from(parts[0],'base64url').toString()));
  const key=keys.get(h.kid);if(!key||!verify(null,Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url')))return null;
  const c=claims.parse(JSON.parse(Buffer.from(parts[1],'base64url').toString())),now=Math.floor((options.now?.()??Date.now())/1000);
  if(c.iss!==options.issuer||c.aud!==options.audience||c.iat>now||c.exp<=now||c.exp<=c.iat||c.exp-c.iat>60)return null;
  return {sourceInstance:c.sourceInstance,sourceEnterprise:c.sourceEnterprise,sourceSubject:c.sourceSubject,...(c.teamId?{teamId:c.teamId}:{})};
 }catch{return null;}};
}
export type SourceAuthenticate=ReturnType<typeof createSourceVerifier>;
export class SourceIdentityStore {
 constructor(readonly pool:Pool){}
 private async transaction<T>(run:(tx:PoolClient)=>Promise<T>){const tx=await this.pool.connect();try{await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'");const r=await run(tx);await tx.query('COMMIT');return r;}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}}
 private async binding(tx:PoolClient,input:SourceIdentity){
  const s=sourceIdentitySchema.parse(input);const row=(await tx.query(`SELECT i.enterprise_id,i.subject FROM enterprise_workflow.source_identities i JOIN enterprise_workflow.source_enterprises e USING(source_instance,source_enterprise,enterprise_id) JOIN enterprise_workflow.accounts a ON a.enterprise_id=i.enterprise_id AND a.subject=i.subject WHERE i.source_instance=$1 AND i.source_enterprise=$2 AND i.source_subject=$3 AND i.enabled AND e.enabled AND a.enabled AND (a.expires_at IS NULL OR a.expires_at>now()) FOR SHARE OF i,e,a`,[s.sourceInstance,s.sourceEnterprise,s.sourceSubject])).rows[0];
  ensure(row,'SOURCE_IDENTITY_NOT_BOUND');return row as {enterprise_id:string;subject:string};
 }
 async workspaces(source:SourceIdentity){return this.transaction(async tx=>{const b=await this.binding(tx,source),teams=(await tx.query(`SELECT m.team_id FROM enterprise_workflow.team_members m JOIN enterprise_workflow.teams t USING(enterprise_id,team_id) WHERE m.enterprise_id=$1 AND m.subject=$2 AND m.enabled AND t.enabled AND (m.expires_at IS NULL OR m.expires_at>now()) ORDER BY m.team_id`,[b.enterprise_id,b.subject])).rows;const visible=[];
  for(const t of teams){const p={enterpriseId:b.enterprise_id,subject:b.subject,teamId:t.team_id};const actor=await resolveDatabaseActor(tx,p);if(actor)visible.push({teamId:t.team_id,permissions:actor.permissions,workKinds:actor.workKinds});}
  return {enterpriseId:b.enterprise_id,subject:b.subject,teams:visible};});}
 async principal(source:SourceIdentity):Promise<Principal>{return this.transaction(async tx=>{ensure(source.teamId,'TEAM_REQUIRED',400);const b=await this.binding(tx,source),p={enterpriseId:b.enterprise_id,subject:b.subject,teamId:source.teamId,sourceBinding:{sourceInstance:source.sourceInstance,sourceEnterprise:source.sourceEnterprise,sourceSubject:source.sourceSubject}};ensure(await resolveDatabaseActor(tx,p),'MEMBERSHIP_REQUIRED');return p;});}
 /** Explicit provisioning command, not exposed as a public HTTP/bootstrap endpoint. */
 async configure(principal:Principal,input:unknown){
  const common={sourceInstance:instance,sourceEnterprise:id,expectedVersion:z.number().int().nonnegative(),enabled:z.boolean(),reason:z.string().trim().min(1).max(200)};
  const c=z.discriminatedUnion('type',[z.strictObject({...common,type:z.literal('enterprise')}),z.strictObject({...common,type:z.literal('identity'),sourceSubject:subject,subject})]).parse(input);
  return this.transaction(async tx=>{const actor=await resolveDatabaseActor(tx,principal);ensure(actor?.permissions.includes('manage'),'FORBIDDEN');
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`identity:${c.sourceInstance}:${c.sourceEnterprise}`]);
   const source=(await tx.query('SELECT * FROM enterprise_workflow.source_enterprises WHERE source_instance=$1 AND source_enterprise=$2 FOR UPDATE',[c.sourceInstance,c.sourceEnterprise])).rows[0];
   ensure(!source||source.enterprise_id===principal.enterpriseId,'SOURCE_ALREADY_BOUND',409);
   let version:number;
   if(c.type==='enterprise'){
    ensure((source?.version??0)===c.expectedVersion,'VERSION_CONFLICT',409);version=c.expectedVersion+1;
    await tx.query(`INSERT INTO enterprise_workflow.source_enterprises(source_instance,source_enterprise,enterprise_id,enabled,version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_instance,source_enterprise) DO UPDATE SET enabled=EXCLUDED.enabled,version=EXCLUDED.version`,[c.sourceInstance,c.sourceEnterprise,principal.enterpriseId,c.enabled,version]);
   }else{
    ensure(source?.enabled,'SOURCE_NOT_ENABLED');
    // Team-local manager cannot bind a person outside their managed team.
    ensure(await resolveDatabaseActor(tx,{enterpriseId:principal.enterpriseId,teamId:principal.teamId,subject:c.subject}),'TARGET_MEMBERSHIP_REQUIRED');
    const prior=(await tx.query('SELECT * FROM enterprise_workflow.source_identities WHERE source_instance=$1 AND source_enterprise=$2 AND source_subject=$3 FOR UPDATE',[c.sourceInstance,c.sourceEnterprise,c.sourceSubject])).rows[0];
    ensure((prior?.version??0)===c.expectedVersion,'VERSION_CONFLICT',409);ensure(!prior||prior.subject===c.subject,'REBIND_REQUIRES_EXPLICIT_MIGRATION',409);version=c.expectedVersion+1;
    await tx.query(`INSERT INTO enterprise_workflow.source_identities(source_instance,source_enterprise,enterprise_id,source_subject,subject,enabled,version) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(source_instance,source_enterprise,source_subject) DO UPDATE SET enabled=EXCLUDED.enabled,version=EXCLUDED.version`,[c.sourceInstance,c.sourceEnterprise,principal.enterpriseId,c.sourceSubject,c.subject,c.enabled,version]);
   }
   await tx.query('INSERT INTO enterprise_workflow.identity_binding_audit(id,enterprise_id,actor,operation,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),principal.enterpriseId,principal.subject,c.type,{...c,version}]);return {version};
  });
 }
}
export function createMappedAuthenticator(store:SourceIdentityStore,authenticate:SourceAuthenticate){return async(req:IncomingMessage)=>{const identity=await authenticate(req);return identity?store.principal(identity):null;};}
