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
const result=`INLINE_PROMPT_CLIENT=PASS checks=${checks} network=fixture supplier_calls=0`;
console.log(result);await writeFile(path.join(out,'client-result.json'),JSON.stringify({phase,source,checks,outputs,result,exit:0},null,2));
