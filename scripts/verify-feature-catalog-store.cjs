/* 图片目录 store 的代际防护回归(F5/F6 + 五轮评审 superseded 衔接链两处修复)。
 * 真实源码 src/lib/model-config/feature-catalog.ts 经 esbuild 转译执行;
 * ports(read/失效/偏好)全部受控桩,read 用受控响应队列 + 可控回调屏障驱动。
 * 证据层级:源码级逻辑回归(真实 store 源码);浏览器端到端见 verify-creation-home-browser.cjs。 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild');
const out=path.resolve('output/feature-catalog-store');fs.mkdirSync(out,{recursive:true});
const stubDir=path.join(out,'stubs');fs.mkdirSync(stubDir,{recursive:true});
const checks=[],failures=[];
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);console.log('PASS '+name);};

fs.writeFileSync(path.join(stubDir,'public-identity.cjs'),'exports.canonicalPublicModelId=(models,id)=>id;\n');
fs.writeFileSync(path.join(stubDir,'image-model-routing.cjs'),'exports.compactImageModelOptions=(models)=>models;exports.imageModelDisplayId=(id)=>id;\n');
fs.writeFileSync(path.join(stubDir,'selection-policy.cjs'),'exports.adminConfiguredFeature=()=>false;\n');
const stubMap={'public-identity':path.join(stubDir,'public-identity.cjs'),
 'image-model-routing':path.join(stubDir,'image-model-routing.cjs'),
 'selection-policy':path.join(stubDir,'selection-policy.cjs')};
// 桩以 external 绝对路径保留运行时 require:与测试共享同一模块实例(内联会产生两份模块状态)。
const stubPlugin={name:'stub-external',setup(build){
 build.onResolve({filter:/\/(public-identity|image-model-routing|selection-policy)$/},args=>{
  const target=stubMap[args.path.split('/').pop()];
  return target?{path:target,external:true}:null;
 });
}};
const bundlePath=path.join(out,'feature-catalog.cjs');

const catalog=(version,defaultModelId)=>({managed:true,available:true,feature:'x',version,defaultModelId,models:[{id:defaultModelId,label:defaultModelId,modality:'text',supportsEdit:true}]});
const readRequests=[];
const drain=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setTimeout(r,0));};
// 应答载荷并放行回调屏障(默认路径)。
const respondAt=(index,body,status=200)=>{const entry=readRequests.splice(index,1)[0];entry.waiter.resolve({ok:status>=200&&status<300,status,json:async()=>body});entry.release();};
const respond=(body,status=200)=>respondAt(0,body,status);
// 只应答载荷、不放行回调屏障:制造"read 数据就绪但 store 成功回调暂缓"的确定窗口。
const holdCallback=(index,body,status=200)=>{const entry=readRequests.splice(index,1)[0];entry.waiter.resolve({ok:status>=200&&status<300,status,json:async()=>body});return entry;};
const settle=async promise=>Promise.race([promise.then(value=>({value}),error=>({error:String(error.message||error)})),new Promise(resolve=>setTimeout(()=>resolve({error:'TIMEOUT'}),2000))]);

async function main(){
 await build({entryPoints:['src/lib/model-config/feature-catalog.ts'],bundle:true,platform:'node',format:'cjs',outfile:bundlePath,plugins:[stubPlugin]});
 const {createFeatureCatalog}=require(bundlePath);
 let activeSession=1;
 const store=createFeatureCatalog({
  isCurrent:captured=>captured.session===activeSession,
  async read(feature,captured,isCurrent){
   const entry={waiter:{},release:null};
   entry.gate=new Promise(resolve=>{entry.release=resolve;});
   entry.waiter.done=new Promise(resolve=>{entry.waiter.resolve=resolve;});
   readRequests.push(entry);
   const response=await entry.waiter.done,data=await response.json();
   if(!response.ok)throw Error(data.error||'读取失败');
   if(!isCurrent())throw Error('创作空间已切换');
   await entry.gate;                       // 数据就绪与成功回调之间的可控屏障
   return data;
  },
  preference:()=>undefined,remember:()=>{},version:()=>{},selectionChanged:()=>{},
 });
 const switchIdentity=()=>{activeSession++;store.activate({actor:'u1',session:activeSession,workspace:'w',revision:1});};
 store.activate({actor:'u1',session:1,workspace:'w',revision:1});

 // F5:ensure 等待 R1 → 发布(全局失效)→ R2 先提交新目录 → R1 成功晚到:衔接当前代际,不报"模型目录已更新"。
 {
  const ensureResult=settle(store.ensure('f1'));
  await drain();check('t1-r1-pending',readRequests.length===1);
  store.invalidate();
  void store.load('f1').catch(()=>{});await drain();
  check('t1-r2-dispatched-after-invalidate',readRequests.length===2);
  respondAt(1,catalog(2,'new-model'));await drain();   // R2 先提交
  respond(catalog(1,'old-model'));await drain();        // R1 成功晚到
  const result=await ensureResult;
  check('t1-ensure-follows-current-generation',result.value==='new-model'&&result.error===undefined);
  check('t1-snapshot-is-new-generation',store.snapshot('f1').catalog?.version===2);
 }

 // F5 失败分支:相同时序下 R1 以失败晚到,不得用过时错误中断已具备新目录的操作。
 {
  const ensureResult=settle(store.ensure('f2'));
  await drain();store.invalidate();void store.load('f2').catch(()=>{});await drain();
  respondAt(1,catalog(2,'new-model-2'));await drain();
  respond({error:'x'},500);await drain();               // R1 失败晚到
  const result=await ensureResult;
  check('t2-ensure-survives-stale-failure',result.value==='new-model-2'&&result.error===undefined);
  check('t2-no-error-snapshot',store.snapshot('f2').error===null);
 }

 // F5 scope 隔离:等待期间切换身份(session 递增),原 scope 操作照常终止。
 {
  const ensureResult=settle(store.ensure('f3'));
  await drain();
  switchIdentity();
  respond(catalog(1,'old-model-3'));await drain();
  const result=await ensureResult;
  check('t3-ensure-rejects-after-scope-switch',typeof result.error==='string'&&result.error.includes('创作空间已切换'));
 }

 // F6:显式 reload(单项目失效)必须真实发起 R2,不得复用旧在途;旧 R1 成功晚到衔接新目录,不回退快照。
 {
  const before=readRequests.length;
  const p1=settle(store.load('f4'));
  await drain();check('t4-r1-pending',readRequests.length===before+1);
  store.invalidate('f4');
  const p2=settle(store.load('f4'));await drain();
  check('t4-reload-dispatches-new-request',readRequests.length===before+2);
  respondAt(1,catalog(2,'new-model-4'));await drain();  // R2 先提交
  respond(catalog(1,'old-model-4'));await drain();       // R1 成功晚到
  const r2=await p2,r1=await p1;
  check('t4-reload-commits-new',r2.value?.version===2);
  check('t4-old-request-follows-new',r1.value?.version===2&&r1.error===undefined);
  check('t4-snapshot-stays-new',store.snapshot('f4').catalog?.version===2);
 }

 // F6 失败分支:被取代的旧请求失败晚到,且没有新请求/新目录时,以"已更新"拒绝而非旧错误冒充结果,也不写错误快照。
 {
  const p1=settle(store.load('f5'));
  await drain();store.invalidate('f5');await drain();    // 显式失效但未发起新请求
  respond({error:'x'},500);await drain();
  const r1=await p1;
  check('t5-superseded-failure-reports-superseded',r1.error==='模型目录已更新');
  check('t5-no-error-snapshot',store.snapshot('f5').error===null);
 }

 // 对照:同代际真实失败必须照常写错误快照(防护不得过宽吞掉真错误)。
 {
  const p=settle(store.load('f6'));
  await drain();respond({error:'boom'},500);await drain();
  await p;
  check('t6-same-generation-failure-records-error',!!store.snapshot('f6').error);
 }

 // 发布全局失效覆盖另一 feature 的在途:旧响应晚到不提交,快照保持新代际。
 {
  const before=readRequests.length;
  const p1=settle(store.load('f7'));
  await drain();store.invalidate();                       // 模拟发布
  const p2=settle(store.load('f7'));await drain();
  check('t7-publish-dispatches-new-request',readRequests.length===before+2);
  respondAt(1,catalog(2,'new-model-7'));await drain();
  respond(catalog(1,'old-model-7'));await drain();
  const r2=await p2,r1=await p1;
  check('t7-publish-new-commits',r2.value?.version===2);
  check('t7-publish-old-not-revert',r1.value?.version===2&&store.snapshot('f7').catalog?.version===2);
 }

 // 五轮评审 1:连续两次失效,最后一次无接替——旧代际快照(上一代际提交)不得冒充当前代际衔接目标。
 {
  const ensureResult=settle(store.ensure('f8'));
  await drain();check('t8-r1-pending',readRequests.length===1);
  store.invalidate();void store.load('f8').catch(()=>{});await drain();   // G1:发布+R2
  respondAt(1,catalog(2,'gen1-model'));await drain();                      // R2 提交 G1 快照
  store.invalidate();await drain();                                        // G2:再发布,无订阅者无接替
  respond(catalog(1,'gen0-model'));await drain();                          // G0 的 R1 成功晚到
  const result=await ensureResult;
  check('t8-stale-snapshot-not-successor',result.error==='模型目录已更新'&&result.value===undefined);
  check('t8-g1-snapshot-retained-not-recommitted',store.snapshot('f8').catalog?.defaultModelId==='gen1-model');
 }

 // 五轮评审 2:代际变化+身份切换+新身份请求仍在途——旧身份成功回调必须立即拒绝,不得等待或接上其他身份的请求。
 {
  const ensureResult=settle(store.ensure('f9'));
  await drain();check('t9-r1-pending',readRequests.length===1);
  store.invalidate('f9');                                  // 代际递增(身份仍为 A)
  const held=holdCallback(0,catalog(1,'a-model'));         // R1 数据就绪,成功回调暂缓
  await drain();                                           // read 已通过 isCurrent(A),挂起在回调屏障
  switchIdentity();                                        // 切到身份 B
  void store.load('f9').catch(()=>{});await drain();       // B 的 R2 在途
  const pendingBefore=readRequests.length;
  held.release();await drain();                            // 放行 A 的成功回调
  const result=await ensureResult;
  check('t9-stale-scope-rejected-immediately',result.error==='创作空间已切换'&&result.error!=='TIMEOUT');
  check('t9-did-not-chain-onto-new-identity',readRequests.length===pendingBefore);
  respondAt(0,catalog(2,'b-model'));await drain();         // 收尾 B 的在途请求
 }
}
main().catch(e=>{failures.push(String(e.stack||e));console.error(e);process.exitCode=1;}).finally(()=>{
 fs.writeFileSync(path.join(out,'RESULTS.json'),JSON.stringify({checks,failures},null,2));
 console.log('FEATURE_CATALOG_STORE='+JSON.stringify({checks:checks.length,failed:failures.length}));
});
