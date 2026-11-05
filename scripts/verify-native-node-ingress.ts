/** Actual HTTP -> native HMAC -> original Route -> node service/repository -> PG.
 * Only the loopback HTTP adapter and independent database are fixture ports.
 * No auth/domain/model/transaction implementation is replaced. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {createModelFixture} from './model-config-fixture';

const arg=(name:string,fallback:string)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const root=path.resolve('.'),source=path.resolve(arg('--source-root','.')),out=path.resolve(arg('--out',process.env.NATIVE_NODE_INGRESS_EVIDENCE||'output/native-node-ingress'));
const mode=arg('--mode','modified'),phase=arg('--phase','all'),baseline=mode==='baseline';
assert.ok(['baseline','modified'].includes(mode)&&['all','pg','no-db'].includes(phase));
assert.ok(out.startsWith(path.join(root,'output')+path.sep));mkdirSync(out,{recursive:true});
const domains=['audio','character','scene','director','timeline'] as const;
const actions={audio:['render'],character:[],scene:[],director:['outputs'],timeline:['render','adopt','materials']} as const;
const save=(name:string,value:unknown)=>writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const op=(label:string)=>'00000000-0000-4000-8000-'+createHash('sha256').update(label).digest('hex').slice(0,12);
const normalize=(value:any):any=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='createdAt'||k==='updatedAt'?'timestamp':k==='deletedAt'?v!==null:normalize(v)])):value;

async function loadApi(){
 const lines:string[]=[];
 for(const domain of domains){
  const p=path.join(source,'src/app/api/canvas/'+domain+'-nodes');
  lines.push('export * as '+domain+'Collection from '+JSON.stringify(path.join(p,'route.ts'))+';');
  lines.push('export * as '+domain+'Item from '+JSON.stringify(path.join(p,'[id]/route.ts'))+';');
  for(const action of actions[domain])lines.push('export * as '+domain+action+' from '+JSON.stringify(path.join(p,'[id]',action,'route.ts'))+';');
  lines.push('export {new'+domain[0].toUpperCase()+domain.slice(1)+'Project} from '+JSON.stringify(path.join(source,'src/lib',domain,'project.ts'))+';');
 }
 for(const[file,names]of Object.entries({'src/platform/db/pool.ts':['getPool','closeDatabasePools'],'src/lib/persistence/schema.ts':['ensureSchema'],'src/lib/accounts/session.ts':['getOrCreateUser'],'src/lib/native-auth.ts':['USER_COOKIE','signUserSession']}))lines.push('export {'+names.join(',')+'} from '+JSON.stringify(path.join(source,file))+';');
 const result=await build({stdin:{contents:lines.join('\n'),loader:'ts',resolveDir:source},absWorkingDir:source,tsconfig:path.join(source,'tsconfig.json'),bundle:true,platform:'node',target:'node24',format:'cjs',write:false,metafile:true,packages:'external',alias:{'server-only':path.join(root,'scripts/fleet-server-only.cjs')}});
 save('SOURCE_INPUTS.json',Object.fromEntries(Object.keys(result.metafile!.inputs).filter(p=>!p.startsWith('<')).map(p=>{const f=path.resolve(source,p);return[f,createHash('sha256').update(readFileSync(f)).digest('hex')];})));
 const m={exports:{} as any};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(path.join(root,'package.json')),m,m.exports);return m.exports;
}
async function main(){
 if(phase!=='all')return phase==='pg'?postgres():noDatabase();
 const commands:any[]=[];
 for(const part of ['pg','no-db']){
  const args=['--conditions=react-server','--import','tsx',path.resolve(process.argv[1]),'--mode',mode,'--phase',part,'--source-root',source,'--out',path.join(out,part)];
  const q=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,...(part==='no-db'?{DATABASE_URL:'',PGOPTIONS:''}:{})},encoding:'utf8',windowsHide:true,maxBuffer:6*1024*1024});
  writeFileSync(path.join(out,part+'.log'),(q.stdout||'')+(q.stderr||''));commands.push({command:[process.execPath,...args],exit:q.status});save('COMMANDS.json',commands);assert.equal(q.status,0,(q.stdout||'')+(q.stderr||''));
 }
 const pg=JSON.parse(readFileSync(path.join(out,'pg/RESULT.json'),'utf8')),no=JSON.parse(readFileSync(path.join(out,'no-db/RESULT.json'),'utf8'));const result={status:baseline?'BASELINE_REPRODUCED':'PASS',mode,cases:pg.cases+no.cases,checks:pg.checks+no.checks,normal:[...pg.normal,...no.normal],authReads:pg.authReads,actualHttp:true,actualNativeAuth:true,actualPg:true,dependencies:'actual',supplierPosts:pg.supplierPosts,commands};
 const compare=arg('--compare','');if(compare){const old=JSON.parse(readFileSync(compare,'utf8'));assert.deepEqual(result.normal,old.normal,'original status/result/CRUD/CAS/target projection');(result as any).originalNormal='EXACT';}
 save('RESULT.json',result);console.log(`NATIVE_NODE_INGRESS=${result.status} CASES=${result.cases} CHECKS=${result.checks} HTTP=ACTUAL NATIVE_AUTH=ACTUAL PG=1 FAMILIES=5 NORMAL=${compare?'EXACT':'CAPTURED'} SUPPLIER_POSTS=0`);
}
function clearAuthEnvironment(){for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FLEET_PORTAL_ONLY','NAUMI_AUTH_LOGIN_ONLY'])delete process.env[key];}
async function noDatabase(){
 assert.equal(process.env.DATABASE_URL,'');clearAuthEnvironment();const api=await loadApi();let checks=0;const normal:any[]=[];
 try{for(const domain of domains){const base='http://node-ingress.fixture/api/canvas/'+domain+'-nodes',context={params:Promise.resolve({id:'node-'+domain})};
  for(const[name,run]of [['list',()=>api[domain+'Collection'].GET(new Request(base))],['create',()=>api[domain+'Collection'].POST(new Request(base,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}))],['get',()=>api[domain+'Item'].GET(new Request(base+'/node-'+domain),context)],['patch',()=>api[domain+'Item'].PATCH(new Request(base+'/node-'+domain,{method:'PATCH',headers:{'content-type':'application/json'},body:'{}'}),context)]]as const){const response=await run();assert.equal(response.status,401);checks++;normal.push({case:'no-db-'+domain+'-'+name,status:401});}}
  save('RESULT.json',{cases:normal.length,checks,normal});console.log('NATIVE_NODE_NO_DB=PASS CASES='+normal.length);
 }finally{await api.closeDatabasePools();}
}
async function postgres(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL||'').hostname,'127.0.0.1');clearAuthEnvironment();let api:any,origin='',supplierPosts=0;
 const f=await createModelFixture(async(req,res)=>{try{
  if(!req.url?.startsWith('/api/canvas/')){supplierPosts++;res.writeHead(500);res.end('No supplier execution in node ingress verification');return;}
  const match=/^\/api\/canvas\/(audio|character|scene|director|timeline)-nodes(?:\/([^/?]+))?(?:\/(render|adopt|outputs|materials))?(?:\?.*)?$/.exec(req.url);assert.ok(match);const[,domain,id,action]=match;
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
  const request=new Request(origin+req.url,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),handler=api[domain+(action|| (id?'Item':'Collection'))][req.method!],response=await handler(request,{params:Promise.resolve({id})});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:String(error)}));}});origin=f.origin;
 Object.assign(process.env,{PGOPTIONS:'-c search_path='+f.schemaName,NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'r9f-native-node-isolated-fixture-only-secret-20261101',NAUMI_RELEASE_LIFECYCLE:'0',NAUMI_VIDEO_WORKER:'0',VIDEO_WORKER_SECRET:'r9f-isolated-native-worker-only-fixture-20261101',NAUMI_APPLICATION_TASK_EXECUTION:'worker'});
 let checks=0;const normal:any[]=[],authReads:Record<string,number>={};const eq=(a:any,b:any)=>{assert.deepEqual(a,b);checks++;};const owner='node-owner@example.test',other='node-other@example.test',admin='node-admin@example.test';let observed:string[]=[];
 try{
  api=await loadApi();await api.ensureSchema();for(const email of [owner,other,admin])await api.getOrCreateUser(email,email);await f.sql.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
  const accounting=async()=>({operations:(await f.sql.query('SELECT to_jsonb(o) value FROM app_billing_operations o ORDER BY id')).rows,ledger:(await f.sql.query('SELECT to_jsonb(l) value FROM app_ledger l ORDER BY id')).rows});const accountingBefore=await accounting();
  const cookies=new Map([owner,other,admin].map(email=>[email,api.USER_COOKIE+'='+api.signUserSession(email,Date.now())]));const pool=api.getPool(),query=pool.query.bind(pool);pool.query=(...args:any[])=>{observed.push(typeof args[0]==='string'?args[0]:args[0]?.text||'');return query(...args);};
  const call=async(label:string,url:string,method='GET',body?:unknown,email:string|null=owner,extra:Record<string,string>={},oldCount=2,newCount=1)=>{
   observed=[];const headers:Record<string,string>={origin,'sec-fetch-site':'same-origin',...extra};if(email)headers.cookie=cookies.get(email)!;if(body!==undefined)headers['content-type']='application/json';
   const r=await fetch(origin+url,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),data=await r.json();const n=observed.filter(x=>x.startsWith('SELECT banned,auth_revoked_before,account_expires_at FROM app_users')).length;eq(n,baseline?oldCount:newCount);authReads[label]=n;const value={case:label,status:r.status,body:normalize(data),cache:r.headers.get('cache-control')};normal.push(value);return value;
  };
  const ids:Record<string,string>={};
  for(const domain of domains){
   const id='node-'+domain,base='/api/canvas/'+domain+'-nodes',field=domain==='director'?'project':domain,project=api['new'+domain[0].toUpperCase()+domain.slice(1)+'Project']();ids[domain]=id;
   const create={id,projectKey:'tree:'+id,expectedRevision:0,operationId:op(domain+'-create'),title:domain+' original',x:100,y:120,[field]:project};
   const made=await call(domain+'-create',base,'POST',create);eq(made.status,201);eq(made.body.node.revision,1);
   const replay=await call(domain+'-replay',base,'POST',create);eq(replay.body,made.body);
   const list=await call(domain+'-list',base);eq(list.status,200);eq(list.body.nodes.map((x:any)=>x.id),[id]);
   const get=await call(domain+'-get',base+'/'+id);eq(get.status,200);eq(get.body,made.body);
   const changed=await call(domain+'-patch',base+'/'+id,'PATCH',{id,expectedRevision:1,operationId:op(domain+'-patch'),title:domain+' changed',x:175});eq(changed.status,200);eq([changed.body.node.revision,changed.body.node.x],[2,175]);
   const conflict=await call(domain+'-cas',base+'/'+id,'PATCH',{expectedRevision:1,operationId:op(domain+'-cas'),x:200});eq(conflict.status,409);
   const ownTarget=await call(domain+'-own-target',base+'?email='+encodeURIComponent('  '+owner.toUpperCase()+'  '));eq(ownTarget.status,200);
   const foreign=await call(domain+'-foreign-target',base+'?email='+other, 'GET',undefined,owner,{},3,2);eq(foreign.status,401);
   const adminRead=await call(domain+'-admin-target',base+'?email='+owner,'GET',undefined,admin,{},3,2);eq(adminRead.status,200);eq(adminRead.body.nodes.map((x:any)=>x.id),[id]);
   const missing=await call(domain+'-foreign-node',base+'/'+id,'GET',undefined,other);eq(missing.status,404);
   const source=await call(domain+'-cross-site',base+'/'+id,'PATCH',{expectedRevision:2,operationId:op(domain+'-cross-site'),x:999},owner,{'sec-fetch-site':'cross-site'});eq(source.status,403);
   const identity=await call(domain+'-identity',base+'/'+id,'PATCH',{id:'another-id',expectedRevision:2,operationId:op(domain+'-identity'),x:999});eq(identity.status,422);
   const malformed=await call(domain+'-workspace',base,'GET',undefined,owner,{'x-naumi-workspace':'invalid'},1,1);eq(malformed.status,400);
   const anonymous=await call(domain+'-anonymous',base,'GET',undefined,null,{},0,0);eq(anonymous.status,401);
   const recheck=await call(domain+'-unchanged',base+'/'+id);eq([recheck.body.node.revision,recheck.body.node.x],[2,175]);
  }
  for(const [label,url,method,body,status]of [
   ['audio-render','/api/canvas/audio-nodes/'+ids.audio+'/render','POST',{expectedRevision:2,operationId:op('audio-render')},404],
   ['director-outputs','/api/canvas/director-nodes/'+ids.director+'/outputs','POST',{expectedRevision:2,operationId:op('director-output'),artworkId:'missing',kind:'image'},404],
   ['timeline-render','/api/canvas/timeline-nodes/'+ids.timeline+'/render','POST',{expectedRevision:2,operationId:op('timeline-render')},422],
   ['timeline-adopt','/api/canvas/timeline-nodes/'+ids.timeline+'/adopt','POST',{expectedRevision:2,operationId:op('timeline-adopt'),jobId:op('missing-job')},404],
   ['timeline-materials','/api/canvas/timeline-nodes/'+ids.timeline+'/materials?ids=[]','GET',undefined,200]
  ] as const){const value=await call(label,url,method,body);eq(value.status,status);}
  await f.sql.query("UPDATE app_users SET role='user' WHERE email=$1",[admin]);
  const revokedAdmin=await call('admin-role-revoked','/api/canvas/audio-nodes?email='+owner,'GET',undefined,admin,{},3,2);eq(revokedAdmin.status,401);
  await f.sql.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
  observed=[];
  const separate=await Promise.all([owner,other].map(async email=>{const response=await fetch(origin+'/api/canvas/audio-nodes',{headers:{cookie:cookies.get(email)!}});return{status:response.status,ids:(await response.json()).nodes.map((n:any)=>n.id)};}));
  eq(separate,[{status:200,ids:[ids.audio]},{status:200,ids:[]}]);eq(observed.filter(x=>x.startsWith('SELECT banned,auth_revoked_before,account_expires_at FROM app_users')).length,baseline?4:2);
  normal.push({case:'concurrent-actor-isolation',responses:separate});
  const concurrent=await Promise.all([0,1].map(async index=>{const response=await fetch(origin+'/api/canvas/character-nodes/'+ids.character,{method:'PATCH',headers:{cookie:cookies.get(owner)!,origin,'sec-fetch-site':'same-origin','content-type':'application/json'},body:JSON.stringify({expectedRevision:2,operationId:op('concurrent-'+index),x:220})});return{status:response.status,body:await response.json()};}));
  eq(concurrent.map(r=>r.status).sort(),[200,409]);const winner=concurrent.find(r=>r.status===200)!;eq([winner.body.node.revision,winner.body.node.x],[3,220]);normal.push({case:'concurrent-one-cas-winner',statuses:[200,409],revision:3,x:220});
  for(const[name,set,reset]of [['banned','banned=true','banned=false'],['expired',"account_expires_at=now()-interval '1 day'",'account_expires_at=NULL'],['revoked',"auth_revoked_before=now()+interval '1 minute'",'auth_revoked_before=NULL']]){
   await f.sql.query('UPDATE app_users SET '+set+' WHERE email=$1',[owner]);for(const domain of domains){const r=await call(name+'-'+domain,'/api/canvas/'+domain+'-nodes');eq(r.status,401);}await f.sql.query('UPDATE app_users SET '+reset+' WHERE email=$1',[owner]);
  }
  eq(supplierPosts,0);const counts=(await f.sql.query("SELECT (SELECT count(*) FROM app_billing_operations)::int billing,(SELECT count(*) FROM app_ledger WHERE kind='consume')::int consumes")).rows[0];eq(await accounting(),accountingBefore);eq(counts.consumes,0);
  save('RESULT.json',{checks,cases:normal.length,normal,authReads,supplierPosts,accountingUnchanged:true,initialBillingRows:accountingBefore.operations.length});console.log('NATIVE_NODE_PG=PASS CASES='+normal.length+' CHECKS='+checks+' HTTP=ACTUAL AUTH_SQL=OBSERVED BILLING_DELTA=0 SUPPLIER=0');
 }catch(error){save('FAILURE.json',{error:String(error),checks,normal,authReads,supplierPosts});throw error;}
 finally{if(api)await api.closeDatabasePools();await f.cleanup();save('CLEANUP.json',{status:'PASS',randomSchemaDropped:true,poolsClosed:true,loopbackClosed:true});console.log('NATIVE_NODE_CLEANUP=PASS SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
