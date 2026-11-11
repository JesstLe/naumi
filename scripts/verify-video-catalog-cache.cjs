/* 视频目录缓存 hook 的提交守卫回归(F2/F3/F4)。
 * 真实源码 src/lib/video/catalog-cache.ts 经 esbuild 转译执行;
 * React 原语以忠实语义的最小 shim 提供(state/ref/memo/effect+cleanup/依赖比对);
 * 目录发布总线与 scope 以受控桩注入;fetch 以受控响应队列驱动。
 * 证据层级:源码级逻辑回归(真实 hook 源码),非浏览器端到端;浏览器端到端见 verify-creation-home-browser.cjs。 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild');
const out=path.resolve('output/video-catalog-cache');fs.mkdirSync(out,{recursive:true});
const stubDir=path.join(out,'stubs');fs.mkdirSync(stubDir,{recursive:true});
const checks=[],failures=[];
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);console.log('PASS '+name);};

fs.writeFileSync(path.join(stubDir,'supabase.cjs'),'exports.authHeader=async()=>({});\n');
// 受控发布总线:记录安装顺序,供 F4 断言"模块级失效订阅先于面板订阅"。
fs.writeFileSync(path.join(stubDir,'catalog-refresh.cjs'),`
const listeners=[];
module.exports={
 subscribeModelCatalogRefresh(fn){listeners.push(fn);return()=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},
 publish(){for(const fn of listeners.slice())fn();},
 count(){return listeners.length;}
};\n`);
fs.writeFileSync(path.join(stubDir,'feature-client.cjs'),`
let scope='scope-A';
module.exports={useFeatureCatalogScope:()=>scope,__setScope:(s)=>{scope=s;}};\n`);
// 最小 React shim:渲染期顺序槽位 + 脏实例重渲染 + effect 依赖比对/清理。
fs.writeFileSync(path.join(stubDir,'react-shim.cjs'),`
let current=null,hookIndex=0;
const dirty=new Set();
function depsEq(a,b){return !!a&&!!b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));}
module.exports={
 useState(init){const i=hookIndex++,inst=current;
  if(inst.slots[i]===undefined)inst.slots[i]=typeof init==='function'?init():init;
  const set=(v)=>{const nv=typeof v==='function'?v(inst.slots[i]):v;
   if(!Object.is(nv,inst.slots[i])){inst.slots[i]=nv;dirty.add(inst);}};
  return [inst.slots[i],set];},
 useReducer(reducer,init){const i=hookIndex++,inst=current;
  if(inst.slots[i]===undefined)inst.slots[i]=init;
  const dispatch=(action)=>{const nv=reducer(inst.slots[i],action);
   if(!Object.is(nv,inst.slots[i])){inst.slots[i]=nv;dirty.add(inst);}};
  return [inst.slots[i],dispatch];},
 useRef(init){const i=hookIndex++,inst=current;
  if(inst.slots[i]===undefined)inst.slots[i]={current:init};
  return inst.slots[i];},
 useCallback(fn,deps){const i=hookIndex++,inst=current;
  if(inst.memo[i]===undefined)inst.memo[i]={fn,deps};
  const m=inst.memo[i];
  if(depsEq(deps,m.deps))return m.fn;
  m.fn=fn;m.deps=deps;return m.fn;},
 useEffect(fn,deps){const i=hookIndex++,inst=current;
  inst.effects[i]={fn,deps};},
 __createInstance(render){const inst={render,slots:[],memo:[],effects:{},mounted:{},unmounted:false};return inst;},
 __render(inst){current=inst;hookIndex=0;const r=inst.render();current=null;return r;},
 __flushEffects(inst){
  for(const key of Object.keys(inst.effects)){
   const e=inst.effects[key],p=inst.mounted[key];
   if(!p||!depsEq(e.deps,p.deps)){
    if(p&&typeof p.cleanup==='function')p.cleanup();
    const cleanup=e.fn();
    inst.mounted[key]={deps:e.deps,cleanup};
   }
  }},
 __unmount(inst){for(const key of Object.keys(inst.mounted)){const p=inst.mounted[key];if(p&&typeof p.cleanup==='function')try{p.cleanup();}catch{}}inst.unmounted=true;},
 __dirty:dirty
};\n`);

global.window={}; // catalog-cache 的 ensureInvalidationListener 有 window 守卫,node 测试需提供
const bundlePath=path.join(out,'catalog-cache.cjs');
const stubMap={'@/lib/supabase':path.join(stubDir,'supabase.cjs'),
 '@/lib/model-config/catalog-refresh':path.join(stubDir,'catalog-refresh.cjs'),
 '@/lib/model-config/feature-client':path.join(stubDir,'feature-client.cjs'),
 'react':path.join(stubDir,'react-shim.cjs')};
// 桩以 external 绝对路径保留运行时 require:与测试共享同一模块实例(esbuild 内联别名会产生两份模块状态)。
const stubPlugin={name:'stub-external',setup(build){
 build.onResolve({filter:/^(react|@\/lib\/.*)$/},args=>{
  const target=stubMap[args.path];
  return target?{path:target,external:true}:null;
 });
}};
const ReactShim=require(path.join(stubDir,'react-shim.cjs'));
const bus=require(path.join(stubDir,'catalog-refresh.cjs'));
const featureClientStub=require(path.join(stubDir,'feature-client.cjs'));
let cacheModule=null;

// 受控 fetch 队列:每个请求挂起,由测试按序应答。
let pendingFetches=[];
global.fetch=async()=>{const waiter={};waiter.done=new Promise(resolve=>{waiter.resolve=resolve;});pendingFetches.push(waiter);return waiter.done;};
const respond=(body,status=200)=>respondAt(0,body,status);
const respondAt=(index,body,status=200)=>{const waiter=pendingFetches.splice(index,1)[0];waiter.resolve({ok:status>=200&&status<300,status,json:async()=>body});};
const pendingCount=()=>pendingFetches.length;
async function pump(){for(let round=0;round<8;round++){await new Promise(r=>setTimeout(r,0));const d=[...ReactShim.__dirty];d.forEach(inst=>ReactShim.__dirty.delete(inst));for(const inst of d){ReactShim.__render(inst);ReactShim.__flushEffects(inst);}if(!ReactShim.__dirty.size)break;}}

function mountHook(){
 const state={models:null,ready:false,error:'',reload:null};
 const inst=ReactShim.__createInstance(()=>{
  const result=cacheModule.useVideoCatalogModels();
  state.models=result.models;state.ready=result.ready;state.error=result.error;state.scopeValue=featureClientStub.useFeatureCatalogScope();state.reload=result.reload;
  return result;
 });
 ReactShim.__render(inst);ReactShim.__flushEffects(inst);
 return {inst,state};
}

const v1=[{modelId:'m1',providerId:'p',label:'v1'}],v2=[{modelId:'m2',providerId:'p',label:'v2'}],v2b=[{modelId:'m3',providerId:'p',label:'v2b'}];

async function run(){
 // F4:冷挂载(无预取)——模块级失效订阅必须先于面板订阅安装;发布后的新响应必须提交。
 const h1=mountHook();
 check('f4-listeners-installed-on-cold-mount',bus.count()===2);
 await pump();check('f4-first-load-pending',pendingCount()===1&&h1.state.ready===false);
 bus.publish();                      // 模块监听先 epoch++,面板监听随后 refresh 捕获新代际
 await pump();check('f4-publish-starts-new-fetch',pendingCount()===2);
 respond({models:v1});await pump();  // 旧代际响应晚到:不得提交
 check('f4-stale-response-discarded',h1.state.ready===false&&pendingCount()===1);
 respond({models:v2});await pump();  // 新代际响应提交
 check('f4-fresh-response-commits',h1.state.ready===true&&h1.state.models[0].label==='v2');

 // F2:旧代际在途响应不得覆盖已提交的新目录(成功与失败分支)。
 bus.publish();await pump();check('f2-refresh-pending',pendingCount()===1);
 respond({models:v1},500);await pump();          // 失败分支:错误呈现但保留已知模型
 check('f2-failure-sets-error-keeps-models',h1.state.error==='视频模型读取失败'&&h1.state.models[0].label==='v2'&&h1.state.ready===true);
 bus.publish();await pump();                     // 再次发布:重拉
 const r1=pendingCount();check('f2-reload-pending',r1===1);
 respond({models:v2b});await pump();check('f2-newer-commits',h1.state.models[0].label==='v2b'&&h1.state.error==='');

 // F3:scope 切换后旧 scope 响应晚到(成功/失败)不得覆盖新 scope 状态。
 bus.publish();await pump();                     // 清缓存并发起 A 的在途请求
 check('f3-scope-a-inflight',pendingCount()===1);
 featureClientStub.__setScope('scope-B');
 ReactShim.__dirty.add(h1.inst);await pump();    // 切 B:缓存已清,必须真实发起 B 请求
 check('f3-scope-b-fetch-pending',pendingCount()===2);
 respondAt(1,{models:[{modelId:'b1',providerId:'p',label:'B-model'}]});await pump();  // 新 B 先提交
 check('f3-scope-b-ready',h1.state.models[0].label==='B-model'&&h1.state.ready===true&&h1.state.error==='');
 respond({models:[{modelId:'a1',providerId:'p',label:'A-model'}]});await pump();      // 旧 A 成功晚到
 check('f3-late-a-success-discarded',h1.state.models[0].label==='B-model'&&h1.state.ready===true&&h1.state.error==='');
 // 失败分支:再构造一条 A 在途请求,B 提交更新后让旧 A 的 500 晚到。
 featureClientStub.__setScope('scope-A');
 ReactShim.__dirty.add(h1.inst);await pump();    // 切回 A:同代际共享缓存命中,不重新请求
 check('f3-scope-a-cache-hit',h1.state.models[0].label==='A-model'&&pendingCount()===0);
 bus.publish();await pump();                     // 发布清缓存:A 重新请求
 check('f3-scope-a-refetch',pendingCount()===1);
 featureClientStub.__setScope('scope-B');
 ReactShim.__dirty.add(h1.inst);await pump();    // 切 B:缓存已清,真实请求
 check('f3-scope-b-refetch',pendingCount()===2);
 respondAt(1,{models:[{modelId:'b2',providerId:'p',label:'B2-model'}]});await pump();
 check('f3-b-committed',h1.state.models[0].label==='B2-model');
 respond({error:'x'},500);await pump();          // 旧 A 的 500 晚到
 check('f3-late-a-failure-discarded',h1.state.models[0].label==='B2-model'&&h1.state.ready===true&&h1.state.error==='');

 // F2 补强:同 scope 跨发布代际的旧失败晚到——新代际已提交后,旧代际 500 不得写入错误状态
 // (.catch 的 epoch 守卫;此前的 500 属同代际,未覆盖该守卫)。
 bus.publish();await pump();check('f2x-first-refresh-pending',pendingCount()===1);
 bus.publish();await pump();check('f2x-second-refresh-pending',pendingCount()===2);
 respondAt(1,{models:[{modelId:'n1',providerId:'p',label:'newer'}]});await pump();  // 新代际先提交
 check('f2x-newer-commits',h1.state.models[0].label==='newer'&&h1.state.error==='');
 respond({models:v1},500);await pump();                                            // 旧代际 500 晚到
 check('f2x-stale-failure-discarded',h1.state.models[0].label==='newer'&&h1.state.error==='');

 // F6:显式 reload 建立新代际——扣住 R1 后 reload 必须真实发起 R2,旧 R1 成功/失败晚到均不得覆盖。
 bus.publish();await pump();check('f6-r1-pending',pendingCount()===1);
 h1.state.reload();await pump();check('f6-reload-starts-new-fetch',pendingCount()===2);
 respondAt(1,{models:[{modelId:'r2',providerId:'p',label:'reload-2'}]});await pump();
 check('f6-reload-commits',h1.state.models[0].label==='reload-2'&&h1.state.error==='');
 respond({models:[{modelId:'r1',providerId:'p',label:'reload-1'}]});await pump();   // 旧 R1 成功晚到
 check('f6-old-success-late-discarded',h1.state.models[0].label==='reload-2'&&h1.state.error==='');
 bus.publish();await pump();check('f6-fail-r1-pending',pendingCount()===1);
 h1.state.reload();await pump();check('f6-fail-reload-pending',pendingCount()===2);
 respondAt(1,{models:[{modelId:'r4',providerId:'p',label:'reload-4'}]});await pump();
 check('f6-fail-reload-commits',h1.state.models[0].label==='reload-4');
 respond({models:v1},500);await pump();                                            // 旧 R1 500 晚到
 check('f6-old-failure-late-discarded',h1.state.models[0].label==='reload-4'&&h1.state.error==='');
 ReactShim.__unmount(h1.inst);
 check('f4-module-listener-survives-unmount',bus.count()===1);
}
(async()=>{ // buildSync 不支持 plugin,用异步 build 后再加载 bundle
 await build({entryPoints:['src/lib/video/catalog-cache.ts'],bundle:true,platform:'node',format:'cjs',outfile:bundlePath,plugins:[stubPlugin]});
 cacheModule=require(bundlePath);
 await run();
})().catch(e=>{failures.push(String(e.stack||e));console.error(e);process.exitCode=1;}).finally(()=>{
 fs.writeFileSync(path.join(out,'RESULTS.json'),JSON.stringify({checks,failures},null,2));
 console.log('VIDEO_CATALOG_CACHE='+JSON.stringify({checks:checks.length,failed:failures.length}));
});
