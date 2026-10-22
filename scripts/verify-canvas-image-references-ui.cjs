/* Actual React composer + canvas submit adapter. Loopback fixture services only;
 * this proves UI/transport contracts, not a paid provider or production acceptance. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const esbuild=require('esbuild'),sharp=require('sharp'),postcss=require('postcss'),tailwind=require('tailwindcss');
const {chromium,expect}=require('@playwright/test');
const root=process.cwd(),out=path.resolve('output/canvas-image-references-20261023');fs.mkdirSync(out,{recursive:true});
const entry=`import React,{useState,useRef,useEffect}from'react';import{createRoot}from'react-dom/client';
import{ImageReferenceComposer}from'@/components/canvas/image-reference-composer';import{useImageNodeDraft}from'@/components/canvas/use-image-node-draft';
import{resolveCanvasImageReferences,changeImageReferenceRole,imageReferenceManifest}from'@/lib/canvas/image-references';
import{referenceManifestError}from'@/lib/imagegen/reference-labels';import{submitCanvasImagegen}from'@/lib/imagegen/canvas-client';import{configureBrowserImageCache}from'@/lib/browser-image-cache';
configureBrowserImageCache(false);
const initial=['产品原图','场景参考','风格参考'].map((title,n)=>({key:'node:source-'+n,sourceNodeId:'source-'+n,title,url:'/images/'+n+'.png'}));
function App(){const[node,setNode]=useState('A'),[actor,setActor]=useState('a'),[readOnly,setReadOnly]=useState(false),[sources,setSources]=useState({A:initial,B:initial.slice(0,1)}),[status,setStatus]=useState(''),[located,setLocated]=useState('');
const draft=useImageNodeDraft(actor+':project',node,{prompt:'',ratio:'1:1'},readOnly),input=useRef(null);
const state=resolveCanvasImageReferences(sources[node],draft.referenceBindings),refs=state.references,error=referenceManifestError(draft.prompt,imageReferenceManifest(refs));
useEffect(()=>{if(JSON.stringify(state.bindings)!==JSON.stringify(draft.referenceBindings||[]))draft.setReferenceBindings(state.bindings)},[draft.key,JSON.stringify(state.bindings)]);
async function submit(){try{if(error)throw Error(error);const form=new FormData();form.set('prompt',draft.prompt);form.set('ratio','1:1');form.set('canvasReferences',JSON.stringify(imageReferenceManifest(refs)));for(const ref of refs){const file=ref.file||new File([await(await fetch(ref.url)).blob()],'ref-'+ref.number+'.png',{type:'image/png'});form.append('image',file)}const result=await submitCanvasImagegen(form,node,()=>{}, {owner:'fixture@example.test',project:'fixture'});setStatus(JSON.stringify(await result.json()))}catch(e){setStatus(e.message)}}
window.qa={state:()=>({node,prompt:draft.prompt,refs:refs.map(({number,role,title,key})=>({number,role,title,key})),error,located}),submit,submitForm:submitCanvasImagegen,actor:setActor,readOnly:setReadOnly};
return <main><nav><button onClick={()=>setNode('A')}>节点 A</button><button onClick={()=>setNode('B')}>节点 B</button><button onClick={async()=>{const file=new File([await(await fetch('/images/3.png')).blob()],'上传图片.png',{type:'image/png'});setSources(s=>({...s,[node]:[...s[node],{key:'upload:fixture-4',title:file.name,url:'/images/3.png',file}]}))}}>添加图片</button></nav>
<section><header>图片生成</header><ImageReferenceComposer key={draft.key||node} references={refs} prompt={draft.prompt} onPrompt={draft.setPrompt}
onRole={(key,role)=>draft.setReferenceBindings(changeImageReferenceRole(state.bindings,key,role))} onRemove={ref=>setSources(s=>({...s,[node]:s[node].filter(r=>r.key!==ref.key)}))}
onPreview={ref=>setStatus('预览 '+ref.title)} onLocate={setLocated} textareaRef={input} placeholder="描述画面，输入 @ 引用图片" readOnly={readOnly} error={error}/>
<footer><span>模型 · 自适应 · 1K</span><button onClick={submit}>生成</button></footer></section><output aria-label="提交结果">{status}</output></main>}
createRoot(document.getElementById('root')).render(<App/>);`;
fs.writeFileSync(path.join(out,'fixture.tsx'),entry);
async function main(){
 await esbuild.build({entryPoints:[path.join(out,'fixture.tsx')],outfile:path.join(out,'bundle.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"development"'},alias:{'@':path.join(root,'src'),react:path.join(root,'node_modules/react'),'react-dom':path.join(root,'node_modules/react-dom')}});
 await esbuild.build({stdin:{contents:`export{imagegenRequestSchema}from'./src/lib/imagegen/schema';export{compileImagegenPrompt}from'./src/lib/imagegen/prompt';export{resolveImagegenIntent}from'./src/lib/imagegen/intent';`,resolveDir:root},outfile:path.join(out,'contracts.cjs'),bundle:true,platform:'node',format:'cjs'});
 const contracts=require(path.join(out,'contracts.cjs'));
 const css=(await postcss([tailwind({content:[{raw:entry,extension:'tsx'},path.join(root,'src/components/canvas/image-reference-composer.tsx')],corePlugins:{preflight:true}})]).process('@tailwind base;@tailwind utilities;',{from:undefined})).css;
 const images=await Promise.all(['#e4826a','#689f90','#9392c8','#d1ac64'].map(color=>sharp({create:{width:200,height:240,channels:3,background:color}}).png().toBuffer()));
 const requests=[],errors=[];let lastPlan;
 const server=http.createServer(async(req,res)=>{try{
  const route=new URL(req.url,'http://127.0.0.1').pathname;
  if(route==='/bundle.js'){res.setHeader('content-type','text/javascript');return res.end(fs.readFileSync(path.join(out,'bundle.js')))}
  if(route==='/favicon.ico'){res.writeHead(204);return res.end()}
  if(route.startsWith('/images/')){res.setHeader('content-type','image/png');return res.end(images[Number(route.split('/').pop().split('.')[0])])}
  if(route==='/'){res.setHeader('content-type','text/html;charset=utf-8');return res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'\n:root{--canvas-ui-border:#dbe2ed;--canvas-ui-panel:#fff;--canvas-ui-muted:#7d889d}body{background:#f3f6fb;color:#263045;font:14px system-ui}main{max-width:820px;margin:40px auto;padding:12px}nav{display:flex;gap:12px;margin-bottom:18px}section{background:#fff;border:1px solid #dbe2ed;border-radius:18px;padding:18px;box-shadow:0 12px 50px #25344e0a}header{margin-bottom:16px;font-weight:600}footer{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e7ebf1;padding-top:12px;margin-top:12px}footer button{background:#394656;color:#fff;padding:8px 18px;border-radius:10px}output{display:block;margin-top:12px;overflow-wrap:anywhere}textarea{outline:none}.canvas-ui-control{background:#f8fafc;color:#263045}.canvas-ui-text{color:#354258}button:focus-visible,select:focus-visible{outline:2px solid #6366f1;outline-offset:2px}</style><div id="root"></div><script src="/bundle.js"></script>')}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);
  res.setHeader('content-type','application/json');
  if(route==='/api/imagegen/inputs'){
    const form=await new Request('http://127.0.0.1'+route,{method:'POST',headers:req.headers,body:bytes}).formData();const file=form.get('image'),buffer=Buffer.from(await file.arrayBuffer());const id='asset-'+requests.filter(r=>r.route===route).length;
    const pixel=await sharp(buffer).raw().toBuffer({resolveWithObject:true});requests.push({route,id,sha256:createHash('sha256').update(buffer).digest('hex'),pixel:[...pixel.data.subarray(0,3)]});return res.end(JSON.stringify({artworkId:id,url:'/images/0.png',width:200,height:240}));
  }
  if(route==='/api/imagegen/plan'||route==='/api/imagegen'){
    const {confirmation,...body}=JSON.parse(bytes);const request=contracts.imagegenRequestSchema.parse(body),intent=contracts.resolveImagegenIntent(request),prompt=contracts.compileImagegenPrompt(request,intent);
    requests.push({route,request,compiledPrompt:prompt});if(route==='/api/imagegen/plan'){lastPlan=JSON.stringify(request);return res.end(JSON.stringify({steps:[{operation:'edit'}],warnings:[],totalCredits:0,modelVersion:1,billingVersion:1,confirmationRequired:false,intent}))}
    assert.equal(JSON.stringify(request),lastPlan,'preview and submission must freeze identical references');return res.end(JSON.stringify({jobId:'fixture-job'}));
  }
  res.statusCode=404;res.end('{}');
 }catch(error){errors.push(error.stack);res.statusCode=400;res.end(JSON.stringify({error:error.message}))}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  const executable=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file=>fs.existsSync(file));
  browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base);
  const prompt=page.getByRole('textbox',{name:'节点提示词'});
  await prompt.fill('按钮引用');await page.getByRole('button',{name:'引用图片',exact:true}).click();await page.getByRole('listbox').getByRole('option').nth(1).click();await expect(prompt).toHaveValue('按钮引用【图2】');
  await prompt.fill('@');await prompt.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0);
  await prompt.fill('@风');await prompt.dispatchEvent('compositionstart');await expect(page.getByRole('listbox')).toHaveCount(0);await prompt.dispatchEvent('keydown',{key:'Enter',isComposing:true});await expect(prompt).toHaveValue('@风');await prompt.dispatchEvent('compositionend');await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await prompt.fill('采用@场景');await page.getByRole('listbox').getByRole('option').click();await expect(prompt).toHaveValue('采用【图2】');
  await page.getByLabel('图2用途').selectOption('edit-target');await page.getByLabel('图1用途').selectOption('insert');await page.getByLabel('图3用途').selectOption('style');
  assert.deepEqual(await page.locator('[data-reference-number]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-reference-number'))),['2','1','3']);
  await prompt.fill('把【图1】的产品放到【图2】，采用【图3】的光线');await page.getByRole('button',{name:'定位图2来源节点'}).click();assert.equal(await page.evaluate(()=>qa.state().located),'source-1');
  await page.getByRole('button',{name:'生成',exact:true}).click();await expect(page.getByLabel('提交结果')).toContainText('fixture-job');
  const submitted=requests.find(r=>r.route==='/api/imagegen').request;assert.deepEqual(submitted.inputs.map(i=>[i.reference.number,i.role]),[[2,'edit-target'],[1,'insert'],[3,'style']]);
  assert.deepEqual(requests.filter(r=>r.route==='/api/imagegen/inputs').map(r=>r.pixel),[[104,159,144],[228,130,106],[147,146,200]]);
  assert.match(requests.find(r=>r.route==='/api/imagegen').compiledPrompt,/把第2张输入图（图1）的产品放到第1张输入图（图2）/);
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'移除图2',exact:true}).click();await expect(page.getByRole('alert')).toContainText('图2已移除');const calls=requests.length;await page.getByRole('button',{name:'生成',exact:true}).click();assert.equal(requests.length,calls);
  await page.getByRole('button',{name:'添加图片',exact:true}).click();await expect(page.locator('[data-reference-number="4"]')).toBeVisible();await expect(page.locator('[data-reference-number="2"]')).toHaveCount(0);
  await page.getByLabel('图4用途').selectOption('edit-target');await prompt.fill('保留【图4】，采用【图3】的风格');await page.getByRole('button',{name:'生成',exact:true}).click();await expect.poll(()=>requests.filter(r=>r.route==='/api/imagegen').length).toBe(2);
  assert.equal(requests.filter(r=>r.route==='/api/imagegen').at(-1).request.inputs[0].reference.title,'上传图片.png');
  await page.getByRole('button',{name:'节点 B',exact:true}).click();await expect(prompt).toHaveValue('');await page.getByRole('button',{name:'节点 A',exact:true}).click();await expect(prompt).toHaveValue('保留【图4】，采用【图3】的风格');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  await prompt.fill('@');await prompt.press('ArrowDown');await prompt.press('Enter');await expect(prompt).toHaveValue('【图1】');
  const beforeInvalid=requests.length;assert.equal(await page.evaluate(async()=>{const form=new FormData();form.set('canvasReferences','not-json');try{await qa.submitForm(form,'A',undefined,{owner:'fixture@example.test',project:'fixture'});return null}catch(error){return error.accepted}}),false);assert.equal(requests.length,beforeInvalid);
  await page.reload();await expect(prompt).toHaveValue('【图1】');await expect(page.getByRole('alert')).toContainText('编辑目标');
  await page.evaluate(()=>qa.readOnly(true));await expect(page.getByLabel('图1用途')).toBeDisabled();await expect(page.getByRole('button',{name:'移除图1',exact:true})).toHaveCount(0);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({fixture:true,supplierCalls:0,checks:['mention picker','reference button','IME and escape','target reorder','source locate','roles and actual image bytes','preview/submit identity','dangling reference blocks submit','removed numbers not reused','uploaded reference target','node drafts','keyboard','mobile width','preflight not accepted','refresh missing upload target','read-only'],requests,errors},null,2));
  console.log('PASS canvas reference UI and transport fixture; supplier calls=0; evidence='+out);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1});
