'use strict';
// Real full Fuse/Variations components and receipt hook, bounded reader and input hash.
// React hook scheduling and transport are deterministic local boundaries, not a browser.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ts=require('typescript'),args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const source=path.resolve(arg('--source-root',process.cwd())),out=path.resolve(arg('--output-root','output/tool-generation-recovery')),baseline=args.includes('--baseline');
const records=[],traces=[],fixtures=[],loaded=new Map(),output=(job='job-original')=>({status:'done',images:[{id:'art-'+job,url:'/media/'+job+'.png'}],user:{email:'owner@example.test',credits:94}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(kind,entries=new Map()){
 let now=1000000,behavior=()=>Response.json({status:'pending'}),posts=[],gets=[],users=[],views=[];
 const store={getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
 const env={owner:'owner@example.test',credits:100,model:'model-a',textModel:'text-a'};
 const file=new File([Buffer.from('fixture pixels')],'input.png',{type:'image/png'});
 function view(withInput=true){
  const window=new EventTarget();window.location={search:''};window.localStorage=store;
  let pointer=0,stateOrdinal=0,rendering=false,queued=false,mounted=true,tree,component,slots=[],effects=[];
  const schedule=()=>{if(queued||!mounted)return;queued=true;queueMicrotask(()=>{queued=false;if(mounted)render()})};
  const seeded=kind==='fusion'?[{id:'s1',file,url:'blob:one'},{id:'s2',file,url:'blob:two'}]:{id:'s1',file,url:'blob:one'};
  const React={
   useState(init){const id=pointer++,ordinal=stateOrdinal++;if(!slots[id])slots[id]={value:ordinal===0&&withInput?seeded:typeof init==='function'?init():init};return [slots[id].value,value=>{const next=typeof value==='function'?value(slots[id].value):value;if(!Object.is(slots[id].value,next)){slots[id].value=next;schedule()}}]},
   useRef(value){const id=pointer++;return (slots[id]||=( {value:{current:value}})).value},
   useEffect(fn,deps){const id=pointer++,previous=slots[id];if(!previous||!deps||deps.some((v,i)=>!Object.is(v,previous.deps[i]))){slots[id]={...previous,deps};effects.push(()=>{previous?.cleanup?.();slots[id].cleanup=fn()})}},
  };
  const timers=new Map();let tid=0;
  function timer(fn,ms){const id=++tid;timers.set(id,true);if(ms<=2500)queueMicrotask(()=>{if(timers.delete(id)){now+=ms;fn()}});return id}
  class Clock extends Date{static now(){return now}}
  const cache=new Map();let workspace;
  const mocks={
   'react':React,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
   'next/navigation':{useRouter:()=>({})},'@/lib/cdn':{cdnUrl:x=>x},'@/lib/auth-context':{useAuth:()=>({user:{email:env.owner},remaining:env.credits,applyServerUser:u=>users.push(u),consumeCredits:()=>{}})},
   '@/lib/auth-modal-context':{useAuthModal:()=>({openAuth:()=>{}})},'@/lib/i18n/locale-context':{useI18n:()=>({locale:'zh'})},
   '@/lib/image-quality-context':{useImageQuality:()=>({quality:'medium'})},
   '@/lib/billing/preview':{useFeatureBilling:()=>({cost:6,quote:{modelId:env.model},submit:async(url,init)=>{const jobId='job-'+(posts.length+1);posts.push({url,jobId,owner:env.owner,workspace:workspace.currentWorkspace(),headers:Object.fromEntries(new Headers(init.headers))});return Response.json({jobId})}})},
   '@/lib/supabase':{authHeader:async()=>({'x-fixture-owner':env.owner,'x-naumi-workspace':workspace.currentWorkspace(),'x-naumi-text-model':env.textModel})},
   '@/components/tools/use-object-url-cleanup':{useObjectUrlCleanup:()=>{}},'@/components/tools/tool-demo':{getDemo:()=>({})},'@/lib/utils':{cn:(...items)=>items.filter(Boolean).join(' ')},
  };
  function load(relative){if(cache.has(relative))return cache.get(relative).exports;const filename=path.join(source,relative),bytes=fs.readFileSync(filename),m={exports:{}};cache.set(relative,m);loaded.set(relative,{path:filename,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
   function requireModule(name){
    if(Object.hasOwn(mocks,name))return mocks[name];
    const aliases={'@/lib/tool-generation-receipt':'src/lib/tool-generation-receipt.ts','@/lib/tool-ui':'src/lib/tool-ui.ts'};
    if(aliases[name])return load(aliases[name]);
    if(name.startsWith('.')){const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(relative),name));if(resolved==='src/lib/supabase')return mocks['@/lib/supabase'];for(const extension of ['.ts','.tsx'])if(fs.existsSync(path.join(source,resolved+extension)))return load(resolved+extension)}
    if(name==='@noble/hashes/sha256')return require(name);
    return {};
   }
   vm.runInNewContext(ts.transpileModule(bytes.toString('utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:requireModule,Request,Response,Headers,FormData,File,Blob,URL,URLSearchParams,Buffer,JSON,Map,Set,Date:Clock,Event,window,localStorage:store,crypto:crypto.webcrypto,TextEncoder,Uint8Array,ArrayBuffer,AbortController,setTimeout:timer,clearTimeout:id=>timers.delete(id),console,fetch:async(url,init)=>{const row={url,jobId:new URL(url,'http://fixture').searchParams.get('job'),owner:new Headers(init.headers).get('x-fixture-owner'),workspace:new Headers(init.headers).get('x-naumi-workspace')};gets.push(row);return behavior(row)}},{filename});return m.exports;
  }
  workspace=load('src/lib/saas/workspace-client.ts');
  const rel=kind==='fusion'?'src/components/fuse/fuse-client.tsx':'src/components/variations/variations-client.tsx';component=load(rel)[kind==='fusion'?'FuseClient':'VariationsClient'];
  function render(){if(rendering)return;rendering=true;pointer=0;stateOrdinal=0;tree=component();rendering=false;const pending=effects;effects=[];for(const run of pending)run()}
  render();
  const api={get tree(){return tree},action:()=>tree.props.onAction(),workspace,rerender:render,
   state(ordinal,value){let n=0;for(let i=0;i<slots.length;i++){if(slots[i]&&Object.hasOwn(slots[i],'value')&&!(slots[i].value&&typeof slots[i].value==='object'&&Object.hasOwn(slots[i].value,'current'))){if(n++===ordinal){slots[i].value=value;render();return}}}throw Error('state not found')},
   images:()=>{const matches=[];function walk(node){if(!node||typeof node!=='object')return;if(node.props?.src?.startsWith('/media/'))matches.push(node.props.src);for(const value of Object.values(node.props||{})){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value)}}walk(tree);if(typeof tree.props.children==='function')walk(tree.props.children(()=>{}));return matches},
   unmount(){mounted=false;for(const slot of slots)slot?.cleanup?.();},
  };views.push(api);return api;
 }
 const api={entries,posts,gets,users,env,view,setBehavior:fn=>behavior=fn,advance:n=>now+=n,close:()=>views.forEach(v=>v.unmount())};fixtures.push(api);return api;
}
async function until(predicate){for(let i=0;i<50&&!predicate();i++)await tick();assert.ok(predicate(),'fixture operation did not reach checkpoint')}
async function check(name,fn){const before=fixtures.length;try{await fn();records.push({name,pass:true})}catch(error){records.push({name,pass:false,error:error.stack})}finally{for(const f of fixtures.slice(before)){f.close();traces.push({name,posts:f.posts,gets:f.gets,appliedUserCount:f.users.length,retainedJobLeaves:[...f.entries.keys()].filter(k=>k.includes(':job:')).length})}}}
(async()=>{
 for(const kind of ['fusion','variation']){
  await check(kind+':body-interruption-pending-done',async()=>{const f=fixture(kind);let call=0;f.setBehavior(row=>++call===1?new Response(new ReadableStream({start(c){c.error(new Error('body interrupted'))}})):call===2?Response.json({status:'pending'}):Response.json(output(row.jobId)));const v=f.view();await v.action();await tick();assert.equal(f.posts.length,1);assert.equal(f.gets.length,3);assert.ok(v.images().length);f.close()});
  await check(kind+':html-error-pending-done',async()=>{const f=fixture(kind);let call=0;f.setBehavior(row=>++call===1?new Response('<html>gateway</html>',{status:502}):call===2?Response.json({status:'pending'}):Response.json(output(row.jobId)));const v=f.view();await v.action();await tick();assert.equal(f.posts.length,1);assert.equal(f.gets.length,3);assert.ok(v.images().length);f.close()});
  await check(kind+':timeout-click-reuses-job-without-credits',async()=>{const f=fixture(kind);f.setBehavior(()=>{f.advance(6*60_000);return Response.json({status:'pending'})});const v=f.view();await v.action();await tick();assert.match(v.tree.props.error,/原任务/);f.env.credits=0;f.setBehavior(row=>Response.json(output(row.jobId)));v.rerender();await v.action();await tick();assert.equal(f.posts.length,1);assert.equal(new Set(f.gets.map(x=>x.jobId)).size,1);assert.ok(v.images().length);f.close()});
  await check(kind+':refresh-only-gets-original-job',async()=>{const f=fixture(kind);f.setBehavior(()=>{f.advance(6*60_000);return Response.json({status:'pending'})});const first=f.view();await first.action();await tick();first.unmount();f.setBehavior(row=>Response.json(output(row.jobId)));const restored=f.view(false);await until(()=>restored.images().length>0);assert.equal(f.posts.length,1);assert.equal(new Set(f.gets.map(x=>x.jobId)).size,1);f.close()});
  await check(kind+':owner-switch-never-applies-late-result',async()=>{const f=fixture(kind);let done;f.setBehavior(()=>new Promise(resolve=>done=resolve));const v=f.view();const pending=v.action();await until(()=>!!done);f.env.owner='other@example.test';v.rerender();done(Response.json(output('old-owner')));await pending;await tick();assert.equal(v.images().length,0);assert.equal(f.users.length,0);assert.equal(f.gets.length,1);f.close()});
  await check(kind+':workspace-switch-never-applies-late-result',async()=>{const f=fixture(kind);let done;f.setBehavior(()=>new Promise(resolve=>done=resolve));const v=f.view();const pending=v.action();await until(()=>!!done);v.workspace.selectWorkspace('tenant:other');await tick();done(Response.json(output('old-scope')));await pending;await tick();assert.equal(v.images().length,0);assert.equal(f.users.length,0);assert.equal(f.gets.length,1);f.close()});
  await check(kind+':changed-draft-never-applies-late-result',async()=>{const f=fixture(kind);let done;f.setBehavior(()=>new Promise(resolve=>done=resolve));const v=f.view();const pending=v.action();await until(()=>!!done);v.state(kind==='fusion'?1:3,'new prompt');done(Response.json(output('old-draft')));await pending;await tick();assert.equal(v.images().length,0);assert.equal(f.users.length,0);f.close()});
  await check(kind+':different-model-is-distinct-input',async()=>{const f=fixture(kind);f.setBehavior(()=>{f.advance(6*60_000);return Response.json({status:'pending'})});const v=f.view();await v.action();await tick();f.env.model='model-b';v.rerender();f.setBehavior(row=>Response.json(output(row.jobId)));await v.action();await tick();assert.equal(f.posts.length,2);assert.equal(f.gets.at(-1).jobId,'job-2');assert.ok(v.images().length);f.close()});
  await check(kind+':restore-survives-late-model-catalog',async()=>{const f=fixture(kind);f.setBehavior(()=>{f.advance(6*60_000);return Response.json({status:'pending'})});const first=f.view();await first.action();await tick();first.unmount();f.env.model=undefined;let done;f.setBehavior(()=>new Promise(resolve=>done=resolve));const restored=f.view(false);await until(()=>!!done);f.env.model='model-a';restored.rerender();done(Response.json(output('job-1')));await until(()=>restored.images().length>0);assert.equal(f.posts.length,1);assert.equal(restored.tree.props.processing,false);f.close()});
  await check(kind+':different-draft-then-original-keeps-both-receipts',async()=>{const f=fixture(kind);f.setBehavior(()=>{f.advance(6*60_000);return Response.json({status:'pending'})});const v=f.view();await v.action();await tick();v.state(kind==='fusion'?1:3,'new prompt');await v.action();await tick();assert.equal(f.posts.length,2);v.state(kind==='fusion'?1:3,'');f.setBehavior(row=>Response.json(output(row.jobId)));await v.action();await tick();assert.equal(f.posts.length,2);assert.equal(f.gets.at(-1).jobId,'job-1');assert.ok(v.images().some(x=>x.includes('job-1')));f.close()});
  await check(kind+':missing-receipt-does-not-authorize-new-post',async()=>{const f=fixture(kind);f.setBehavior(()=>Response.json({status:'error',error:'任务不存在或已过期，请重试'}));const v=f.view();await v.action();await tick();f.setBehavior(row=>Response.json(output(row.jobId)));await v.action();await tick();assert.equal(f.posts.length,1);assert.equal(f.gets.at(-1).jobId,'job-1');f.close()});
  await check(kind+':needs-attention-retains-original-job',async()=>{const f=fixture(kind);f.setBehavior(()=>Response.json({status:'error',reviewRequired:true,error:'原任务需要核对'}));const v=f.view();await v.action();await tick();f.setBehavior(row=>Response.json(output(row.jobId)));await v.action();await tick();assert.equal(f.posts.length,1);assert.equal(f.gets.at(-1).jobId,'job-1');f.close()});
  await check(kind+':confirmed-terminal-error-permits-explicit-new-click',async()=>{const f=fixture(kind);f.setBehavior(()=>Response.json({status:'error',error:'Supplier credential expired'}));const v=f.view();await v.action();await tick();f.setBehavior(row=>Response.json(output(row.jobId)));await v.action();await tick();assert.equal(f.posts.length,2);assert.equal(f.gets.at(-1).jobId,'job-2');assert.ok(v.images().length);f.close()});
  await check(kind+':unrelated-text-preference-keeps-original-image-job',async()=>{const f=fixture(kind);f.setBehavior(()=>{f.advance(6*60_000);return Response.json({status:'pending'})});const v=f.view();await v.action();await tick();f.env.textModel='text-b';f.setBehavior(row=>Response.json(output(row.jobId)));await v.action();await tick();assert.equal(f.posts.length,1);assert.equal(f.gets.at(-1).jobId,'job-1');f.close()});
 }
 const failed=records.filter(r=>!r.pass),status=baseline?failed.length===24&&failed.every(r=>r.error.startsWith('AssertionError'))&&records.filter(r=>r.pass).every(r=>r.name.endsWith('different-model-is-distinct-input')||r.name.endsWith('confirmed-terminal-error-permits-explicit-new-click'))?'REPRODUCED':'UNEXPECTED_BASELINE':failed.length?'FAIL':'PASS';
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,baseline?'BASELINE.json':'MODIFIED.json'),JSON.stringify({status,sourceRoot:source,loaded:[...loaded].map(([file,x])=>({file,...x})),records,traces,network:0,supplierPosts:0,evidenceTier:'actual complete components/hook/reader/fingerprint; local hook scheduling, timers, auth and transport boundaries'},null,2));
 for(const r of records)console.log(`${r.pass?'PASS':'FAIL'} ${r.name}${r.error?' '+r.error.split('\n')[0]:''}`);
 console.log(`TOOL_GENERATION_RECOVERY=${status} CASES=${records.length} FAILED=${failed.length} NETWORK=0 SUPPLIER_POST=0`);process.exitCode=baseline?status==='REPRODUCED'?1:2:failed.length?2:0;
})().catch(error=>{console.error(error);process.exitCode=2});
