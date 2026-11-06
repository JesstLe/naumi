import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=process.cwd(),source=path.resolve(process.argv[2]||root),phase=process.argv[3]||'MODIFIED',out=path.join(root,'output/inline-node-references',phase);
await mkdir(out,{recursive:true});
const file=path.join(source,'src/lib/canvas/image-prompt-client.ts');
if(!existsSync(file)){console.log('INLINE_PROMPT_BASELINE=MISSING_PERSISTENT_REFERENCE_SYNC');process.exit(42);}
await build({entryPoints:[file],outfile:path.join(out,'client.cjs'),bundle:true,platform:'node',format:'cjs'});
const {ImagePromptClient}=createRequire(import.meta.url)(path.join(out,'client.cjs'));
const address={projectKey:'tree:root',nodeId:'art-a',workspace:'enterprise-a'};
const document=(prompt='保留【图1】')=>({version:1,prompt,bindings:[{key:'node:art-a',number:1,role:'edit-target'}],activeKeys:['node:art-a'],additionalKeys:[],hiddenReferenceIds:[]});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
let checks=0;const outputs=[];
async function test(name,run){await run();checks++;outputs.push(`PASS ${name}`);console.log(outputs.at(-1));}
await test('coalesced edits preserve node identity and frozen workspace',async()=>{
  const calls=[];const client=new ImagePromptClient(async(url,init)=>{calls.push({url,init});if(!init.method)return json({document:null,revision:0});const body=JSON.parse(init.body);return json({document:body.document,revision:1});},()=>true,()=>{},60000);
  try{await client.open('a',address);client.edit('a',document('初稿'));client.edit('a',document('最终【图1】'));await client.flush();assert.equal(calls.length,2);assert.equal(JSON.parse(calls[1].init.body).document.prompt,'最终【图1】');assert.equal(calls[1].init.headers['x-naumi-workspace'],'enterprise-a');assert.equal(calls[1].init.headers['x-naumi-project-context'],'tree:root');assert.equal(client.error('a'),null);}finally{client.dispose();}
});
await test('uncertain ACK retries original operation before newer text',async()=>{
  const calls=[],persisted=new Map();let dropped=false,revision=0;
  const client=new ImagePromptClient(async(_url,init)=>{if(!init.method)return json({document:null,revision:0});const body=JSON.parse(init.body);calls.push(body);if(!persisted.has(body.operationId)){assert.equal(body.expectedRevision,revision);persisted.set(body.operationId,{document:body.document,revision:++revision});}if(!dropped){dropped=true;throw Error('ACK_DROPPED');}return json(persisted.get(body.operationId));},()=>true,()=>{},60000);
  try{await client.open('a',address);client.edit('a',document('原操作'));await assert.rejects(client.flush(),/ACK_DROPPED/);client.edit('a',document('后来编辑'));await client.flush();assert.equal(calls.length,3);assert.equal(calls[0].operationId,calls[1].operationId);assert.notEqual(calls[1].operationId,calls[2].operationId);assert.equal(calls[1].document.prompt,'原操作');assert.equal(calls[2].document.prompt,'后来编辑');assert.equal(persisted.size,2);}finally{client.dispose();}
});
await test('two node queues cannot write into selected other node',async()=>{
  const sent=[];const client=new ImagePromptClient(async(_url,init)=>{if(!init.method)return json({document:null,revision:0});const body=JSON.parse(init.body);sent.push(body);return json({document:body.document,revision:1});},()=>true,()=>{},60000);
  try{await client.open('a',address);client.edit('a',document('A'));await client.open('b',{...address,nodeId:'art-b'});client.edit('b',document('B'));await client.flush();assert.deepEqual(sent.map(row=>[row.nodeId,row.document.prompt]).sort(),[['art-a','A'],['art-b','B']]);}finally{client.dispose();}
});
await test('CAS conflicts retain draft and do not overwrite remote revision',async()=>{
  let posts=0;const client=new ImagePromptClient(async(_url,init)=>{if(!init.method)return json({document:document('其他页面'),revision:2});posts++;return json({error:'提示词已更新',code:'IMAGE_PROMPT_CONFLICT'},409);},()=>true,()=>{},60000);
  try{await client.open('a',address);client.edit('a',document('本地编辑'));await assert.rejects(client.flush(),/提示词已更新/);assert.equal(posts,1);assert.equal((await client.open('a',address)).document.prompt,'本地编辑');assert.equal(client.error('a'),'提示词已更新');}finally{client.dispose();}
});
await test('account epoch stops queued writes even after A to B to A',async()=>{
  let epoch=1,posts=0;const client=new ImagePromptClient(async(_url,init)=>{if(init.method)posts++;return json({document:null,revision:0});},()=>epoch===1,()=>{},60000);
  try{await client.open('a',address);client.edit('a',document());epoch=3;await assert.rejects(client.flush(),/已切换/);assert.equal(posts,0);}finally{client.dispose();}
});
await test('server key order does not cause false ACK mismatch',async()=>{
  const client=new ImagePromptClient(async(_url,init)=>{if(!init.method)return json({document:null,revision:0});const d=JSON.parse(init.body).document;return json({document:Object.fromEntries(Object.entries(d).reverse()),revision:1});},()=>true,()=>{},60000);
  try{await client.open('a',address);client.edit('a',document());await client.flush();assert.equal(client.error('a'),null);}finally{client.dispose();}
});
await test('read rejection is visible and cannot write unknown revision',async()=>{
  let posts=0;const client=new ImagePromptClient(async(_url,init)=>{if(init.method)posts++;return json({error:'无权访问'},403);},()=>true,()=>{},60000);
  try{await assert.rejects(client.open('a',address),/无权访问/);client.edit('a',document());await client.flush();assert.equal(posts,0);assert.equal(client.error('a'),'无权访问');}finally{client.dispose();}
});
await test('in-flight save drains subsequent queued edit once',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve),sent=[];const client=new ImagePromptClient(async(_url,init)=>{if(!init.method)return json({document:null,revision:0});const body=JSON.parse(init.body);sent.push(body);if(sent.length===1)await gate;return json({document:body.document,revision:sent.length});},()=>true,()=>{},60000);
  try{await client.open('a',address);client.edit('a',document('first'));const draining=client.flush();await Promise.resolve();client.edit('a',document('second'));release();await draining;assert.deepEqual(sent.map(row=>row.document.prompt),['first','second']);assert.deepEqual(sent.map(row=>row.expectedRevision),[0,1]);}finally{client.dispose();}
});
await test('reload keeps original uncertain operation and unsaved body',async()=>{
  const cache=new Map(),storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
  const operations=new Map(),sent=[];let first=true,revision=0;
  const request=async(_url,init)=>{if(!init.method)return json({document:operations.size?[...operations.values()].at(-1).document:null,revision});const body=JSON.parse(init.body);sent.push(body);if(!operations.has(body.operationId))operations.set(body.operationId,{document:body.document,revision:++revision});if(first){first=false;throw Error('ACK_DROPPED');}return json(operations.get(body.operationId));};
  const before=new ImagePromptClient(request,()=>true,()=>{},60000,()=>storage);
  await before.open('scope-a',address);before.edit('scope-a',document('刷新前'));await assert.rejects(before.flush(),/ACK_DROPPED/);before.dispose();
  const after=new ImagePromptClient(request,()=>true,()=>{},60000,()=>storage);
  try{const recovered=await after.open('scope-a',address);assert.equal(recovered.document.prompt,'刷新前');await after.flush();assert.equal(sent[0].operationId,sent[1].operationId);assert.equal(operations.size,1);assert.equal(cache.size,0);}finally{after.dispose();}
});
await test('explicit use saved version drops conflicted local queue only',async()=>{
  const client=new ImagePromptClient(async(_url,init)=>init.method?json({error:'revision conflict'},409):json({document:document('服务器'),revision:4}),()=>true,()=>{},60000);
  try{await client.open('a',address);client.edit('a',document('本地'));await assert.rejects(client.flush());const receipt=await client.reloadSaved('a',address);assert.equal(receipt.document.prompt,'服务器');assert.equal(client.error('a'),null);}finally{client.dispose();}
});
await test('existing project scope wins over desktop default workspace',async()=>{
  let posted;
  const client=new ImagePromptClient(async(_url,init)=>{
    if(!init.method){assert.equal(init.headers['x-naumi-workspace'],undefined);return json({document:document('服务器'),revision:1,workspace:'enterprise-a'});}
    assert.equal(init.headers['x-naumi-workspace'],'enterprise-a');posted=JSON.parse(init.body);return json({document:posted.document,revision:2});
  },()=>true,()=>{},60000);
  try{await client.open('a',{...address,workspace:'personal'});client.edit('a',document('跨页后编辑'));await client.flush();assert.equal(client.workspace('a'),'enterprise-a');assert.equal(posted.document.prompt,'跨页后编辑');}finally{client.dispose();}
});
await test('explicit no-database mode retains local editor without saving claims',async()=>{
  let posts=0;const client=new ImagePromptClient(async(_url,init)=>{if(init.method)posts++;return json({document:null,revision:0,persisted:false});},()=>true,()=>{},60000);
  try{await client.open('a',address);client.edit('a',document('本地草稿'));await client.flush();assert.equal(posts,0);assert.equal(client.persisted('a'),false);}finally{client.dispose();}
});
const draftCache=()=>{const cache=new Map();return {cache,storage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)}};};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
await test('failed saved-version read retains uncertain operation and tab-local draft',async()=>{
  const {cache,storage}=draftCache(),sent=[];let reads=0,accept=false;
  const client=new ImagePromptClient(async(_url,init)=>{
    if(!init.method)return ++reads===1?json({document:null,revision:0}):json({error:'图片项目关系异常，请重新整理',code:'IMAGE_PROMPT_PROJECT_AMBIGUOUS'},409);
    const body=JSON.parse(init.body);sent.push(body);if(!accept)throw Error('ACK_DROPPED');return json({document:body.document,revision:1});
  },()=>true,()=>{},60000,()=>storage);
  try{
    await client.open('a',address);client.edit('a',document('未确认的原操作'));await assert.rejects(client.flush(),/ACK_DROPPED/);
    const pending=cache.get('naumi:image-prompt-pending:v1:a');assert.ok(pending);
    await assert.rejects(client.reloadSaved('a',address),/图片项目关系异常/);
    assert.equal(cache.get('naumi:image-prompt-pending:v1:a'),pending,'a failed reload must not delete the pending operation');
    assert.equal((await client.open('a',address)).document.prompt,'未确认的原操作');
    accept=true;await client.flush();assert.equal(sent.length,2);assert.equal(sent[0].operationId,sent[1].operationId);assert.equal(sent[0].expectedRevision,sent[1].expectedRevision);assert.equal(cache.size,0);
  }finally{client.dispose();}
});
await test('network and malformed saved-version reads preserve the current draft',async()=>{
  for(const failure of ['network','malformed']){
    const {cache,storage}=draftCache();let reads=0;
    const client=new ImagePromptClient(async(_url,init)=>{
      if(init.method){const body=JSON.parse(init.body);return json({document:body.document,revision:1});}
      if(++reads===1)return json({document:null,revision:0});if(failure==='network')throw Error('NETWORK_LOST');return json({document:null,revision:'wrong'});
    },()=>true,()=>{},60000,()=>storage);
    try{await client.open('a',address);client.edit('a',document('保留草稿'));const before=[...cache];await assert.rejects(client.reloadSaved('a',address));assert.deepEqual([...cache],before);assert.equal((await client.open('a',address)).document.prompt,'保留草稿');await client.flush();assert.equal(cache.size,0);}finally{client.dispose();}
  }
});
await test('successful saved-version read clears only the intentionally discarded queue',async()=>{
  const {cache,storage}=draftCache();let reads=0,posts=0;
  const client=new ImagePromptClient(async(_url,init)=>{
    if(init.method){posts++;return json({error:'revision conflict'},409);}
    return json({document:document(++reads===1?'旧服务器内容':'最新服务器内容'),revision:reads===1?2:5,workspace:'enterprise-a'});
  },()=>true,()=>{},60000,()=>storage);
  try{await client.open('a',address);client.edit('a',document('准备放弃的冲突草稿'));await assert.rejects(client.flush());assert.equal(cache.size,1);const receipt=await client.reloadSaved('a',address);assert.equal(receipt.document.prompt,'最新服务器内容');assert.equal(receipt.revision,5);assert.equal(cache.size,0);assert.equal(client.error('a'),null);await client.flush();assert.equal(posts,1);assert.equal((await client.open('a',address)).document.prompt,'最新服务器内容');}finally{client.dispose();}
});
await test('editing during a saved-version read wins over its stale response',async()=>{
  const {cache,storage}=draftCache(),entered=deferred(),release=deferred();let reads=0;
  const client=new ImagePromptClient(async(_url,init)=>{
    if(init.method){const body=JSON.parse(init.body);return json({document:body.document,revision:1});}
    if(++reads===1)return json({document:null,revision:0});entered.resolve();await release.promise;return json({document:document('服务器旧结果'),revision:3});
  },()=>true,()=>{},60000,()=>storage);
  try{await client.open('a',address);client.edit('a',document('点击前'));const reload=client.reloadSaved('a',address);await entered.promise;client.edit('a',document('读取时新编辑'));const pending=[...cache];release.resolve();await assert.rejects(reload,/已继续编辑|已变化/);assert.deepEqual([...cache],pending);assert.equal((await client.open('a',address)).document.prompt,'读取时新编辑');await client.flush();assert.equal(cache.size,0);}finally{client.dispose();}
});
await test('concurrent saved-version reads share one request and block queued flushes',async()=>{
  const entered=deferred(),release=deferred();let reads=0,posts=0;
  const client=new ImagePromptClient(async(_url,init)=>{
    if(init.method){posts++;throw Error('unexpected stale POST');}
    if(++reads===1)return json({document:null,revision:0});entered.resolve();await release.promise;return json({document:document('服务器版本'),revision:4});
  },()=>true,()=>{},60000);
  try{await client.open('a',address);client.edit('a',document('有意放弃'));const one=client.reloadSaved('a',address);await entered.promise;const two=client.reloadSaved('a',address),flush=client.flush();await Promise.resolve();assert.equal(reads,2);assert.equal(posts,0);release.resolve();const receipts=await Promise.all([one,two]);await flush;assert.equal(receipts[0].revision,4);assert.equal(receipts[1].revision,4);assert.equal(reads,2);assert.equal(posts,0);}finally{client.dispose();}
});
await test('account switch during saved-version read preserves the old pending storage',async()=>{
  const {cache,storage}=draftCache(),entered=deferred(),release=deferred();let epoch=1,reads=0;
  const client=new ImagePromptClient(async()=>{if(++reads===1)return json({document:null,revision:0});entered.resolve();await release.promise;return json({document:document('另一处响应'),revision:3});},()=>epoch===1,()=>{},60000,()=>storage);
  try{await client.open('a',address);client.edit('a',document('切换前草稿'));const pending=[...cache],reload=client.reloadSaved('a',address);await entered.promise;epoch=2;release.resolve();await assert.rejects(reload,/已切换/);assert.deepEqual([...cache],pending);}finally{client.dispose();}
});
await test('saved-version read waits for in-flight save before fetching authoritative receipt',async()=>{
  const entered=deferred(),release=deferred();let reads=0,saved=null;
  const client=new ImagePromptClient(async(_url,init)=>{
    if(init.method){const body=JSON.parse(init.body);entered.resolve();await release.promise;saved=body.document;return json({document:saved,revision:1});}
    reads++;return json({document:saved,revision:saved?1:0});
  },()=>true,()=>{},60000);
  try{await client.open('a',address);client.edit('a',document('正在保存'));const save=client.flush();await entered.promise;const reload=client.reloadSaved('a',address);await Promise.resolve();assert.equal(reads,1);release.resolve();await save;const receipt=await reload;assert.equal(reads,2);assert.equal(receipt.document.prompt,'正在保存');assert.equal(receipt.revision,1);}finally{client.dispose();}
});
await test('saved-version reload waits for an initial read without losing pending state on failure',async()=>{
  const {cache,storage}=draftCache(),entered=deferred(),release=deferred();let reads=0;
  const saved={desired:document('缓存中的草稿'),attempt:{document:document('缓存中的草稿'),operationId:'old-stable-operation',expectedRevision:0},revision:0};cache.set('naumi:image-prompt-pending:v1:a',JSON.stringify(saved));
  const client=new ImagePromptClient(async()=>{if(++reads===1){entered.resolve();await release.promise;return json({document:null,revision:0});}return json({error:'read blocked'},409);},()=>true,()=>{},60000,()=>storage);
  try{const initial=client.open('a',address);await entered.promise;const reload=client.reloadSaved('a',address);release.resolve();await initial;await assert.rejects(reload,/read blocked/);assert.equal((await client.open('a',address)).document.prompt,'缓存中的草稿');assert.equal(cache.get('naumi:image-prompt-pending:v1:a'),JSON.stringify(saved));}finally{client.dispose();}
});
const result=`INLINE_PROMPT_CLIENT=PASS checks=${checks} network=fixture supplier_calls=0`;
console.log(result);await writeFile(path.join(out,'client-result.json'),JSON.stringify({phase,source,checks,outputs,result,exit:0},null,2));
