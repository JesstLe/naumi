/** Actual native document owner -> actual six HTTP handlers -> isolated PG.
 * Auth/client scheduling are bounded ports; no supplier, task or billing work. */
import assert from "node:assert/strict";import {randomUUID} from "node:crypto";import path from "node:path";import fs from "node:fs/promises";import vm from "node:vm";import {pathToFileURL} from "node:url";import {build} from "esbuild";
import {createModelFixture} from "./model-config-fixture";
async function main(){
 const baseline=process.argv.includes('--baseline'),at=process.argv.indexOf('--source-root'),sourceRoot=path.resolve(at<0?'.':process.argv[at+1]);
 const out=path.resolve(process.env.NATIVE_DOCUMENT_PG_EVIDENCE||'output/refactor-r7c-20261029/native-pg');await fs.mkdir(out,{recursive:true});let calls=0,checks=0,groups=0;
 const f=await createModelFixture((_q,r)=>{calls++;r.end('disabled');});Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:'1'});const db=await import('../src/lib/db');
 const eq=(a:unknown,b:unknown)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));checks++;};
 try{
  await db.ensureSchema();const email='native-doc-'+randomUUID()+'@fixture.test';await db.getOrCreateUser(email);
  const project='tree:native-doc-root';await db.addArtworks(email,[{id:'native-doc-root',groupId:'native-doc-root',title:'Root',category:'main',prompt:'',status:'completed',image:'/placeholder.png',gradient:''}]);
  const {signUserSession,USER_COOKIE}=await import('../src/lib/native-auth'),headers={cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`};
  const erp=await import('../src/lib/enterprise/server');await erp.ensureEnterpriseSchema();const tenants=[randomUUID(),randomUUID()];
  for(const [index,tenant] of tenants.entries()){
   const employer=index===0?email:`employer-${index}-${randomUUID()}@fixture.test`,role=randomUUID();await db.getOrCreateUser(employer);
   await f.sql.query("INSERT INTO app_team_access_grants(email,scope,created_by,updated_by) VALUES($1,'owned','fixture','fixture')",[employer]);
   await f.sql.query("INSERT INTO app_account_teams(id,owner_email,name,authorized_until) VALUES($1,$2,'Native scope fixture',now()+interval '30 days')",[tenant,employer]);
   await f.sql.query('INSERT INTO app_enterprise_settings(team_id) VALUES($1)',[tenant]);
   await f.sql.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,'Member',10,false,false)",[tenant,role]);
   if(index>0)await f.sql.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent')",[tenant,email,employer,role]);
  }
  const kinds=['video','director','character','scene','audio','timeline'],routes:Record<string,any>={};
  if(baseline){
   const owned=kinds.flatMap(kind=>[`src/app/api/canvas/${kind}-nodes/route.ts`,`src/app/api/canvas/${kind}-nodes/[id]/route.ts`]),actual=process.cwd();
   const resolve=async(p:string)=>{for(const suffix of ['','.ts','.tsx','/index.ts']){const candidate=p+suffix;if(await fs.stat(candidate).then(s=>s.isFile()).catch(()=>false))return candidate;}return null;};
   const projected=path.join(out,'baseline-routes.cjs');
   await build({stdin:{contents:owned.map((p,i)=>`export * as source${i} from ${JSON.stringify(path.join(sourceRoot,p))};`).join('\n'),resolveDir:sourceRoot,loader:'ts'},bundle:true,write:true,outfile:projected,platform:'node',format:'cjs',packages:'external',plugins:[{name:'owned-old-routes',setup(b){b.onResolve({filter:/^[.@]|^[A-Za-z]:/},async args=>{
    const raw=args.path.startsWith('@/')?path.join(sourceRoot,'src',args.path.slice(2)):path.isAbsolute(args.path)?args.path:path.resolve(args.resolveDir,args.path),candidate=await resolve(raw);if(!candidate)return undefined;
    const relative=path.relative(sourceRoot,candidate).replaceAll('\\','/');if(owned.includes(relative))return {path:candidate};
    const current=await resolve(path.join(actual,relative));return current?{path:args.kind==='dynamic-import'?pathToFileURL(current).href:current,external:true}:undefined;
   });}}]});
   const imported=await import(pathToFileURL(projected).href),value=imported.default||imported;for(const [index,kind]of kinds.entries())routes[kind]={base:value[`source${index*2}`],item:value[`source${index*2+1}`]};
   console.log('BASELINE_PROJECTION=OWNED_TWELVE_NATIVE_ROUTES COMMON_OWNER_AND_DEPENDENCIES=CURRENT');
  }else for(const kind of kinds)routes[kind]={base:await import(pathToFileURL(path.resolve(`src/app/api/canvas/${kind}-nodes/route.ts`)).href),item:await import(pathToFileURL(path.resolve(`src/app/api/canvas/${kind}-nodes/[id]/route.ts`)).href)};
  const ledger=async()=>(await f.sql.query('SELECT count(*)::int AS n,coalesce(sum(delta),0)::int AS amount FROM app_ledger')).rows[0],before=await ledger();
  const state={workspace:'personal',revision:0,posts:[] as any[],lose:0};
  const ports={workspace:()=>state.workspace,revision:()=>state.revision,headers:()=>headers};
  const entry=`export {createCanvasNativeNodeDocument,NativeNodeClientError} from './src/lib/canvas/native-node-document';export {createCanvasDocumentContext} from './src/lib/canvas/document-scope';`;
  const code=(await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'auth-ports',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'scope',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?'export const authHeader=async()=>__ports.headers();':'export const currentWorkspace=()=>__ports.workspace(),currentWorkspaceRevision=()=>__ports.revision();',loader:'js'}));}}]})).outputFiles[0].text;
  const module={exports:{}},context=vm.createContext({module,exports:module.exports,__ports:ports,console,URL,Headers,Request,Response,AbortSignal,AbortController,setTimeout,clearTimeout,structuredClone,crypto:globalThis.crypto,fetch:async(url:string,init:RequestInit={})=>{
   const request=new Request('http://localhost'+url,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),origin:'http://localhost'}}),u=new URL(request.url),kind=u.pathname.split('/')[3].replace(/-nodes$/,''),id=u.pathname.split('/')[4];
   const method=init.method||'GET';if(method!=='GET')state.posts.push({kind,body:JSON.parse(String(init.body)),method,url,workspace:request.headers.get('x-naumi-workspace')});
   const response=await(id?routes[kind].item[method](request,{params:Promise.resolve({id})}):routes[kind].base[method](request));
   if(state.lose>0&&method!=='GET'&&response.ok){state.lose--;throw Error('fixture committed response lost');}return response;
  }});vm.runInContext(code,context);const api=module.exports as any;
  for(const kind of kinds){
   const owner=api.createCanvasNativeNodeDocument(kind,(message:string,status:number,code?:string)=>new api.NativeNodeClientError(message,status,code)),scopeContext=api.createCanvasDocumentContext(),scope=scopeContext.render(email,project),document=owner.bind(scope,email,false),id=`${kind}-scope-${randomUUID()}`;
   const created=await document.save(id,{projectKey:project,title:kind,x:11,y:22});eq(created.revision,1);await document.refresh();eq(document.getNode(id).title,kind);
   state.lose=kind==='video'?3:1;const a=state.posts.length;await assert.rejects(document.save(id,{title:'first'}),/response lost/);checks++;await document.refresh();await document.save(id,{title:'second'});
   const own=state.posts.slice(a);eq(own.map(p=>p.body.expectedRevision),kind==='video'?[1,1,1,1,2]:[1,1,2]);eq(own[0].body,own[1].body);eq(document.getNode(id).revision,3);eq(document.getNode(id).title,'second');
   const operations=kind==='video'?'app_canvas_video_node_operations':`app_canvas_${kind}_operations`;
   const count=await f.sql.query(`SELECT count(*)::int AS n FROM ${operations} WHERE email=$1`,[email]);eq(count.rows[0].n,3);
   const h=await import('../src/app/api/canvas/history/route');const removal=await h.POST(new Request('http://localhost/api/canvas/history',{method:'POST',headers:{...headers,origin:'http://localhost','content-type':'application/json','x-naumi-workspace':'personal'},body:JSON.stringify({operationId:randomUUID(),operations:[{type:`${kind}-visibility`,id,visible:false}]})}));eq(removal.status,200);const receipt=await removal.json();document.accept(receipt.nativeNodes[`${kind}Nodes`],()=>true);eq(!!document.getNode(id).deletedAt,true);await document.refresh();eq(!!document.getNode(id).deletedAt,true);
   const tenantIds:string[]=[];
   for(const tenant of tenants){state.workspace=tenant;state.revision++;const tenantId=`${kind}-tenant-${randomUUID()}`,scoped=owner.bind(scopeContext.render(email,null),email,false);tenantIds.push(tenantId);await scoped.save(tenantId,{projectKey:`tree:${tenantId}`,title:'Tenant root'});await scoped.refresh();eq(baseline?scoped.getSnapshot().nodes.length:scoped.getSnapshot().nodes.map((n:any)=>n.id),baseline?tenantIds.length+1:[tenantId]);}
   state.workspace=tenants[0];state.revision++;const selected=owner.bind(scopeContext.render(email,null),email,false);await selected.refresh();eq(baseline?selected.getSnapshot().nodes.length:selected.getSnapshot().nodes.map((n:any)=>n.id),baseline?3:[tenantIds[0]]);
   const foreign=await routes[kind].item.GET(new Request(`http://localhost/api/canvas/${kind}-nodes/${tenantIds[1]}`,{headers:{...headers,'x-naumi-workspace':tenants[0]}}),{params:Promise.resolve({id:tenantIds[1]})});eq(foreign.status,baseline?200:404);
   state.workspace=randomUUID();state.revision++;const other=owner.bind(scopeContext.render(email,project),email,false);eq(other.getSnapshot().nodes,[]);await assert.rejects(()=>other.save(id,{title:'foreign'}));checks++;eq(document.getSnapshot().nodes[0].title,'second');state.workspace='personal';state.revision++;
   const personal=owner.bind(scopeContext.render(email,project),email,false);await personal.refresh();eq(baseline?personal.getSnapshot().nodes.length:personal.getSnapshot().nodes.map((n:any)=>n.id),baseline?3:[id]);
   const parallelIds=[`${kind}-parallel-${randomUUID()}`,`${kind}-parallel-${randomUUID()}`],start=state.posts.length;
   const parallel=await Promise.all(parallelIds.map(nextId=>personal.save(nextId,{projectKey:`tree:${nextId}`,title:'Independent node'})));await personal.flush();
   eq(parallel.map((n:any)=>n.revision),[1,1]);eq(new Set(state.posts.slice(start).map(row=>row.body.operationId)).size,2);eq(parallelIds.every(nextId=>!!personal.getNode(nextId)),true);
   groups++;console.log(`NATIVE_DOCUMENT_PG_KIND=${kind} PASS ORIGINAL_SAVE_REPLAY=EXACT NEXT_REVISION=3 HISTORY_RECEIPT=DELETED SCOPE_DENIED=1`);
  }
  await f.sql.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE enterprise_id=$1 AND email=$2",[tenants[1],email]);
  await f.sql.query("INSERT INTO app_tenant_entitlements(tenant_id,feature_policy,updated_by) VALUES($1,'{\"creation\":false}','fixture') ON CONFLICT(tenant_id) DO UPDATE SET feature_policy=excluded.feature_policy",[tenants[0]]);
  for(const kind of kinds){
   const request=(tenant:string)=>new Request(`http://localhost/api/canvas/${kind}-nodes?email=${encodeURIComponent(email)}`,{headers:{...headers,'x-naumi-workspace':tenant}});
   eq((await routes[kind].base.GET(request(tenants[1]))).status,baseline?200:403);
   eq((await routes[kind].base.GET(request(tenants[0]))).status,200);
  }
  eq(await ledger(),before);eq(calls,0);console.log(`CANVAS_NATIVE_DOCUMENTS_PG=${baseline?'BASELINE_REPRODUCED':'PASS'} GROUPS=${groups} CHECKS=${checks} KINDS=6 ACTUAL_OWNER=1 ACTUAL_HTTP=1 REAL_PG=1 LOST_ACK=ORIGINAL_BODY SINGLE_INTENT=ONE_ROW SCOPE=${baseline?'READ_LEAK_REPRODUCED':'ISOLATED'} LEDGER=UNCHANGED SUPPLIER=0`);
  await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:baseline?'BASELINE_REPRODUCED':'PASS',groups,checks,posts:state.posts,ledgerUnchanged:true,calls},null,2)+'\n');
 }finally{await db.getPool().end();await(await import('../src/lib/imagegen/coordination-pool')).closeImageCoordinationPool();await f.cleanup();console.log('NATIVE_DOCUMENT_PG_CLEANUP=PASS OWN_SCHEMA_DROPPED=1 POOLS_CLOSED=1 LOOPBACK_CLOSED=1');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
