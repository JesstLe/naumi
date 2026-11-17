import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createModelFixture} from './model-config-fixture';

async function main(){
 const f=await createModelFixture();
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:'1',NAUMI_RELEASE_RUNTIME:'0',INTERNAL_APP_ORIGIN:f.origin,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'shared'});
 const db=await import('../src/lib/db'),enterprise=await import('../src/lib/enterprise/server');
 const {createAgentToken}=await import('../src/lib/agent-gateway/tokens');
 const {listGatewayTools}=await import('../src/lib/agent-gateway/executor');
 const {withFrozenCreation}=await import('../src/lib/saas/creation-scope');
 let checks=0;const pass=(name:string)=>{checks++;console.log('CHECK',name,'PASS');};
 try{
  await f.repo.current();await enterprise.ensureEnterpriseSchema();
  const actor='owner@desktop.fixture',outsider='outsider@desktop.fixture';
  for(const e of [actor,outsider])await db.getOrCreateUser(e,e);
  const team=randomUUID();await db.getPool().query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'desktop fixture',$2,now()+interval '1 year')",[team,actor]);
  await db.getPool().query('INSERT INTO app_enterprise_settings(team_id) VALUES($1)',[team]);
  await db.getPool().query("INSERT INTO app_team_access_grants(email,scope,created_by,updated_by) VALUES($1,'owned','fixture','fixture')",[actor]);
  const issued=await createAgentToken(actor,{name:'desktop fixture',scopes:['read','write'],dailyCreditLimit:5,expiresInDays:1}),token=issued.token;
  const route=await import('../src/app/api/agent-gateway/v1/tools/route');
  const http=(secret=issued.secret,workspace:string=team)=>route.GET(new Request(f.origin+'/api/agent-gateway/v1/tools',{headers:{authorization:'Bearer '+secret,...(workspace?{'x-naumi-workspace':workspace}:{})}}));
  const caller={email:actor,token,origin:f.origin,internalOrigin:f.origin,origins:[f.origin]};
  const personal=()=>withFrozenCreation({actorEmail:actor,scopeKind:'personal',tenantId:null},()=>listGatewayTools(caller));
  const scoped=()=>withFrozenCreation({actorEmail:actor,scopeKind:'tenant',tenantId:team},()=>listGatewayTools(caller));
  const initial=await personal();assert.equal(initial.find(t=>t.name==='generate_image')?.available,true);pass('account permission baseline available');
  const before=await scoped();assert.equal(before.find(t=>t.name==='generate_image')?.available,true);pass('authorized enterprise discovery available');
  const httpBefore=await http();assert.equal(httpBefore.status,200,await httpBefore.clone().text());assert.equal((await httpBefore.json()).tools.find((t:any)=>t.name==='generate_image').available,true);pass('actual tools Route honors enterprise workspace header');
  await db.getPool().query("INSERT INTO app_tenant_entitlements(tenant_id,feature_policy,updated_by) VALUES($1,'{\"generate\":false}','fixture')",[team]);
  const blocked=await scoped();assert.equal(blocked.find(t=>t.name==='generate_image')?.available,false);assert.equal((await personal()).find(t=>t.name==='generate_image')?.available,true);pass('tenant capability deny does not leak account allowance or change personal scope');
  const httpBlocked=await http();assert.equal(httpBlocked.status,200,await httpBlocked.clone().text());assert.equal((await httpBlocked.json()).tools.find((t:any)=>t.name==='generate_image').available,false);assert.equal((await (await http(issued.secret,'')).json()).tools.find((t:any)=>t.name==='generate_image').available,true);pass('actual Route availability intersects tenant policy; personal remains independent');
  await db.getPool().query("UPDATE app_tenant_entitlements SET feature_policy='{\"creation\":false}' WHERE tenant_id=$1",[team]);
  assert((await scoped()).every(t=>!t.available));pass('disabled enterprise creation yields no available tools');
  assert.equal((await http()).status,403);pass('actual Route rejects disabled enterprise creation');
  await assert.rejects(withFrozenCreation({actorEmail:outsider,scopeKind:'tenant',tenantId:team},()=>listGatewayTools({...caller,email:outsider,token:{...token,email:outsider}})));pass('cross-account enterprise discovery denied');
  const outside=await createAgentToken(outsider,{name:'outside',scopes:['read'],dailyCreditLimit:0,expiresInDays:1});assert.equal((await http(outside.secret)).status,403);pass('actual Route refuses another account enterprise');
  await db.getPool().query('DELETE FROM app_tenant_entitlements WHERE tenant_id=$1',[team]);
  const read=await withFrozenCreation({actorEmail:actor,scopeKind:'tenant',tenantId:team},()=>listGatewayTools({...caller,token:{...token,scopes:['read']}}));assert(read.every(t=>!t.write));pass('read token never discovers write tools');
  const out=resolve('output/desktop-creation');await mkdir(out,{recursive:true});await writeFile(resolve(out,'SCOPE_PG.json'),JSON.stringify({checks,realPg:true,productionWrites:0,supplierCalls:0},null,2));
  console.log(`AGENT_DESKTOP_SCOPE_PG=PASS CHECKS=${checks} REAL_PG=1 PRODUCTION_WRITES=0`);
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
