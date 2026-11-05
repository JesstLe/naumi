// Actual session owner, runtime subscriber, SSE handler and UI
// status component. All dependencies are local fixtures; supplier calls=0.
require('tsx/cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript'),{build,buildSync}=require('esbuild');
const root=process.cwd(),canvas=fs.readFileSync('src/components/canvas/canvas-client.tsx','utf8');
const ast=ts.createSourceFile('canvas.tsx',canvas,99,true,4);let sendFunction;
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='sendAssistantMessage')sendFunction=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);
const ownerSource=fs.readFileSync('src/lib/canvas/assistant-session.ts','utf8');
assert.ok(canvas.includes('assistantSession.send(canvasAssistantContext(),continueText)'));
assert.ok(ownerSource.indexOf('turns:[...history')<ownerSource.indexOf('await context.submit('),'Owner publishes optimistic transcript before the SSE response');
const {receiveAssistantActivity,assistantLivePresentation}=require('../src/lib/canvas/assistant-live-state.ts');
const {createModelActivityTracker}=require('../src/lib/agent/model-activity.ts');
const Module=require('node:module'),originalLoad=Module._load;
Module._load=function(id,...args){return id==='server-only'?{}:originalLoad.call(this,id,...args)};
const {AgentHarness,PublicOutputBuffer}=require('../src/lib/agent/harness.ts');
Module._load=originalLoad;
let cases=1;const check=(ok,label)=>{assert.ok(ok,label);cases++;};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;

async function browserSubmit(){
 const source=fs.readFileSync('src/lib/canvas/assistant-session.ts','utf8');
 if(!fs.existsSync('src/components/canvas/use-canvas-assistant.ts'))throw Error('Session owner consumer missing');
 const compiled=buildSync({entryPoints:['src/lib/canvas/assistant-session.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
 const loaded={exports:{}};vm.runInNewContext(compiled,{module:loaded,exports:loaded.exports,require,console,process,Response,Request,Headers,AbortController,TextDecoder,TextEncoder,ReadableStream,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout});
 const session=loaded.exports.createCanvasAssistant().bind({account:'fixture',workspace:'personal',project:'workspace',key:'fixture',documentCurrent:()=>true,viewCurrent:()=>true,assertView:()=>{}});
 const response=deferred();let posted=0;
 const context={english:false,members:[],imageModelId:'fixture',ratio:'auto',resolution:'1K',quality:'medium',submit:async()=>{posted++;return response.promise},read:async()=>Response.json({}),merge:async()=>[],history:()=>{},upload:async()=>[],cue:()=>{},selectAnchor:()=>{},video:async()=>{},text:async()=>{},revealVideo:async()=>{}};
 session.input('先出初稿');const run=session.send(context);await Promise.resolve();const now=session.getSnapshot();
 check(now.busy&&now.turns.length===2&&now.turns[0].content==='先出初稿'&&now.turns[1].content==='', 'optimistic user turn visible during header wait');
 check(now.activity.phase==='connecting'&&now.input===''&&posted===1,'immediate connecting state without another request');
 response.resolve(Response.json({error:'fixture reject'},{status:400}));await run;
 check(!session.getSnapshot().busy&&session.getSnapshot().input==='先出初稿'&&session.getSnapshot().error==='fixture reject','preparation rejection restores draft and stops animation');
}

async function runtimeEvents(){
 const source=fs.readFileSync('src/lib/agent/runtime.ts','utf8'),start=source.indexOf('  let modelStartedAt = 0;'),end=source.indexOf('\n  session.agent = agent;',start);
 const secret='fixture-secret-not-for-public',harness=new AgentHarness('fixture@test.local','cv-fixture');harness.registerSecret(secret);
 let subscriber;const phases=[],deltas=[];const session={harness,events:[],onModelActivity:p=>phases.push(p),onDelta:s=>deltas.push(s)};
 const c={modelRequestedAt:0,streamDiagnostic:require('../src/lib/agent/stream-recovery.ts').streamDiagnostic,session,agent:{subscribe:fn=>subscriber=fn},createModelActivityTracker,PublicOutputBuffer,Date,console,recordBiModelCompletion:async()=>{},modelExecutionTelemetry:()=>null,email:'fixture@test.local',sessionId:'fixture',scope:null,persistAgentSession:async()=>{}};
 vm.createContext(c);vm.runInContext(compile(source.slice(start,end)),c);
 await subscriber({type:'message_start',message:{role:'assistant'}});
 for(let i=0;i<15;i++)await subscriber({type:'message_update',assistantMessageEvent:{type:'thinking_delta',delta:'PRIVATE_REASONING_CONTENT '+secret}});
 check(JSON.stringify(phases)==='["processing","thinking"]'&&deltas.length===0,'thinking emits only enum once, not reasoning or credentials');
 await subscriber({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'首段文字已实时显示。'}});
 check(deltas.join('')==='首段文字已实时显示。','real runtime text delivered before message_end without newline');
 await subscriber({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:secret.slice(0,8)}});
 check(!deltas.join('').includes(secret.slice(0,8)),'ambiguous credential suffix retained');
 await subscriber({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:secret.slice(8)+'。后段。'}});
 await subscriber({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'首段文字已实时显示。'+secret+'。后段。'}],provider:'naumi-local'}});
 check(!deltas.join('').includes(secret)&&!JSON.stringify(phases).includes('PRIVATE_REASONING'),'public output sanitization and activity privacy retained');
 check(phases.at(-1)==='responding','text event changes real lifecycle');
}

