import {createPrivateKey,createPublicKey,timingSafeEqual} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {protectedFile,requireRuntime,databaseIdentity,sha,RuntimeError,type RuntimeConfig,type RuntimeBundle} from './runtime-config';
import {runtimePool,checkRuntimeDatabase} from './runtime-database';

const schema=z.strictObject({
 version:z.literal(1),NAUMI_ENTERPRISE_PUBLIC_ORIGIN:z.string(),productFile:z.string(),DATABASE_URL:z.string(),
 NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID:z.string(),NAUMI_ENTERPRISE_DEPLOYMENT_MODE:z.enum(['shared','dedicated']),
 NAUMI_ENTERPRISE_ALLOWED_IDS:z.string(),NAUMI_WORKFLOW_SERVICE_URL:z.string(),
 NAUMI_WORKFLOW_SIGNING_KID:z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/),NAUMI_WORKFLOW_SIGNING_KEY:z.string().max(2000),
});
export async function compositionPlan(path:string,c:RuntimeConfig,b:RuntimeBundle){
 const parsed=schema.safeParse(JSON.parse((await protectedFile(path,65536)).toString('utf8')));requireRuntime(parsed.success,'WEB_COMPOSITION_CONFIG_INVALID');const w=parsed.data;
 let publicUrl:URL,service:URL;try{publicUrl=new URL(w.NAUMI_ENTERPRISE_PUBLIC_ORIGIN);service=new URL(w.NAUMI_WORKFLOW_SERVICE_URL);}catch{throw new RuntimeError('WEB_COMPOSITION_ORIGIN_INVALID');}
 requireRuntime(!publicUrl.username&&!publicUrl.password&&!publicUrl.search&&!publicUrl.hash&&publicUrl.pathname==='/'&&(publicUrl.protocol==='https:'||publicUrl.protocol==='http:'&&['127.0.0.1','[::1]'].includes(publicUrl.hostname)),'WEB_COMPOSITION_ORIGIN_INVALID');
 requireRuntime(service.origin===`http://127.0.0.1:${c.apiPort}`&&service.pathname==='/'&&!service.username&&!service.password&&!service.search&&!service.hash,'WEB_RUNTIME_API_MISMATCH');
 requireRuntime(publicUrl.origin!==service.origin&&publicUrl.origin!==`http://127.0.0.1:${c.workerPort}`,'WEB_RUNTIME_PORT_COLLISION');
 requireRuntime(w.NAUMI_ENTERPRISE_DEPLOYMENT_MODE===c.deploymentMode,'WEB_DEPLOYMENT_MODE_MISMATCH');
 const tenants=c.tenants.filter(t=>t.sourceInstance===w.NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID);requireRuntime(tenants.length>0,'WEB_SOURCE_INSTANCE_MISMATCH');
 const ids=w.NAUMI_ENTERPRISE_ALLOWED_IDS.split(',').map(x=>x.trim()).filter(Boolean);
 requireRuntime(ids.length===tenants.length&&new Set(ids).size===ids.length&&ids.every(id=>tenants.some(t=>t.sourceEnterprise===id)),'WEB_ENTERPRISE_SET_MISMATCH');
 const source=databaseIdentity(w.DATABASE_URL),target=databaseIdentity(c.databaseUrl);
 const host=(v:string)=>['localhost','127.0.0.1','[::1]'].includes(v)?'loopback':v.toLowerCase();
 requireRuntime(!(source.name===target.name&&source.port===target.port&&host(source.host)===host(target.host)),'WEB_WORKFLOW_DATABASE_MUST_DIFFER');
 let actual:Buffer,expected:Buffer;try{const key=createPrivateKey(w.NAUMI_WORKFLOW_SIGNING_KEY);requireRuntime(key.asymmetricKeyType==='ed25519','WEB_SIGNING_KEY_INVALID');actual=createPublicKey(key).export({format:'der',type:'spki'});expected=createPublicKey(c.publicKeys[w.NAUMI_WORKFLOW_SIGNING_KID]||'').export({format:'der',type:'spki'});}catch{throw new RuntimeError('WEB_SIGNING_KEY_INVALID');}
 requireRuntime(actual.length===expected.length&&timingSafeEqual(actual,expected),'WEB_SIGNING_KEY_MISMATCH');
 requireRuntime(isAbsolute(w.productFile),'WEB_PRODUCT_ABSOLUTE_PATH_REQUIRED');const stat=await lstat(w.productFile);requireRuntime(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<4*1024*1024,'WEB_PRODUCT_FILE_INVALID');requireRuntime(sha(await readFile(w.productFile))===b.productSha256,'WEB_PRODUCT_ARTIFACT_MISMATCH');
 // No keys, connection URLs, or account identifiers are returned to the operator log.
 return {web:w,summary:{version:1,installationId:c.installationId,slot:c.slot,releaseId:b.releaseId,productSha256:b.productSha256,deploymentMode:c.deploymentMode,sourceInstance:w.NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID,configuredEnterprises:tenants.length,keyPairMatched:true,databaseEndpointsDistinct:true,productMatched:true,liveProbe:false,sourceSessionVerification:'external-login-probe-required'}};
}
export async function compositionCheck(path:string,c:RuntimeConfig,b:RuntimeBundle){
 const {web,summary}=await compositionPlan(path,c,b),runtime=runtimePool(c.databaseUrl),source=runtimePool(web.DATABASE_URL);
 let tx:PoolClient|undefined,transactionOpen=false;
 try{
  await checkRuntimeDatabase(runtime,c,b,{deep:true});
  // Read-only source inspection. No source schema initializer, migration, seed or user creation.
  tx=await source.connect();await tx.query('BEGIN READ ONLY');transactionOpen=true;await tx.query("SET LOCAL statement_timeout='5s'");
  const shape=(await tx.query("SELECT to_regclass('public.app_account_teams') AS teams,to_regclass('public.app_enterprise_settings') AS enterprises,to_regclass('public.app_users') AS users,to_regclass('enterprise_workflow.runtime_installation') AS workflow")).rows[0];
  requireRuntime(shape.teams&&shape.enterprises&&shape.users&&!shape.workflow,'WEB_SOURCE_DATABASE_REQUIRED');
  const ids=c.tenants.filter(t=>t.sourceInstance===web.NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID).map(t=>t.sourceEnterprise);
  const rows=(await tx.query('SELECT t.id FROM app_account_teams t JOIN app_enterprise_settings s ON s.team_id=t.id WHERE t.id=ANY($1::uuid[]) AND t.enabled AND s.enabled',[ids])).rows;
  requireRuntime(rows.length===ids.length,'WEB_SOURCE_ENTERPRISE_UNAVAILABLE');await tx.query('COMMIT');transactionOpen=false;
  const r=await fetch(web.NAUMI_WORKFLOW_SERVICE_URL.replace(/\/$/,'')+'/readyz',{redirect:'error',signal:AbortSignal.timeout(5000)});requireRuntime(r.status===200,'WEB_RUNTIME_NOT_READY');const state=await r.json() as Record<string,unknown>;
  requireRuntime(state.ready===true&&state.role==='api'&&state.acceptingWork===true&&state.installationId===c.installationId&&state.slot===c.slot&&state.releaseId===b.releaseId&&state.productSha256===b.productSha256,'WEB_RUNTIME_IDENTITY_MISMATCH');
  return {...summary,liveProbe:true,sourceReadOnly:true,sourceEnterprisesAvailable:rows.length,runtimeReady:true};
 }finally{if(transactionOpen)await tx?.query('ROLLBACK').catch(()=>{});tx?.release();await Promise.all([runtime.end(),source.end()]);}
}
