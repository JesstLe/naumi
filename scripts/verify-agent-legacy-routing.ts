import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';

async function main(){
 const received:Array<{path:string;method:string;body:string}>=[], probes: Array<Record<string, unknown>> = [];
 const streamResponses: http.ServerResponse[] = [];let mutations=0,closedStreams=0;
 const scoped=(scope:string,id:string)=>'cv-'+createHash('sha256').update(scope).digest('hex').slice(0,12)+'-'+createHash('sha256').update(id).digest('hex').slice(0,32);
 const legacy=http.createServer(async(req,res)=>{
  let body='';for await(const part of req)body+=part;const parsed=body?JSON.parse(body):{};
  const url=new URL(req.url!,'http://legacy.fixture');const cookie=req.headers.cookie;
  if(cookie!=='owner-a'){res.writeHead(404,{'content-type':'application/json'});res.end('{"error":"not-owned"}');return;}
  if(req.method==='GET'&&url.pathname==='/api/agent'){
   if(url.searchParams.get('sessionId')==='network-fail'){req.socket.destroy();return;}
   const present=['old-ag','unknown-after-probe','upstream-error'].includes(url.searchParams.get('sessionId')||'');
   res.writeHead(present?200:404,{'content-type':'application/json'});res.end(JSON.stringify({events:[],running:present,total:0}));return;
  }
  if(url.pathname==='/api/canvas/assistant/control'&&parsed.action==='poll'){
   probes.push(parsed);
   const present=parsed.sessionId==='cv-live'&&parsed.projectKey==='tree:a' ||
    parsed.sessionId===scoped('project:tree:a','raw-session-a')&&parsed.projectKey==='tree:a' ||
    parsed.sessionId===scoped('art-a','raw-anchor-a')&&parsed.anchorId==='art-a'&&!parsed.projectKey;
   res.writeHead(present?200:404,{'content-type':'application/json'});res.end('{"events":[],"running":true}');return;
  }
  received.push({path:url.pathname,method:req.method!,body});mutations++;
  if(parsed.sessionId==='unknown-after-probe'){req.socket.destroy();return;}
  if(parsed.sessionId==='upstream-error'){res.writeHead(409,{'content-type':'application/json'});res.end('{"error":"already-running"}');return;}
  if(req.method==='PUT'){
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});res.write('event: open\ndata: {"sessionId":"old-ag"}\n\n');
   streamResponses.push(res);
   res.on('close',()=>{closedStreams++;});return;
  }
  res.writeHead(200,{'content-type':'application/json','set-cookie':'must-not-forward=1'});res.end('{"ok":true}');
 });
 await new Promise<void>(resolve=>legacy.listen(0,'127.0.0.1',resolve));const port=(legacy.address()as{port:number}).port;
 const env:Record<string,string>={NAUMI_AGENT_LEGACY_ORIGIN:`http://127.0.0.1:${port}`,INTERNAL_APP_ORIGIN:'http://127.0.0.1:3000'};
 const bundle=(await build({stdin:{contents:'import {forwardLegacyAgentSession} from "./src/lib/agent/legacy-runtime";globalThis.testRoute=forwardLegacyAgentSession;',resolveDir:process.cwd()},platform:'node',format:'cjs',bundle:true,write:false,plugins:[{name:'fixture-auth-and-harness',setup(b){
  b.onResolve({filter:/^(server-only|\.\.\/request-auth|\.\/harness|\.\/runtime)$/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='server-only'?'':args.path==='./runtime'?'export function getSession(email,id){return email==="owner-a"&&id==="new-owned"?{}:null;}':args.path.includes('request-auth')?'export async function authenticatedEmail(r){return ["owner-a","owner-b"].includes(r.headers.get("cookie"))?r.headers.get("cookie"):null;}':
  'export async function readHarnessBody(r){return await r.json();}export function assertHarnessSessionId(s,k){if(!/^[\\w-]{1,64}$/.test(s)||(k==="canvas"&&!s.startsWith("cv-"))||(k==="workbench"&&s.startsWith("cv-")))throw Error("invalid");}export function harnessErrorResponse(){return Response.json({error:"invalid"},{status:400});}',loader:'js'}));
 }}]})).outputFiles[0].text;
 const context=vm.createContext({process:{env},require:createRequire(import.meta.url),fetch,Request,Response,Headers,URL,AbortSignal,console});vm.runInContext(bundle,context);const route=(context as any).testRoute as (request:Request)=>Promise<Response|null>;
 const req=(path:string,method='GET',body?:unknown,cookie='owner-a')=>new Request('http://app.fixture'+path,{method,headers:{cookie,host:'app.fixture',origin:'http://app.fixture','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const deadline=<T>(promise:Promise<T>)=>Promise.race([promise,new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(Error('SSE was buffered until completion')),2000);timer.unref();})]);
 const wait=async(predicate:()=>boolean)=>{const until=Date.now()+2000;while(!predicate()){assert.ok(Date.now()<until,'upstream stream cancellation must propagate');await new Promise(resolve=>setTimeout(resolve,20));}};
 try{
  const stream=await deadline(route(req('/api/agent','PUT',{sessionId:'old-ag',message:'original message',backend:'http://ignored.invalid'})));assert.ok(stream);assert.equal(stream.status,200);assert.equal(stream.headers.get('x-naumi-runtime'),'legacy');
  const reader=stream.body!.getReader(),first=await deadline(reader.read());assert.match(new TextDecoder().decode(first.value),/event: open/);assert.equal(streamResponses[0].writableEnded,false,'upstream has not completed when first SSE event arrives');await reader.cancel();await wait(()=>closedStreams===1);
  const before=mutations;assert.equal(await route(req('/api/agent','PUT',{sessionId:'new-ag',message:'new'})),null);assert.equal(mutations,before);
  assert.equal(await route(req('/api/agent','PUT',{sessionId:'old-ag',message:'foreign'},'owner-b')),null);assert.equal(mutations,before,'foreign account cannot route another live Map entry');
  assert.equal((await route(req('/api/agent','PUT',{sessionId:'old-ag'},'anonymous')))!.status,401);
  assert.equal((await route(req('/api/agent','PUT',{sessionId:'network-fail'})))!.status,503);assert.equal(mutations,before);
  assert.equal(await route(req('/api/agent','PUT',{sessionId:'new-owned'})),null,'current process owner uses its existing handler without a legacy dependency');assert.equal(mutations,before);
  assert.equal((await route(req('/api/agent','PUT',{sessionId:'unknown-after-probe'})))!.status,503);assert.equal(mutations,before+1,'network error after acceptance must not retry mutation');
  assert.equal((await route(req('/api/agent','PUT',{sessionId:'upstream-error'})))!.status,409);assert.equal(mutations,before+2);
  const canvas=await route(req('/api/canvas/assistant/control','POST',{sessionId:'cv-live',action:'steer',projectKey:'tree:a',message:'original steering'}));assert.equal(canvas!.status,200);assert.equal(canvas!.headers.get('set-cookie'),null);
  assert.deepEqual(JSON.parse(received.at(-1)!.body),{sessionId:'cv-live',action:'steer',projectKey:'tree:a',message:'original steering'});
  const canvasBefore=mutations;assert.equal(await route(req('/api/canvas/assistant/control','POST',{sessionId:'cv-live',action:'stop',projectKey:'tree:b'})),null);assert.equal(mutations,canvasBefore);
  const projectBody={mode:'agent',sessionId:'raw-session-a',projectKey:' tree:a ',messages:[{role:'user',content:'same original message'}]};
  assert.equal((await route(req('/api/canvas/assistant','POST',projectBody)))!.status,200);assert.equal(probes.at(-1)!.sessionId,scoped('project:tree:a','raw-session-a'));assert.deepEqual(JSON.parse(received.at(-1)!.body),projectBody);
  const anchorBody={mode:'agent',sessionId:'raw-anchor-a',anchorId:' art-a ',messages:[{role:'user',content:'same anchor message'}]};
  assert.equal((await route(req('/api/canvas/assistant','POST',anchorBody)))!.status,200);assert.equal(probes.at(-1)!.sessionId,scoped('art-a','raw-anchor-a'));assert.deepEqual(JSON.parse(received.at(-1)!.body),anchorBody);
  const nonAgentBefore=mutations;assert.equal(await route(req('/api/canvas/assistant','POST',{...projectBody,mode:'image'})),null);assert.equal(mutations,nonAgentBefore);
  assert.equal((await route(req('/api/agent/session?id=old-ag')))!.status,200);
  assert.equal((await route(req('/api/agent/session?id=old-ag','HEAD')))!.status,200,'HEAD must not attempt to parse an absent request body');
  assert.equal((await route(req('/api/agent?sessionId=old-ag','DELETE')))!.status,200);assert.equal(received.at(-1)!.method,'DELETE');
  assert.equal(await route(req('/api/agent/session')),null,'history listing stays on shared DB current handler');
  for(const origin of ['http://public.example:3000','http://127.0.0.1:3000','http://user:pw@127.0.0.1:12345','http://127.0.0.1:12345/path']){env.NAUMI_AGENT_LEGACY_ORIGIN=origin;assert.equal((await route(req('/api/agent?sessionId=old-ag')))!.status,503);}
  delete env.NAUMI_AGENT_LEGACY_ORIGIN;assert.equal(await route(req('/api/agent?sessionId=old-ag')),null);
  const workbench=readFileSync('src/app/api/agent/route.ts','utf8');assert.ok(workbench.indexOf('forwardLegacyAgentSession(request)')<workbench.indexOf('withBiRequest(request, () => handlePut'));
  const assistant=readFileSync('src/app/api/canvas/assistant/route.ts','utf8');assert.ok(assistant.indexOf('forwardLegacyAgentSession(request)')<assistant.indexOf('withBillingRequest(validated'));
  console.log('AGENT_LEGACY_ROUTING=PASS OWNER_PROJECT_SESSION_BOUND REAL_HTTP_SSE_OPEN_UNBUFFERED STREAM_CANCEL NEW_SESSION_CURRENT NO_RETRY_AMBIGUOUS_OR409 NO_CLIENT_BACKEND_OVERRIDE NO_DOUBLE_BILLING_WRAPPER PRIVATE_ORIGIN_ONLY PROVIDER_CALLS0');
 }finally{for(const response of streamResponses)response.destroy();legacy.closeAllConnections();await new Promise<void>(resolve=>legacy.close(()=>resolve()));}
}
main().catch(error=>{console.error(error);process.exitCode=1});
