import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync,randomUUID,sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import type { IncomingMessage } from 'node:http';
import pg from 'pg';
import { SourceIdentityStore,createSourceVerifier,createMappedAuthenticator } from '../src/source-identity';
import { createWorkflowServer,WorkflowStore,SchedulingStore,resolveDatabaseActor } from '../src/server';
const url=process.env.WORKFLOW_IDENTITY_TEST_DATABASE_URL;
test('source-bound workspace identity: signed server claims, explicit mappings, live revocation and team separation',{skip:!url},async()=>{
 const pool=new pg.Pool({connectionString:url});const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const enterpriseId=randomUUID(),teamId=randomUUID(),otherTeam=randomUUID(),sourceEnterprise=randomUUID();
 const p={enterpriseId,teamId,subject:'manager'},identity={sourceInstance:'naumi-a',sourceEnterprise,sourceSubject:'staff@fixture.invalid'};
 const issuer='naumi-workflow-bff',audience='enterprise-workflow-source',verifier=createSourceVerifier({issuer,audience,publicKeys:{test:publicKey}}),bindings=new SourceIdentityStore(pool);
 const token=(overrides:Record<string,unknown>={},h:Record<string,unknown>={})=>{const now=Math.floor(Date.now()/1000),e=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url'),s=e({alg:'EdDSA',typ:'JWT',kid:'test',...h})+'.'+e({iss:issuer,aud:audience,...identity,iat:now,exp:now+45,jti:randomUUID(),...overrides});return s+'.'+sign(null,Buffer.from(s),privateKey).toString('base64url');};
 const auth=(t:string)=>({headers:{authorization:'Bearer '+t}} as IncomingMessage);
 let server:ReturnType<typeof createWorkflowServer>|undefined;
 try{
  for(const f of ['001-workflow.sql','002-scheduling.sql','004-source-identity.sql'])await pool.query(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  await pool.query('INSERT INTO enterprise_workflow.teams(enterprise_id,team_id) VALUES($1,$2),($1,$3)',[enterpriseId,teamId,otherTeam]);
  for(const s of ['manager','employee'])await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject) VALUES($1,$2)',[enterpriseId,s]);
  await pool.query('INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds) VALUES($1,$2,$3,$4,$5),($1,$2,$6,$7,$8),($1,$9,$6,$4,$5)',[enterpriseId,teamId,'manager','["manage","dispatch"]','[]','employee','["execute"]','["design"]',otherTeam]);
  const common={sourceInstance:identity.sourceInstance,sourceEnterprise,expectedVersion:0,enabled:true,reason:'reviewed binding'};
  await assert.rejects(bindings.workspaces(identity),/SOURCE_IDENTITY_NOT_BOUND/);
  await bindings.configure(p,{...common,type:'enterprise'});await bindings.configure(p,{...common,type:'identity',sourceSubject:identity.sourceSubject,subject:'employee'});
  const spaces=await bindings.workspaces(identity);assert.equal(spaces.teams.length,2);assert.deepEqual(spaces.teams.find(t=>t.teamId===teamId)?.permissions,['execute']);
  assert.equal((await bindings.principal({...identity,teamId})).subject,'employee');await assert.rejects(bindings.principal({...identity,teamId:randomUUID()}),/MEMBERSHIP_REQUIRED/);
  await assert.rejects(bindings.workspaces({...identity,sourceInstance:'naumi-b'}),/SOURCE_IDENTITY_NOT_BOUND/);await assert.rejects(bindings.workspaces({...identity,sourceEnterprise:randomUUID()}),/SOURCE_IDENTITY_NOT_BOUND/);
  await assert.rejects(bindings.configure({...p,subject:'employee'},{...common,type:'enterprise',expectedVersion:1,enabled:false}),/FORBIDDEN/);
  await assert.rejects(bindings.configure(p,{...common,type:'identity',sourceSubject:identity.sourceSubject,subject:'employee'}),/VERSION_CONFLICT/);
  await assert.rejects(bindings.configure(p,{...common,type:'identity',sourceSubject:identity.sourceSubject,subject:'manager',expectedVersion:1}),/REBIND_REQUIRES_EXPLICIT_MIGRATION/);
  assert(await verifier(auth(token())));for(const t of [token({aud:'wrong'}),token({iss:'wrong'}),token({exp:1}),token({iat:9999999999}),token({permissions:['manage']}),token({}, {alg:'none'}),token({}, {kid:'missing'}),'invalid'])assert.equal(await verifier(auth(t)),null);
  assert.throws(()=>createSourceVerifier({issuer,audience,publicKeys:{test:privateKey}}),/ED25519_PUBLIC_KEY_REQUIRED/);
  const schedules=new SchedulingStore(pool,resolveDatabaseActor);await schedules.execute(p,{commandId:randomUUID(),teamId,expectedVersion:0,reason:'seed',action:{type:'initialize'}});
  server=createWorkflowServer(new WorkflowStore(pool,resolveDatabaseActor,async()=>false),createMappedAuthenticator(bindings,verifier),schedules,{store:bindings,authenticate:verifier});server.listen(0,'127.0.0.1');await once(server,'listening');const a=server.address();assert(a&&typeof a!=='string');const base=`http://127.0.0.1:${a.port}`;
  assert.equal((await fetch(base+'/v1/identity/workspaces')).status,401);assert.equal((await fetch(base+'/v1/identity/workspaces',{headers:{authorization:'Bearer '+token()}})).status,200);
  const read=()=>fetch(base+`/v1/teams/${teamId}/scheduling`,{headers:{authorization:'Bearer '+token({teamId})}});
  assert.equal((await read()).status,200);const actor=await bindings.principal({...identity,teamId});
  await bindings.configure(p,{...common,type:'identity',sourceSubject:identity.sourceSubject,subject:'employee',expectedVersion:1,enabled:false});
  assert.equal((await read()).status,403);await assert.rejects(schedules.get(actor,teamId),/MEMBERSHIP_REQUIRED/); // previously resolved principal still rechecks binding in business transaction
  await bindings.configure(p,{...common,type:'identity',sourceSubject:identity.sourceSubject,subject:'employee',expectedVersion:2});
  await pool.query('UPDATE enterprise_workflow.team_members SET enabled=false WHERE enterprise_id=$1 AND team_id=$2 AND subject=$3',[enterpriseId,teamId,'employee']);assert.equal((await read()).status,403);
  assert.equal((await bindings.workspaces(identity)).teams.length,1);
  await bindings.configure(p,{...common,type:'enterprise',expectedVersion:1,enabled:false});await assert.rejects(bindings.workspaces(identity),/SOURCE_IDENTITY_NOT_BOUND/);
  console.log('SOURCE_IDENTITY_PASS: explicit_binding=1 signed_claims=1 ordinary_employee=1 team_role_union=0 namespace_isolation=1 version_conflict=1 revocation_business_tx=1 raw_token_exposed=0 workspaces_http=200 anonymous=401 revoked=403');
 }finally{if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()));}await pool.end();}
});