async function bundle(entry,state,modules,globals={}){
 const result=await build({entryPoints:[path.resolve(entry)],bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
  b.onResolve({filter:/\.module\.css$/},()=>({path:'css',namespace:'fixture'}));
  b.onResolve({filter:/.*/},args=>modules[args.path]&&(!args.path.startsWith('.')||path.resolve(args.importer)===path.resolve(entry))?{path:args.path,namespace:'fixture'}:undefined);
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='css'?'export default new Proxy({},{get:(_,key)=>key})':modules[args.path]||'',loader:'ts'}));
 }}]});const m={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module:m,exports:m.exports,require,console,__fixture:state,Response,Request,Headers,URL,Buffer,TextEncoder,ReadableStream,Date,DOMException,process,setInterval,clearInterval,setTimeout,clearTimeout,...globals});return m.exports;
}

async function serverStream(){
 const state={events:[],modelCalls:0,persisted:0,failures:0,released:0},first=deferred(),last=deferred();
 let now=1000;const timers=new Map();let id=0;
 state.session={events:state.events,agent:{state:{messages:[]},abort:()=>{},prompt:async()=>{state.modelCalls++;state.session.onModelActivity?.('thinking');await first.promise;state.session.onDelta?.('首段文字');await last.promise;state.session.agent.state.messages=[{role:'assistant',content:[{type:'text',text:'首段文字后段文字'}],stopReason:'stop'}];state.session.onDelta?.('后段文字');}},running:false};
 const modules={
  '@/lib/release-runtime/http':'export async function observeReleaseRequest(req,fn){return fn()};export async function routeAgentToOwner(){return null}',
  '@/lib/release-runtime/identity':'export function releaseRuntimeEnabled(){return false};export class ReleaseRuntimeError extends Error{};export function releaseError(){throw Error("unused")}',
  '@/lib/image-skills/server':'export async function resolveImageSkill(){return null}',
  '@/lib/image-skills/catalog':'export class SkillError extends Error{}',
  'next/server':'export const NextResponse=Response',
  '../request-auth':'export async function authenticatedEmail(){return "fixture@test.local"}',
  '../db':'export const dbEnabled=true;export async function listArtworksByIds(){return[]};export function getPool(){throw Error("NO_DB_CALL")}',
  '../rate-limit':'export function rateLimit(){return true}',
  '../model-config/context':'export function currentModelExecution(){return null}',
  '../model-config/server':'export async function getModelAdministration(){throw Error("NO_CONFIG_MUTATION")}',
  '../billing/synchronous':'export async function configuredToolCost(){};export async function completeSynchronousStream(){};export async function failSynchronousStream(){__fixture.failures++}',
  '../storage':'export function dataUrlToBytes(){return null};export function isManagedImageUrl(){return false};export async function readManagedObject(){throw Error("NO_MEDIA")}',
  '../vision-image':'export function toVisionDataUrl(){throw Error("NO_MEDIA")}',
  './canvas-reference-preview':'export async function readCanvasVisionReference(){throw Error("NO_MEDIA")}',
  './runtime':'export async function getOrCreateSession(){return __fixture.session};export function primeAgentSystemPrompt(){};export async function resolveVisionImages(){return[]};export async function persistAgentSession(){__fixture.persisted++};export function appendSessionEvent(s,type,data){s.events.push({type,data,at:Date.now()})};export const MODEL_ID="fixture";export async function completeAgentReleaseActivity(){__fixture.released++}',
  './canvas-history':'export function canvasSessionPrefix(){return "cv-fixture-"};export function canvasProjectSessionPrefix(){return "cv-fixture-"};export async function canvasAgentHistory(){throw Error("NO_HISTORY")}',
  './recovery':'export function classifyAgentFailure(){return {code:"FIXTURE_ERROR",message:"fixture failure"}}',
  '../canvas/video-node-service':'export async function authorizeVideoProject(){}',
  '../canvas/video-node-repository':'export async function getVideoNode(){return null}',
  './harness':'export async function readHarnessBody(request){return request.json()}',
 };
 modules['@/platform/db/pool']=modules['../db'];modules['@/lib/artworks/repository']=modules['../db'];
 modules['@/lib/billing/synchronous-operation']=modules['../billing/synchronous'];modules['../object-storage/runtime']=modules['../storage'];
 modules['../canvas/project-access']=modules['../canvas/video-node-service'];
 const FakeDate=class extends Date{static now(){return now;}};
 const {runCanvasAgent}=await bundle('src/lib/agent/canvas.ts',state,modules,{Date:FakeDate,setInterval:fn=>{const n=++id;timers.set(n,fn);return n},clearInterval:n=>timers.delete(n),setTimeout:()=>++id,clearTimeout:()=>{}});
 const request=()=>new Request('http://fixture/api/canvas/assistant',{method:'POST',body:JSON.stringify({sessionId:'fixture-session',projectKey:'workspace',messages:[{role:'user',content:'先出初稿'}]})});
 const response=await runCanvasAgent(request());check(response.status===200&&response.headers.get('x-accel-buffering')==='no','actual SSE no buffering headers');
 const reader=response.body.getReader(),decoder=new TextDecoder();let text='';const read=async()=>{const p=await reader.read();if(!p.done)text+=decoder.decode(p.value);return p;};
 while(!text.includes('"thinking"'))await read();check(text.includes('event: open')&&text.includes('event: activity')&&!text.includes('event: delta'),'actual SSE public activity precedes first text');
 now+=5100;for(const tick of timers.values())tick();while(!text.includes('event: heartbeat'))await read();check(state.events.every(e=>e.type!=='heartbeat'&&e.type!=='activity'),'heartbeat not persisted as a tool or completed step');
 first.resolve();while(!text.includes('首段文字'))await read();check(!text.includes('event: done')&&state.modelCalls===1,'first text arrives before full completion without extra model call');
 last.resolve();while(!(await read()).done){};check(text.includes('后段文字')&&text.includes('event: done'),'complete reply retains progressive content');
 check(timers.size===0&&state.session.onDelta===undefined&&state.session.onModelActivity===undefined,'terminal cleanup removes timers and lifecycle subscribers');
 const stoppedFirst=deferred(),stoppedLast=deferred();state.session.agent.prompt=async()=>{state.modelCalls++;await stoppedFirst.promise;state.session.onDelta?.('late');await stoppedLast.promise;};state.session.agent.state.messages=[];
 const stop=new AbortController(),r=request();const stopped=await runCanvasAgent(new Request(r,{signal:stop.signal}));const sr=stopped.body.getReader();await sr.read();stop.abort();
 check(timers.size===0&&state.session.onModelActivity===undefined,'abort immediately cleans heartbeat and callbacks');stoppedFirst.resolve();stoppedLast.resolve();while(!(await sr.read()).done){};
 check(state.modelCalls===2&&state.failures>0,'stop never creates another model request');
 state.session.agent.prompt=async()=>{throw Error('fixture upstream failure')};
 const failed=await runCanvasAgent(request()),failureText=await failed.text();
 check(failureText.includes('event: error')&&!failureText.includes('event: done'),'upstream error terminates the actual SSE with failure');
 check(timers.size===0&&state.session.onModelActivity===undefined&&!state.session.running,'error also cleans lifecycle callbacks and heartbeat');
}

