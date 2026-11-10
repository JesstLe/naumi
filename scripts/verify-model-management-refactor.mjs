/** Full-source ModelManagement React A/B. Only auth/Next navigation and HTTP
 * responses are fixtures. Editors, browser crypto and publication client are real.
 * --static compiles the actual target and checks pure editor transitions for core;
 * it deliberately makes no claim of browser, API-handler or PG execution. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {generateKeyPairSync,privateDecrypt,constants,createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import ts from 'typescript';

const arg=name=>{const n=process.argv.indexOf(name);return n<0?undefined:process.argv[n+1]};
const root=path.resolve(arg('--source-root')||'.'),baseline=process.argv.includes('--baseline');
const identityAction=baseline?'修改显示名称':'名称与公开 ID';
const out=path.resolve(arg('--out')||path.join(process.env.MODEL_MANAGEMENT_EVIDENCE||'output/model-management-refactor','run'));
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const require=createRequire(import.meta.url),{createState}=require('./model-mapping-clarity-fixture.cjs');
let checks=0,browser,server,requests=[],snapshots=[],errors=[],failures=[],pendingGet=[],pendingPost=[],pendingDiscovery=[];
const eq=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ModelManagement}from'./src/components/admin/model-management/model-management';window.fixtureEvents=[];window.addEventListener('naumi:model-catalog-refresh',()=>window.fixtureEvents.push('refresh'));function App(){const[alive,setAlive]=useState(true);window.fixtureRoot={mount:()=>setAlive(true),unmount:()=>setAlive(false)};return alive?<ModelManagement/>:null}createRoot(document.getElementById('root')).render(<App/>);`;
const fixturePlugin={name:'auth-and-next-only',setup(b){
 b.onResolve({filter:/^(next\/link|@\/lib\/supabase)$/},a=>({path:a.path,namespace:'ports'}));
 b.onLoad({filter:/.*/,namespace:'ports'},a=>({loader:'tsx',resolveDir:root,contents:a.path==='next/link'?`import React from'react';export default({href,children,prefetch,...props})=><a href={href} {...props}>{children}</a>`:`export async function authHeader(){return {'x-fixture-auth':'synthetic-admin'}}`}));
}};
function initial(){
 const state=createState();for(const c of state.catalogs){c.fetchedAt='2026-10-27T01:00:00.000Z';c.models=[{id:'directory-new',label:'new model'}];}
 state.rows[0].scopeOptions.push({id:'canvas.image',label:'画布',available:true,selected:false,adminDefault:false});
 const video=state.rows.find(r=>r.modality==='video');video.videoConfig={routes:[{upstreamId:'video-native',model:'native-video-model',provider:'视频来源',editable:true,configured:true,definition:{modes:['text'],durationResolutionMap:[{durations:[5],resolutions:['720p']}],aspectRatios:['16:9']},profile:'openai-videos',sources:{modes:'admin',durationResolutionMap:'vendor',aspectRatios:'vendor'}}]};
 return state;
}
const functions=source=>{const ast=ts.createSourceFile('source.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),map=new Map();for(const node of ast.statements)if(ts.isFunctionDeclaration(node)&&node.name)map.set(node.name.text,node.getText(ast).replace(/^export /,''));return map};
try{
 const compiled=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:true,outfile:path.join(out,'app.js'),platform:'browser',format:'iife',jsx:'automatic',tsconfig:path.join(root,'tsconfig.json'),metafile:true,define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[fixturePlugin]});
 await fs.writeFile(path.join(out,'SOURCE_INPUTS.json'),JSON.stringify(Object.keys(compiled.metafile.inputs),null,2)+'\n');
 if(process.argv.includes('--static')){
  const main=await fs.readFile(path.join(root,'src/components/admin/model-management/model-management.tsx'),'utf8');
  eq(main.includes('async function api('),false);eq(main.includes('sessionStorage.'),false);eq(main.includes('window.dispatchEvent('),false);eq(main.includes('const [editor,setEditor]'),true);eq(main.includes('<ModelEditor editor={editor}'),true);eq(main.includes('<ModelMappingCard key={r.id}'),true);
  const target=path.join(out,'editor.cjs');await build({entryPoints:[path.join(root,'src/components/admin/model-management/editor-state.ts')],outfile:target,bundle:true,platform:'node',format:'cjs'});
  const {dispatchedEditor,registeredEditor}=require(target),state=initial(),row=state.rows[0],original={kind:'channels',row,draft:{mode:'priority',channels:[{upstreamId:'gpt-primary',enabled:true,priority:7,weight:9}]}};
  eq(dispatchedEditor(original),original);eq(dispatchedEditor({kind:'rename',row}),null);eq(dispatchedEditor({kind:'video-upgrade'}),null);eq(registeredEditor({kind:'register',providerId:'primary',model:'new',returnTo:original},state),original);eq(registeredEditor({kind:'register',providerId:'primary',model:'new'},state),null);eq(registeredEditor({kind:'register',providerId:'primary',model:'new',returnTo:{...original,row:{...row,id:'missing'}}},state),null);eq(original.draft.channels[0].weight,9);
  eq((await fs.readFile(path.join(root,'src/components/admin/model-config/provider-editor.tsx'),'utf8')).includes('export {encryptCredential} from "./credentials"'),true);
  const {refactorCases}=await import('./verification/refactor-cases.mjs');eq(new Set(refactorCases.map(c=>c.id)).size,refactorCases.length);
  await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',scope:'STATIC',checks,targetCompile:'ACTUAL',browser:false,apiHandlers:false,pg:false},null,2)+'\n');
  console.log(`MODEL_MANAGEMENT_REFACTOR=PASS MODE=STATIC CHECKS=${checks} TARGET_COMPILE=ACTUAL EDITOR_TRANSITIONS=ACTUAL BROWSER=NOT_RUN API=NOT_RUN PG=NOT_RUN SUPPLIER=0`);
 }else{
  if(arg('--original-source')){
   const old=functions(await fs.readFile(path.join(path.resolve(arg('--original-source')),'src/components/admin/model-management/model-management.tsx'),'utf8')),now=new Map();
   for(const f of await fs.readdir(path.join(root,'src/components/admin/model-management')))if(/\.tsx?$/.test(f))for(const [name,body]of functions(await fs.readFile(path.join(root,'src/components/admin/model-management',f),'utf8')))now.set(name,body);
   for(const [name,body]of old)if(name!=='ModelManagement')eq(now.get(name)?.replace(/^export /,''),body,`original function body: ${name}`);
   const credential=functions(await fs.readFile(path.join(root,'src/components/admin/model-config/credentials.ts'),'utf8')).get('encryptCredential'),original=functions(await fs.readFile(path.join(path.resolve(arg('--original-source')),'src/components/admin/model-config/provider-editor.tsx'),'utf8')).get('encryptCredential');eq(credential,original,'credential function exact');
  }
  let state=initial(),applied=new Map(),flags={unknown:false,reject:false,fail:false,drop:false,holdGet:false,holdPost:false,holdDiscovery:false};
  const pair=generateKeyPairSync('rsa',{modulusLength:4096}),pem=pair.publicKey.export({format:'pem',type:'spki'}).toString();
  const decode=wire=>Buffer.concat(wire.split('|').map(chunk=>privateDecrypt({key:pair.privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(chunk,'base64')))).toString('utf8');
  const grid=['low','medium','high','xhigh','max','auto'].flatMap(quality=>['1K','2K','4K','5K'].map(resolution=>({quality,resolution,effectiveQuality:quality,available:quality==='medium'&&resolution==='1K',credits:6,estimated:false})));
  function apply(op){
   if(applied.has(op.id))return applied.get(op.id);
   assert.equal(op.expectedVersion,state.version,'fixture publication CAS');const row=state.rows.find(r=>r.id===op.rowId);
   if(op.action==='rename'||op.action==='identity'){row.label=op.label;if(op.publicId){row.id=op.publicId;row.publicIds=[op.publicId];}}
   if(op.action==='switch')row.routes=[row.routes.find(r=>r.upstreamId===op.upstreamId)||{...row.routes[0],upstreamId:op.upstreamId}];
   if(op.action==='order')state.rows=op.rowIds.map(id=>state.rows.find(r=>r.id===id));
   if(op.action==='channels')row.supplierRouting=op.policy;
   if(op.action==='scope')row.features=row.scopeOptions.filter(f=>op.features.includes(f.id)).map(({id,label})=>({id,label}));
   if(op.action==='pricing')state.billingVersion++;
   if(op.action==='register')state.candidates.push({id:'registered-'+state.version,model:op.model,label:op.model,providerId:op.providerId,provider:state.providers.find(p=>p.id===op.providerId).name,modality:'image',verified:true,channelCompatible:true});
   if(op.action==='connect'){state.providers.push({id:'mvp-'+op.id,name:op.name,baseUrl:op.baseUrl,protocol:op.protocol,maxConcurrent:2,enabled:true,configured:true});state.catalogs.push({providerId:'mvp-'+op.id,status:'ok',stale:false,models:[],fetchedAt:'2026-10-27T01:00:00.000Z'});}
   state.version++;const result={publication:{phase:'applied'}};applied.set(op.id,result);return result;
  }
  server=createServer(async(req,res)=>{try{
   const u=new URL(req.url,'http://fixture'),send=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
   if(u.pathname==='/app.js'||u.pathname==='/app.css'){res.setHeader('content-type',u.pathname.endsWith('.js')?'application/javascript':'text/css');res.end(await fs.readFile(path.join(out,u.pathname.slice(1))));return;}
   if(!u.pathname.startsWith('/api/')){res.setHeader('content-type','text/html;charset=utf-8');res.end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):null;
   const record={url:req.url,method:req.method,body};requests.push(record);
   if(u.pathname==='/api/admin/pubkey')return send({pem});
   if(u.pathname!=='/api/admin/model-management')return send({error:'NO_EXTERNAL_OR_SUPPLIER_CALL'},403);
   if(req.method==='GET'){
    if(u.searchParams.has('feature'))return send({grid});const snapshot=structuredClone(state);
    if(flags.holdGet){flags.holdGet=false;pendingGet.push(()=>send(snapshot));return;}return send(snapshot);
   }
   if(body.action==='credential'){const plain=body.ciphertext?decode(body.ciphertext):body.keyPlain;record.body={action:body.action,providerId:body.providerId,credential:{sha256:sha(plain),bytes:Buffer.byteLength(plain),encrypted:!!body.ciphertext}};return send({id:'fixture-credential'});}
   if(body.action==='discover'){
    const catalog=state.catalogs.find(c=>c.providerId===body.providerId);
    if(flags.holdDiscovery){pendingDiscovery.push(()=>send(catalog));return;}return send(catalog);
   }
   if(flags.reject){flags.reject=false;return send({error:'fixture not staged',operationNotStaged:true,code:'METADATA_CHANGED'},409);}
   if(flags.fail){flags.fail=false;return send({error:'fixture failed',publication:{phase:'failed'}},409);}
   if(flags.holdPost){flags.holdPost=false;pendingPost.push(()=>send(apply(body)));return;}
   const result=apply(body);
   if(flags.unknown){flags.unknown=false;return send({publication:{phase:'unknown'}},202);}
   if(flags.drop){flags.drop=false;res.destroy();return;}return send(result);
  }catch(error){failures.push(error.stack);res.writeHead(500);res.end(JSON.stringify({error:error.message}));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1050}});await context.route('**/*',async route=>{
   const request=route.request();if(new URL(request.url()).origin!==origin)return route.abort();
   // Observe the real successful fixture write, then drop only its browser
   // response. Socket destroy is unsuitable: Chromium can retry it below fetch.
   if(flags.drop && request.method()==='POST' && request.url().endsWith('/api/admin/model-management') && !['discover','credential'].includes(request.postDataJSON()?.action)){flags.drop=false;await route.fetch();return route.abort('failed');}
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  const wait=async(fn)=>{for(let n=0;n<150;n++){if(await fn())return;await page.waitForTimeout(20);}throw Error('OBSERVER_TIMEOUT');};
  const settle=()=>page.waitForTimeout(35),dialog=()=>page.getByRole('dialog');
  const snapshot=async name=>{await settle();snapshots.push({name,html:await page.locator('main').evaluate(el=>el.outerHTML)});};
  const click=async name=>{await page.getByRole('button',{name,exact:true}).click();await settle();};
  const open=async(name,id='gpt-image')=>{const card=page.getByTestId('managed-model-'+id);const expand=card.getByRole('button',{name:/^配置$/});if(await expand.count() && await expand.getAttribute('aria-expanded')==='false')await expand.click();await card.getByRole('button',{name,exact:true}).click();await dialog().waitFor();await settle();};
  const cancel=async()=>{await dialog().getByRole('button',{name:'取消',exact:true}).click();await dialog().waitFor({state:'detached'});};
  const save=async name=>{await dialog().getByRole('button',{name,exact:true}).click();await wait(async()=>await page.getByRole('button',{name:'核对并继续',exact:true}).count()===0 && await dialog().count()===0);await settle();};
  const writes=()=>requests.filter(r=>r.method==='POST'&&!['discover','credential'].includes(r.body.action));
  await page.goto(origin);await page.getByRole('heading',{name:'GPT-Image-2.5',exact:true}).waitFor();await snapshot('models');
  await page.getByLabel('搜索模型',{exact:true}).fill('no match');await snapshot('no-match');eq(await page.getByRole('heading',{name:'没有匹配的模型'}).count(),1);await page.getByLabel('搜索模型',{exact:true}).fill('');
  // All actual editor trees retain original markup and callbacks.
  for(const [action,name]of [[identityAction,'rename'],['设置积分','price'],['更换模型','switch'],['供应通道','channels'],['参数设置','quality'],['分辨率设置','resolution'],['图像高级参数','advanced']]){
   await open(action);if(name==='price')await page.getByLabel('模型积分价格表',{exact:true}).waitFor();await snapshot(name);if(name==='advanced')await dialog().getByRole('button',{name:'关闭',exact:true}).click();else await cancel();
  }
  const card=page.getByTestId('managed-model-gpt-image');await card.getByRole('button',{name:/^编辑 .* 的应用范围$/}).click();await snapshot('scope');await cancel();
  await click('调整排序');await snapshot('order');await cancel();await open('视频能力','video');await snapshot('video');await cancel();
  await page.getByRole('tab',{name:/上游来源/}).click();await snapshot('sources');const source=page.locator('article').filter({has:page.getByRole('heading',{name:/现行主生图通道/})});await source.getByRole('button',{name:'查看模型目录'}).click();await snapshot('source-directory');
  await source.getByRole('button',{name:'添加模型',exact:true}).click();await snapshot('register');await cancel();await click('新增来源');await snapshot('connect');await cancel();
  await page.setViewportSize({width:390,height:900});await snapshot('sources-mobile');await page.getByRole('tab',{name:/模型映射/}).click();await snapshot('models-mobile');await page.setViewportSize({width:1440,height:1050});
  // Submit actual original drafts. HTTP fixtures acknowledge; PG suite below
  // independently exercises real handlers/CAS/credentials and frozen billing.
  await open(identityAction);await page.getByLabel('显示名称',{exact:true}).fill('Renamed fixture');await save('保存并生效');eq(writes().at(-1).body.label,'Renamed fixture');eq(await page.evaluate(()=>sessionStorage.getItem('naumi:admin:mvp:pending')),null);
  await open('设置积分');await page.getByLabel('模型积分价格表',{exact:true}).waitFor();await page.getByLabel('积分计价方式').selectOption('fixed');await page.getByLabel('每单位消耗积分').fill('11');await save('保存积分并生效');eq(writes().at(-1).body.pricing,{mode:'fixed',credits:11});eq(writes().at(-1).body.expectedBillingVersion,8);
  await page.getByTestId('managed-model-gpt-image').getByRole('button',{name:/^编辑 .* 的应用范围$/}).click();await page.getByRole('button',{name:'清空选择',exact:true}).click();await page.getByRole('checkbox',{name:'自由生图',exact:true}).check();await save('保存范围并生效');eq(writes().at(-1).body.features,['image.generate']);
  await open('参数设置');await page.getByLabel('medium显示名称').fill('常规');await save('保存参数并生效');eq(writes().at(-1).body.parameters.choices,[{id:'medium',label:'常规'}]);
  await open('分辨率设置');await save('保存分辨率并生效');eq(writes().at(-1).body.resolutions,['1K']);
  await open('供应通道');await save('保存通道并生效');eq(writes().at(-1).body.policy.mode,'priority');
  await open('更换模型');await page.getByRole('radio').first().check();await save('切换并生效');eq(writes().at(-1).body.action,'switch');
  await click('调整排序');await page.getByRole('button',{name:/^下移 /}).first().click();await save('保存排序并生效');eq(writes().at(-1).body.rowIds[0],'banana');
  await open('视频能力','video');await save('保存并生效');eq(writes().at(-1).body.routes[0].definition.modes,['text']);
  await open('图像高级参数');await save('恢复资料库默认值');eq(writes().at(-1).body.routes,null);
  // Local capability confirmation remains distinct from removed pricing consent.
  await page.getByRole('tab',{name:/上游来源/}).click();await click('新增来源');await page.getByLabel('来源名称',{exact:true}).fill('New fixture');await page.getByLabel('上游 URL',{exact:false}).fill('https://new.fixture.invalid/v1');await page.getByLabel('API Key',{exact:true}).fill('中文-fixture-credential'.repeat(65));await save('保存并发现模型');eq(requests.find(r=>r.body?.action==='credential').body.credential,{sha256:sha('中文-fixture-credential'.repeat(65)),bytes:Buffer.byteLength('中文-fixture-credential'.repeat(65)),encrypted:true});
  await page.getByRole('tab',{name:/模型映射/}).click();await open('供应通道');await page.getByLabel('调度方式',{exact:true}).selectOption('balanced');await page.getByText('从上游目录接入新模型',{exact:true}).click();await page.getByLabel('新增通道的上游来源').selectOption('primary');await page.getByRole('button',{name:'添加并确认能力',exact:true}).first().click();await page.getByText('我已确认该模型支持',{exact:false}).click();await dialog().getByRole('button',{name:'添加到可切换列表',exact:true}).click();await page.getByRole('dialog',{name:'供应通道与分流'}).waitFor();eq(await page.getByLabel('调度方式',{exact:true}).inputValue(),'balanced','original routing draft returns after registration');await cancel();
  // Pending persists over reload and uses byte-identical id/version/body.
  flags.unknown=true;await open(identityAction);await page.getByLabel('显示名称',{exact:true}).fill('Pending rename');await dialog().getByRole('button',{name:'保存并生效',exact:true}).click();await page.getByRole('button',{name:'核对并继续',exact:true}).waitFor();const pending=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('naumi:admin:mvp:pending'))),before=writes().length;await page.reload();await page.getByRole('button',{name:'核对并继续',exact:true}).waitFor();await settle();eq(writes().length,before,'no automatic replay on mount');await click('核对并继续');await wait(async()=>await page.getByRole('button',{name:'核对并继续',exact:true}).count()===0);eq(writes().at(-1).body,pending);eq(writes().length,before+1);eq(await page.evaluate(()=>sessionStorage.getItem('naumi:admin:mvp:pending')),null);
  flags.reject=true;await open('参数设置');await dialog().getByRole('button',{name:'保存参数并生效',exact:true}).click();await page.getByText('fixture not staged',{exact:true}).first().waitFor();eq(await page.evaluate(()=>sessionStorage.getItem('naumi:admin:mvp:pending')),null);eq(await dialog().count(),1,'known un-staged draft remains editable');await cancel();
  flags.fail=true;await open('参数设置');await dialog().getByRole('button',{name:'保存参数并生效',exact:true}).click();await page.getByText('fixture failed',{exact:true}).first().waitFor();eq(await page.evaluate(()=>sessionStorage.getItem('naumi:admin:mvp:pending')),null);await cancel();
  flags.drop=true;await open(identityAction);await page.getByLabel('显示名称',{exact:true}).fill('Dropped response');await dialog().getByRole('button',{name:'保存并生效',exact:true}).click();await page.getByRole('button',{name:'核对并继续',exact:true}).waitFor();await wait(()=>page.getByRole('button',{name:'核对并继续',exact:true}).isEnabled());const dropped=writes().at(-1).body,dropCount=writes().length;await settle();eq(writes().length,dropCount,'network error never automatically replays');eq(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('naumi:admin:mvp:pending'))),dropped);await click('核对并继续');await wait(async()=>await page.getByRole('button',{name:'核对并继续',exact:true}).count()===0);eq(writes().at(-1).body,dropped);eq(writes().length,dropCount+1);
  // Directory refresh has its own dedupe, not the publication mutation lock.
  await page.getByRole('tab',{name:/上游来源/}).click();flags.holdDiscovery=true;const discoverBefore=requests.filter(r=>r.body?.action==='discover').length;await page.getByRole('button',{name:'刷新 现行主生图通道 模型目录',exact:true}).evaluate(button=>{button.click();button.click();});await wait(()=>pendingDiscovery.length===1);eq(requests.filter(r=>r.body?.action==='discover').length-discoverBefore,1);flags.holdDiscovery=false;pendingDiscovery.shift()();await settle();await page.getByRole('tab',{name:/模型映射/}).click();
  // Complete common A/B observations before regression-specific timing changes.
  const commonRequests=structuredClone(requests),commonSnapshots=structuredClone(snapshots);
  // A previous refresh must not swallow the post-publish read or overwrite it.
  flags.holdGet=true;await click('刷新生效配置');await wait(()=>pendingGet.length===1);await open(identityAction);await page.getByLabel('显示名称',{exact:true}).fill('Fresh after publication');await save('保存并生效');pendingGet.shift()();await settle();const stale=await page.getByRole('heading',{name:'Fresh after publication',exact:true}).count()===0;eq(stale,baseline,'late pre-publication read');
  // Reset the independent next case to the server's current version. Baseline
  // deliberately displayed the older snapshot above, not a valid next CAS.
  await page.reload();await page.getByRole('heading',{name:'Fresh after publication',exact:true}).waitFor();
  // Submitted POST is not cancelled/replayed. A detached view cannot clear its
  // preserved operation or initiate another GET when its response arrives.
  flags.holdPost=true;await open(identityAction);await page.getByLabel('显示名称',{exact:true}).fill('Detached publication');await dialog().getByRole('button',{name:'保存并生效',exact:true}).click();await wait(()=>pendingPost.length===1);const detached=await page.evaluate(()=>sessionStorage.getItem('naumi:admin:mvp:pending')),getBefore=requests.filter(r=>r.method==='GET'&&r.url==='/api/admin/model-management').length,postBefore=writes().length;await page.evaluate(()=>window.fixtureRoot.unmount());await page.locator('main').waitFor({state:'detached'});pendingPost.shift()();await settle();eq(await page.evaluate(()=>sessionStorage.getItem('naumi:admin:mvp:pending')),baseline?null:detached);eq(writes().length,postBefore);eq(requests.filter(r=>r.method==='GET'&&r.url==='/api/admin/model-management').length-getBefore,baseline?1:0);
  await context.close();eq(errors,[]);eq(failures,[]);
  function normalize(rows){const ids=new Map();const walk=value=>{if(Array.isArray(value))return value.map(walk);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v)]));if(typeof value==='string')return value.replace(/[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}/gi,id=>{if(!ids.has(id))ids.set(id,'OP'+ids.size);return ids.get(id)});return value;};return walk(rows);}
  const normalized=normalize(commonRequests.filter(r=>r.method==='POST'));
  if(arg('--baseline-report')){const prior=JSON.parse(await fs.readFile(arg('--baseline-report'),'utf8'));eq(commonSnapshots,prior.snapshots,'all original actual React HTML');eq(normalized,prior.posts,'all original actual client request bodies');}
  const result={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',scope:'ACTUAL_REACT_WITH_HTTP_FIXTURE',checks,snapshots:commonSnapshots,posts:normalized,requests,stalePublicationRead:baseline?'STALE':'FRESH',detachedPublication:baseline?'CLEARS_PENDING_AND_READS':'PRESERVES_PENDING_NO_READ',actualCrypto:'RSA4096_LONG_UTF8',apiHandlers:false,realPg:false,external:0,supplier:0};await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');
  console.log(`MODEL_MANAGEMENT_REFACTOR=PASS MODE=${result.mode} CHECKS=${checks} SNAPSHOTS=${snapshots.length} REACT=ACTUAL RSA4096_LONG_UTF8=EXACT ORIGINAL_OPERATION=EXACT PRICE_VERSION=RETAINED LATE_READ=${result.stalePublicationRead} DETACHED_PENDING=${baseline?'LOST':'RETAINED'} API=FIXTURE SUPPLIER=0`);
 }
}catch(error){await fs.writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:error.stack,checks,requests,errors,failures},null,2)+'\n');throw error;}
finally{for(const release of [...pendingGet,...pendingPost,...pendingDiscovery]){try{release();}catch{}}await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}console.log('MODEL_MANAGEMENT_REFACTOR_CLEANUP=PASS OWN_BROWSER_CLOSED=1 OWN_LOOPBACK_CLOSED=1');}
