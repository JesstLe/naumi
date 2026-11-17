import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

async function main(){
 const database=new URL(process.env.DATABASE_URL!);
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 assert.equal(database.hostname,'127.0.0.1');assert.match(database.pathname,/fixture/);
 Object.assign(process.env,{NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'workflow-read-safety-fixture-key',NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'shared',NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID:'workflow-read-fixture',NAUMI_ENTERPRISE_ALLOWED_IDS:''});
 const {ensureTenantSchema}=await import('../src/lib/saas/tenants');
 const {ensureBiSchema}=await import('../src/lib/bi/schema');
 const {getOrCreateUser,getPool}=await import('../src/lib/db');
 const {signUserSession}=await import('../src/lib/native-auth');
 const {GET,POST}=await import('../src/app/api/enterprise/workflow/worklogs/route');
 const imports=await import('../src/app/api/enterprise/workflow/imports/route');
 const {readWorkflowJson,WORKFLOW_JSON_MAX_BYTES}=await import('../src/lib/enterprise/workflow-read');
 const {CreationAdapter}=await import('../src/lib/enterprise/integration/creation-adapter');
 const {deploymentPolicy}=await import('../src/lib/enterprise/integration/policy');
 const {workflowDiscovery}=await import('../src/lib/enterprise/workflow-identity');
 await ensureTenantSchema();await ensureBiSchema();
 const pool=getPool(),id=randomUUID(),team=randomUUID(),email=`owner-${id}@fixture.test`,employee=`member-${id}@fixture.test`;
 for(const name of [email,employee]){
  await getOrCreateUser(name,'Workflow fixture');
  await pool.query("INSERT INTO app_feature_access(email,mode,allowed) VALUES($1,'custom','[\"team\"]')",[name]);
 }
 await pool.query("INSERT INTO app_account_teams(id,name,owner_email) VALUES($1,'Workflow fixture',$2)",[id,email]);
 await pool.query("INSERT INTO app_enterprise_settings(team_id) VALUES($1)",[id]);
 await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,$3,'permanent')",[id,employee,email]);
 await pool.query("INSERT INTO app_team_access_grants(email,scope,starts_at,created_by,updated_by) VALUES($1,'owned',now()-interval '1 day','fixture','fixture')",[email]);
 await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient) VALUES($1,$2,'Fixture','test','','',''),($3,$4,'Member fixture','test','','','')",[`owner-${id}`,email,`employee-${id}`,employee]);

 const srv=createServer((request,response)=>{
  const url=new URL(request.url!,'http://fixture.invalid'),q=url.searchParams;
  if(request.method==='POST'){
   request.resume();
   request.on('end',()=>{srv.emit('fixture-write',response);});
   return;
  }
  if(url.pathname==='/v1/imports/asset'){
   response.setHeader('content-type','application/octet-stream');response.end('binary fixture');return;
  }
  response.setHeader('content-type','application/json');
  if(q.get('probe')==='cancel'){
   response.write('{"unfinished":');srv.emit('fixture-stream',response);
  }else if(q.get('probe')==='oversize'){
   response.setHeader('Content-Length',String(WORKFLOW_JSON_MAX_BYTES+1));
   response.write('{"unfinished":');srv.emit('fixture-oversize',response);
  }else response.end(JSON.stringify({rows:[{name:'原始内容'}]}));
 });
 await new Promise<void>(resolve=>srv.listen(0,'127.0.0.1',resolve));
 const {port}=srv.address() as {port:number};
 const {privateKey}=generateKeyPairSync('ed25519');
 Object.assign(process.env,{NAUMI_WORKFLOW_SERVICE_URL:`http://127.0.0.1:${port}`,NAUMI_WORKFLOW_SIGNING_KID:'fixture',NAUMI_WORKFLOW_SIGNING_KEY:privateKey.export({format:'pem',type:'pkcs8'})});
 const req=(method='GET',probe='',signal?:AbortSignal)=>new Request(`http://fixture.invalid/api/enterprise/workflow/worklogs?enterpriseId=${id}&teamId=${team}${probe?'&probe='+probe:''}`,{method,signal,headers:{cookie:'nv_user='+signUserSession(email,Date.now()),origin:'http://fixture.invalid','content-type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
 const until=<T,>(p:Promise<T>)=>Promise.race([p,delay(2500,undefined,{ref:false}).then(()=>{throw Error('Fixture did not finish in time');})]);
 try{
  const discovery=(viewer:string,extra:Record<string,string>={})=>new Request('http://fixture.invalid/api/enterprise/workflow?action=discovery',{headers:{cookie:'nv_user='+signUserSession(viewer,Date.now()),...extra}});
  const sponsor=await pool.connect();
  try{
   await sponsor.query('BEGIN');await sponsor.query('SELECT email FROM app_users WHERE email=$1 FOR UPDATE',[email]);
   assert.deepEqual((await until(workflowDiscovery(discovery(employee)))).enterprises.map(t=>t.id),[id]);
  }finally{await sponsor.query('ROLLBACK');sponsor.release();}
  assert.deepEqual((await workflowDiscovery(discovery(email))).enterprises.map(t=>t.id),[id]);
  await assert.rejects(workflowDiscovery(discovery(employee,{'x-workflow-viewer':email})),{code:'ACCOUNT_CHANGED',status:409});
  await pool.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1',[email]);
  assert.deepEqual((await workflowDiscovery(discovery(employee))).enterprises,[]);
  await pool.query('UPDATE app_team_access_grants SET enabled=true WHERE email=$1',[email]);
  assert.deepEqual(await(await GET(req())).json(),{rows:[{name:'原始内容'}]});
  for(const route of ['appeals','capacity','catalog','demand-batches','forms','guidelines','projects','publication-preflight','publications','reviews','sla'] as const){
   const {GET:read}=await import(`../src/app/api/enterprise/workflow/${route}/route`);
   const checked=await read(new Request(req().url.replace('/worklogs?','/'+route+'?'),{headers:req().headers}));
   assert.equal(checked.status,200,route);assert.deepEqual(await checked.json(),{rows:[{name:'原始内容'}]},route);
  }
  const fileUrl=req().url.replace('/worklogs?','/imports?')+'&source='+('a'.repeat(64))+'&id='+('b'.repeat(64))+'&viewer='+encodeURIComponent(email);
  const binary=await imports.GET(new Request(fileUrl,{headers:req().headers}));
  assert.equal(binary.status,200);assert.equal(binary.headers.get('content-type'),'application/octet-stream');
  assert.equal(await binary.text(),'binary fixture');
  const closed=new AbortController(),seen=once(srv,'fixture-stream');
  const pending=GET(req('GET','cancel',closed.signal));
  const [stream]=await until(seen),disconnected=once(stream,'close');
  closed.abort();
  assert.equal((await until(pending)).status,503);
  await until(disconnected);
  const oversized=await until(GET(req('GET','oversize')));
  assert.equal(oversized.status,502);assert.equal((await oversized.json()).error,'WORKFLOW_RESPONSE_TOO_LARGE');

  let canceled=false;
  const chunked=new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024*1024));},cancel(){canceled=true;}}),{headers:{'content-type':'application/json'}});
  await assert.rejects(readWorkflowJson(chunked),{code:'WORKFLOW_RESPONSE_TOO_LARGE'});
  assert(canceled,'oversized chunked stream must be canceled');
  const invalid=new Response('{',{headers:{'content-type':'application/json'}});
  await assert.rejects(readWorkflowJson(invalid),{code:'WORKFLOW_RESPONSE_INVALID'});
  const writeAbort=new AbortController(),writeSeen=once(srv,'fixture-write');
  const write=POST(req('POST','',writeAbort.signal));
  const [output]=await until(writeSeen);
  writeAbort.abort();
  output.setHeader('content-type','application/json');output.end('{"ok":true}');
  assert.deepEqual(await(await until(write)).json(),{ok:true});

  const make=(subject:string)=>new CreationAdapter(subject,deploymentPolicy());
  const self=(await make(employee).records({enterpriseId:id,kind:'artworks',size:20})).rows;
  assert.equal(self.length,1);assert.equal(self[0].account.email,employee);
  await assert.rejects(make(employee).records({enterpriseId:id,kind:'artworks',email,size:20}),{code:'SOURCE_RECORD_NOT_VISIBLE'});
  const blocker=await pool.connect(),wallet=await pool.connect();
  let report:Promise<unknown>|undefined;
  let earlierFailure:unknown;
  try{
   await blocker.query('BEGIN');await blocker.query('LOCK TABLE app_artworks IN ACCESS EXCLUSIVE MODE');
   report=make(email).records({enterpriseId:id,kind:'artworks',size:20});void report.catch(error=>{earlierFailure=error;});
   let waiting=false;
   for(let i=0;i<40&&!waiting;i++){waiting=(await wallet.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE relation='app_artworks'::regclass AND NOT granted) AS waiting")).rows[0].waiting;if(!waiting)await delay(20);}
   if(!waiting&&earlierFailure)throw earlierFailure;
   assert(waiting,'expected workflow source report to reach the artwork table');
   await wallet.query('BEGIN');await wallet.query("SET LOCAL lock_timeout='750ms'");
   await wallet.query('UPDATE app_users SET credits_used=credits_used WHERE email=$1',[email]);await wallet.query('COMMIT');
   await wallet.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1',[email]);
  }finally{await blocker.query('ROLLBACK');await wallet.query('ROLLBACK');blocker.release();wallet.release();}
  await assert.rejects(report!,{status:403});
  await pool.query('UPDATE app_team_access_grants SET enabled=true WHERE email=$1',[email]);
  Object.assign(process.env,{NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'dedicated',NAUMI_ENTERPRISE_ALLOWED_IDS:id});
  const {ensureSitePolicySchema,applySitePolicyTx}=await import('../src/lib/site-control/store');await ensureSitePolicySchema();
  const siteTx=await pool.connect();
  try{
   const policy={enterpriseId:id,sourceInstanceId:'workflow-read-fixture',brand:'Dedicated fixture',enabledFeatures:['team'],workspaceModules:['notifications']};
   await siteTx.query('BEGIN');await applySitePolicyTx(siteTx,{id:randomUUID(),actor:'fixture',expectedRevision:0,policy});await siteTx.query('COMMIT');
   const dedicated=await workflowDiscovery(discovery(employee));
   assert.equal(dedicated.mode,'dedicated');assert.deepEqual(dedicated.enterprises.map(t=>t.id),[id]);
   await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[employee]);
   await pool.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE enterprise_id=$1 AND email=$2",[id,employee]);
   assert.deepEqual((await workflowDiscovery(discovery(employee))).enterprises.map(t=>t.id),[id]);
   await siteTx.query('BEGIN');await applySitePolicyTx(siteTx,{id:randomUUID(),actor:'fixture',expectedRevision:1,policy:{...policy,enabledFeatures:[]}});await siteTx.query('COMMIT');
   await assert.rejects(workflowDiscovery(discovery(employee)),{status:403});
  }finally{await siteTx.query('ROLLBACK');siteTx.release();}
  console.log('WORKFLOW_READ_SAFETY_PASS route_reads=12 binary_stream=1 socket_aborted=1 bounded_json=1 submitted_write_preserved=1 self_scope=1 billing_nonblocking=1 revocation=403 discovery_nonblocking=1 dedicated_site_policy=1');
 }finally{srv.closeAllConnections();await new Promise<void>(resolve=>srv.close(()=>resolve()));await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