async function ui(){
 let state={phase:'connecting'},clock=1000;state=receiveAssistantActivity(state,'open',{},clock);
 check(assistantLivePresentation(state,0,clock).fresh,'open establishes server stream status');
 state=receiveAssistantActivity(state,'activity',{phase:'thinking',delta:'PRIVATE_REASONING_CONTENT'},++clock);check(state.phase==='thinking'&&!JSON.stringify(state).includes('PRIVATE'),'public phase whitelist discards raw fields');
 state=receiveAssistantActivity(state,'heartbeat',{},clock+=5000);check(state.phase==='thinking','heartbeat does not invent a new thinking step');
 check(assistantLivePresentation(state,45000,clock).detail.includes('较慢'),'long-wait explanation without fabricated progress');
 check(assistantLivePresentation(state,45000,clock+16000).quiet&&!assistantLivePresentation(state,45000,clock+16000).fresh,'stale connection not labelled healthy');
 check(assistantLivePresentation(undefined,1000,1000).title==='正在处理你的请求','old backend without activity still has running state');
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');const {AssistantLiveStatus}=await bundle('src/components/canvas/assistant-live-status.tsx',{},{});
 const html=renderToStaticMarkup(React.createElement(AssistantLiveStatus,{activity:state,elapsed:45000,now:clock,responding:false}));
 check(html.includes('正在思考')&&html.includes('assistant-live-placeholder')&&html.includes('连接正常'),'waiting has animated structured visual feedback');
 const attention=renderToStaticMarkup(React.createElement(AssistantLiveStatus,{activity:state,elapsed:45000,now:clock,responding:false,attention:'waiting',label:'等待确认报价'}));
 check(attention.includes('等待确认报价')&&!attention.includes('assistant-live-placeholder')&&!attention.includes('连接正常'),'quote/attention is not mistaken for active generation');
 const tool=renderToStaticMarkup(React.createElement(AssistantLiveStatus,{activity:state,elapsed:45000,now:clock,responding:false,label:'正在生成图片'}));
 check(tool.includes('正在生成图片')&&!tool.includes('首段回复')&&!tool.includes('assistant-live-placeholder')&&!tool.includes('这次响应较慢'),'real running tool label overrides model waiting explanation');
 const css=fs.readFileSync('src/components/canvas/assistant-live-status.module.css','utf8');check(css.includes('prefers-reduced-motion')&&!html.includes('PRIVATE_REASONING'),'reduced-motion and no thinking transcript');
}
(async()=>{await browserSubmit();await runtimeEvents();await serverStream();await ui();console.log(`ASSISTANT_LIVE_FEEDBACK=PASS CASES=${cases} OPTIMISTIC_BEFORE_HEADERS=1 ACTUAL_RUNTIME_STREAM=1 ACTUAL_SSE_HEARTBEAT=1 REASONING_CONTENT=0 EXTRA_MODEL_CALLS=0 SUPPLIER_CALLS=0`);})().catch(error=>{console.error(error);process.exitCode=1});
