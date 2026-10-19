import type {Pool} from 'pg';
import {z} from 'zod';
import {inspectSource,sourceSite,SourceAuditError} from '../../../scripts/lib/enterprise-source-audit.mjs';
import {provisionSchema,provisionPlan,provisionApply} from './runtime-provision';
import {databaseIdentity,protectedFile,requireRuntime,RuntimeError,type RuntimeConfig,type RuntimeBundle} from './runtime-config';
import {runtimePool} from './runtime-database';
const connection=z.strictObject({databaseUrl:z.string(),site:z.unknown()});
async function sourceCheck(path:string,c:RuntimeConfig,raw:unknown){
 const parsed=connection.safeParse(JSON.parse((await protectedFile(path,16384)).toString('utf8')));requireRuntime(parsed.success,'PILOT_SOURCE_CONFIG_INVALID');const w=parsed.data,p=provisionSchema.safeParse(raw);requireRuntime(p.success&&p.data.enterprises.length===1,'PILOT_ONE_ENTERPRISE_REQUIRED');
 const e=p.data.enterprises[0],tenant=c.tenants.find(t=>t.enterpriseId===e.enterpriseId);requireRuntime(tenant&&e.sourceReview&&e.accounts.every(a=>a.profile),'PILOT_REVIEW_REQUIRED');
 const site=sourceSite(w.site);requireRuntime(site.enterpriseId===tenant.sourceEnterprise,'PILOT_SOURCE_SCOPE_MISMATCH');const a=databaseIdentity(w.databaseUrl),b=databaseIdentity(c.databaseUrl);requireRuntime(!(a.name===b.name&&a.port===b.port&&(['localhost','127.0.0.1','[::1]'].includes(a.host)?'loopback':a.host)===(['localhost','127.0.0.1','[::1]'].includes(b.host)?'loopback':b.host)),'PILOT_SOURCE_TARGET_MUST_DIFFER');
 const source=runtimePool(w.databaseUrl);try{
  requireRuntime(!(await source.query("SELECT to_regclass('enterprise_workflow.runtime_installation') AS installed")).rows[0].installed,'PILOT_SOURCE_WORKFLOW_MIXED');
  const live=await inspectSource(source,w.site);requireRuntime(live.summary.enterpriseEnabled&&live.summary.ownerGrantActive,'PILOT_SOURCE_ENTERPRISE_UNAVAILABLE');requireRuntime(live.summary.snapshotSha256===e.sourceReview.snapshotSha256,'PILOT_SOURCE_SNAPSHOT_CHANGED');
  for(const account of e.accounts){const rows=live.roster.rows.filter(r=>r.sourceSubject===account.sourceSubject);requireRuntime(rows.length===1&&rows[0].accountAvailable&&rows[0].alias===account.profile!.nickname,'PILOT_SOURCE_ACCOUNT_CHANGED');}
  return {sourceReadOnly:true,sourceWrites:0,sourceRevalidatedAt:live.summary.observedAt,selectedAccounts:e.accounts.length,employeeReady:false};
 }catch(err){if(err instanceof SourceAuditError)throw new RuntimeError(err.message);throw err;}finally{await source.end();}
}
export async function pilotPlan(pool:Pool,c:RuntimeConfig,b:RuntimeBundle,raw:unknown,sourcePath:string){const source=await sourceCheck(sourcePath,c,raw);return {...await provisionPlan(pool,c,b,raw),source};}
export async function pilotApply(pool:Pool,c:RuntimeConfig,b:RuntimeBundle,raw:unknown,previewHash:string,sourcePath:string){const source=await sourceCheck(sourcePath,c,raw);return {...await provisionApply(pool,c,b,raw,previewHash),source};}
