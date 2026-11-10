import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import sharp from 'sharp';

// Actual React/ReactFlow, CanvasImage, text node, cache, authorization batching,
// byte queue and browser decode. Only login/locale and media HTTP are fixtures.
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=path.resolve(arg('--source-root',repo));
const out=path.resolve(arg('--output-root',path.join(repo,'output/canvas-original-display')));
const mode=arg('--mode','MODIFIED'),renderDpr=Number(arg('--dpr','1'));let restored;
assert.ok(['BASELINE','MODIFIED','ROLLBACK','REPRODUCTION'].includes(mode));
const req=createRequire(path.join(repo,'package.json'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(out,{recursive:true});
const client=await fs.readFile(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8');
const image=await fs.readFile(path.join(root,'src/components/canvas/canvas-image.tsx'),'utf8');
restored=!image.includes('useStore');
const promoted=/\.react-flow__nodes,\s*[\s\S]{0,250}will-change:\s*transform/.test(await fs.readFile(path.join(root,'src/app/globals.css'),'utf8'));
if(mode==='MODIFIED')assert.ok(!restored&&!promoted);
if(mode==='REPRODUCTION')assert.ok(!restored&&promoted);
const globals=await fs.readFile(path.join(root,'src/app/globals.css'),'utf8');
const core=await build({entryPoints:[path.join(root,'src/lib/canvas/media-loading.ts')],bundle:true,write:false,platform:'node',format:'cjs'});
const module={exports:{}};vm.runInThisContext('(function(module,exports){'+core.outputFiles[0].text+'\n})')(module,module.exports);
const bands=[];
for(const dpr of [1,1.25,1.5,2,3,4])for(const width of [24,120,320,512,513,1600,1800]){
  const actual=module.exports.canvasMediaVariant(width,dpr);
  assert.equal(actual,restored?'original':width*dpr<=512?'thumbnail':width*dpr<=1600?'preview':'original');
  bands.push({width,dpr,actual});
}
if(restored){
  assert.doesNotMatch(image,/useStore|cdnThumb|observeCanvasImageSize/);
  assert.match(image,/const url=cdnUrl\(source\)/);
  assert.doesNotMatch(client,/CanvasRenderLayerGuard|canvas-render-layers/);
  assert.doesNotMatch(globals,/\.react-flow__(nodes|edges)[^{]*\{\s*will-change:\s*transform/);
  assert.doesNotMatch(globals,/\.canvas-ui-node-card\s*\{\s*contain:\s*paint/);
}else {assert.match(image,/canvasMediaVariant\(localWidth\*s.transform\[2\]/);if(mode==='MODIFIED'){assert.match(globals,/\.react-flow__nodes \{ will-change: auto; \}/);assert.match(globals,/\.react-flow__edges \{ will-change: transform; \}/);assert.match(globals,/contain: paint/);assert.match(client,/<CanvasRenderLayerGuard/);}}

const guard=restored?'':"import {CanvasRenderLayerGuard} from '@/components/canvas/canvas-render-layer-guard';";
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {ReactFlow,Background,Handle,Position} from '@xyflow/react';
import {CanvasImage} from '@/components/canvas/canvas-image';import {CometEdge} from '@/components/canvas/nodes/comet-edge';
import {TextCanvasNode} from '@/components/canvas/nodes/text-node';
import * as cache from '@/lib/browser-image-cache';${guard}
function ImageNode({data,selected}){return <div className="image-shell"><div className="node-title">{data.id==='subject'?'产品细节 · 原始测试图片':'图片'}</div><CanvasImage source={data.source} forceOriginal={selected} hasDimensions={true} data-testid={data.id} width={1200} height={750} style={{width:1200,height:750,display:'block',objectFit:'contain'}}/><Handle type="source" position={Position.Right}/><Handle type="target" position={Position.Left}/></div>}
function PerfImageNode({data}){return <div className="canvas-ui-node-card" style={{width:234,height:417,overflow:'hidden',background:'white'}}><CanvasImage source={data.source} forceOriginal={false} hasDimensions={true} style={{width:234,height:417,display:'block',objectFit:'contain'}}/><Handle type="source" position={Position.Right}/><Handle type="target" position={Position.Left}/></div>}
const nodeTypes={image:ImageNode,text:TextCanvasNode,perfImage:PerfImageNode},edgeTypes={comet:CometEdge};
const many=Array.from({length:234},(_,i)=>({id:'p'+i,type:i<166?'perfImage':'text',position:{x:(i%18)*1500,y:Math.floor(i/18)*1000},style:{width:i<166?234:380,height:i<166?417:i%12===0?9000:450},data:i<166?{source:'/media/perf-'+i+'.png'}:{__id:'p'+i,title:'Text '+i,content:('Canvas raster ABCDE 0123456789 '+i+'\\n').repeat(i%12===0?200:12),lightCanvas:true,readOnly:true}}));
const perfEdges=Array.from({length:150},(_,i)=>({id:'e'+i,source:'p'+i,target:'p'+(i+1),type:'comet'}));
const nodes=[{id:'a',type:'image',position:{x:0,y:0},data:{id:'subject',source:'/media/calibration.png'},style:{width:1200,height:750}},
{id:'b',type:'image',position:{x:1500,y:0},data:{id:'second',source:'/media/second.png'},style:{width:1200,height:750}},
{id:'text',type:'text',position:{x:3000,y:0},data:{__id:'text',title:'产品说明',content:${JSON.stringify('原文保持不变\n材质与规格：高清细节、自然光线、结构保持。\n不移动节点，不改变连线。')},lightCanvas:true,readOnly:true},style:{width:1100,height:750}},
{id:'far',type:'image',position:{x:20000,y:0},data:{id:'unseen',source:'/media/unseen.png'},style:{width:1200,height:750}}];
const root=createRoot(document.getElementById('app'));
window.fixture={...cache,large:()=>root.render(<ReactFlow nodes={many} edges={perfEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultViewport={{x:20,y:20,zoom:.08}} onInit={flow=>window.flow=flow} minZoom={.01} maxZoom={8} className=${JSON.stringify('canvas-ui-light '+(restored?'':'canvas-render-layers'))}><Background gap={32} color="#d4dbe4"/>${restored?'':'<CanvasRenderLayerGuard/>'}</ReactFlow>),empty:()=>root.render(null),show:()=>root.render(<ReactFlow nodes={nodes} edges={[{id:'edge-ab',source:'a',target:'b',type:'comet'}]} nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultViewport={{x:70,y:190,zoom:.0598}} onInit={flow=>window.flow=flow} minZoom={.01} maxZoom={8} className={${JSON.stringify('canvas-ui-light '+(restored?'':'canvas-render-layers'))}}><Background gap={32} color="#d4dbe4"/>${restored?'':'<CanvasRenderLayerGuard/>'}</ReactFlow>),
select:()=>window.flow.setNodes(ns=>ns.map(n=>({...n,selected:n.id==='a'}))),
replace:()=>window.flow.setNodes(ns=>ns.map(n=>n.id==='a'?{...n,data:{...n.data,source:'/media/replacement.png'}}:n))};`;
const bundled=await build({stdin:{contents:entry,resolveDir:repo,loader:'tsx'},bundle:true,write:false,metafile:true,platform:'browser',format:'iife',jsx:'automatic',absWorkingDir:repo,
  define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE':'"0"','process.env.NEXT_PUBLIC_IMAGE_BASE_URL':'""','process.env.NEXT_PUBLIC_MEDIA_VARIANTS':'"1"'},
  plugins:[{name:'source-and-boundaries',setup(b){
    b.onResolve({filter:/^\.\/supabase$|^@\/lib\/i18n\/locale-context$/},a=>({path:a.path.includes('locale')?'locale':'auth',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?'export async function authHeader(){return {}}':'export function useI18n(){return {locale:"zh"}}',loader:'js'}));
    b.onResolve({filter:/^@\//},async a=>{for(const ext of ['.tsx','.ts']){const p=path.join(root,'src',a.path.slice(2)+ext);if(await fs.stat(p).catch(()=>null))return {path:p};}throw Error('Missing '+a.path);});
    b.onResolve({filter:/^(react(?:\/|$)|react-dom(?:\/|$)|@xyflow\/react$)/},a=>({path:req.resolve(a.path)}));
  }}]});
const sourceSvg=`<svg width="2400" height="1500" xmlns="http://www.w3.org/2000/svg"><rect width="2400" height="1500" fill="#fff"/><rect x="40" y="40" width="2320" height="1420" rx="42" fill="#edf2e8"/><rect x="80" y="85" width="2240" height="270" rx="28" fill="#243d32"/><g fill="#fff" font-family="Microsoft YaHei,Arial"><text x="145" y="225" font-size="88" font-weight="700">产品细节 · ORIGINAL</text><text x="145" y="300" font-size="38">原始图片 2400 × 1500 / 本地清晰度测试素材</text></g><g font-family="Microsoft YaHei,Arial" fill="#20382d">${Array.from({length:13},(_,i)=>`<text x="125" y="${430+i*63}" font-size="${25+(i%3)*4}">SKU ${String(1100+i)}  ·  精细文字与线条  ·  ABCDEFGH 0123456789  ·  保持原始像素</text>`).join('')}</g>${Array.from({length:65},(_,i)=>`<path d="M${1600+i*9} 410 v850" stroke="${i%2?'#fff':'#1f392e'}" stroke-width="3"/>`).join('')}<circle cx="1910" cy="1140" r="170" fill="#c9804a"/><circle cx="1910" cy="1140" r="130" fill="#e8c5a7"/><text x="143" y="1400" fill="#20382d" font-family="Arial" font-size="48">NATIVE SOURCE / NO GENERATED OUTPUT</text></svg>`;
const original=await sharp(Buffer.from(sourceSvg)).png().toBuffer();
await fs.writeFile(path.join(out,'fixture-source.png'),original);
const variants={original,thumbnail:await sharp(original).resize({width:512}).webp({quality:76}).toBuffer(),preview:await sharp(original).resize({width:1600}).webp({quality:84}).toBuffer()};
const flowCss=await fs.readFile(req.resolve('@xyflow/react/dist/style.css'),'utf8');
const requests=[],errors=[],checks=[],screenshots=[],loaded=[];
for(const name of Object.keys(bundled.metafile.inputs))if(!name.includes('node_modules')&&!name.startsWith('fixture:')&&!name.startsWith('<')){
  const absolute=path.resolve(repo,name);loaded.push({path:absolute,sha256:hash(await fs.readFile(absolute))});
}
const server=createServer(async(request,response)=>{
  try{
    const url=new URL(request.url,'http://fixture.test');
    if(url.pathname==='/bundle.js'){response.setHeader('content-type','text/javascript');response.end(bundled.outputFiles[0].contents);return;}
    if(url.pathname==='/api/media/image-cache'){
      let raw='';for await(const c of request)raw+=c;const results={};
      for(const source of JSON.parse(raw).sources){const variant=new URL(source,'http://fixture.test').searchParams.get('variant')||'original',bytes=variants[variant];results[source]={account:'quality@fixture.test',source,version:hash(bytes),fetchUrl:source,bytes:bytes.length,contentType:variant==='original'?'image/png':'image/webp'};}
      response.setHeader('content-type','application/json');response.end(JSON.stringify({account:'quality@fixture.test',results}));return;
    }
    if(url.pathname.startsWith('/media/')){const variant=url.searchParams.get('variant')||'original';requests.push({source:request.url,variant,sha256:hash(variants[variant])});response.setHeader('content-type',variant==='original'?'image/png':'image/webp');response.end(variants[variant]);return;}
    response.setHeader('content-type','text/html');response.end(`<!doctype html><meta charset="utf-8"><style>${flowCss}\n${globals}\nhtml,body,#app{margin:0;width:100%;height:100%;font-family:Arial,"Microsoft YaHei",sans-serif;background:#f4f6f8;color:#243247}.header{position:fixed;z-index:100;left:20px;top:18px;background:#fff;border:1px solid #e1e6ed;border-radius:12px;padding:12px 18px;font-size:14px;font-weight:600;box-shadow:0 4px 20px #1720330a}.zoom{position:fixed;z-index:100;bottom:20px;left:20px;padding:12px 18px;background:white;border:1px solid #e1e6ed;border-radius:12px;font-size:13px}.image-shell{position:relative;background:#fff;border-radius:12px;overflow:visible}.image-shell img{border-radius:12px}.node-title{position:absolute;top:-50px;font-size:24px;white-space:nowrap;color:#344459}.canvas-ui-node-card{height:100%;background:white;border:1px solid #d9e1eb;overflow:hidden}.react-flow__node-text textarea{box-sizing:border-box;width:100%;height:100%;border:0;padding:30px;resize:none;background:#fff}.react-flow__node-text [data-testid=text-node-title]{font-size:26px;margin-bottom:15px}.react-flow__node-text button{display:none}</style><div id="app"></div><div class="header">画布图片质量 · 本地组件验证</div><div class="zoom">23.48%</div><script src="/bundle.js"></script>`);
  }catch(error){response.statusCode=500;response.end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
let page;
try{
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:renderDpr});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>!!window.fixture);
  await page.evaluate(()=>{window.fixture.activateBrowserImages('quality@fixture.test');window.fixture.show();});
  const expected=restored?2400:512;
  await page.waitForFunction(expected=>{const i=document.querySelector('[data-testid=subject]');return i?.complete&&i.naturalWidth===expected;},expected);
  assert.ok(!requests.some(r=>r.source.includes('unseen')));checks.push('OFFSCREEN_NO_ORIGINAL_DOWNLOAD');
  const first=await page.locator('[data-testid=subject]').evaluate(i=>({width:i.naturalWidth,height:i.naturalHeight,src:i.getAttribute('src'),variant:i.dataset.mediaVariant}));
  const plane=await page.locator('.react-flow__nodes').evaluate(i=>({willChange:getComputedStyle(i).willChange,contain:getComputedStyle(document.querySelector('[data-testid=text-node-card]')).contain}));
  assert.equal(first.variant,restored?'original':'thumbnail');
  if(restored)assert.equal(plane.willChange,'auto');
  else assert.equal(plane.willChange,promoted?'transform':'auto');
  assert.equal(plane.contain,restored?'none':'paint');
  checks.push('ACTUAL_SOURCE_BYTES_DECODED','NATIVE_RENDER_PLANE');
  await page.evaluate(()=>window.flow.setViewport({x:70,y:190,zoom:.2348}));await page.waitForTimeout(150);
  const screenshot=path.join(out,mode.toLowerCase()+'-23.48.png');await page.screenshot({path:screenshot});screenshots.push(screenshot);
  const sourceBefore=await page.locator('[data-testid=subject]').getAttribute('src');
  await page.locator('.react-flow__nodes').evaluate(e=>e.style.willChange='auto');await page.waitForTimeout(150);
  const native=path.join(out,'native-reference.png');await page.screenshot({path:native});
  assert.equal(await page.locator('[data-testid=subject]').getAttribute('src'),sourceBefore);
  const region={left:65*renderDpr,top:185*renderDpr,width:300*renderDpr,height:190*renderDpr},a=await sharp(screenshot).extract(region).removeAlpha().raw().toBuffer(),b=await sharp(native).extract(region).removeAlpha().raw().toBuffer();
  let rasterError=0;for(let i=0;i<a.length;i++)rasterError+=Math.abs(a[i]-b[i]);rasterError/=a.length;
  if(promoted)assert.ok(rasterError>1,'low-zoom compositor bitmap blur reproduced');else assert.ok(rasterError<.01,'same-source current-scale native raster');
  await page.locator('.react-flow__nodes').evaluate(e=>e.style.removeProperty('will-change'));
  checks.push('SAME_SOURCE_NATIVE_RASTER');
  const before=requests.length,initialPosition=await page.evaluate(()=>window.flow.getNodes().map(n=>({id:n.id,position:n.position}))),zooms=[];
  for(const zoom of [.0598,.2348,.5,1,1.6,.2348]){
    await page.evaluate(async z=>{await window.flow.setViewport({x:70,y:190,zoom:z});document.querySelector('.zoom').textContent=(z*100).toFixed(2)+'%';},zoom);
    await page.waitForFunction(()=>{const i=document.querySelector('[data-testid=subject]');return i?.complete&&i.naturalWidth>0;});
    await page.waitForTimeout(70);
    const current=await page.locator('[data-testid=subject]').evaluate(i=>({width:i.naturalWidth,variant:i.dataset.mediaVariant,src:i.getAttribute('src')}));
    if(restored){assert.equal(current.width,2400);assert.equal(current.src,first.src);assert.equal(current.variant,'original');}
    if(zoom===.5){const screenshot=path.join(out,mode.toLowerCase()+'-50.png');await page.screenshot({path:screenshot});screenshots.push(screenshot);}
    zooms.push({zoom,...current});
  }
  if(restored)assert.equal(requests.length,before,'zoom never changes the request');checks.push('ZOOM_5_98_TO_160_NO_QUALITY_DOWNGRADE');
  await page.evaluate(()=>window.fixture.select());await page.waitForFunction(()=>document.querySelector('[data-testid=subject]')?.naturalWidth===2400);
  if(restored)assert.equal((await page.locator('[data-testid=subject]').getAttribute('src')),first.src);checks.push('SELECTION_RETAINS_HIGH_FRAME');
  const saved=await page.locator('[data-testid=subject]').getAttribute('src'),count=requests.length;
  await page.evaluate(()=>window.flow.setViewport({x:-9000,y:190,zoom:.0598}));await page.waitForTimeout(80);
  await page.evaluate(()=>window.flow.setViewport({x:70,y:190,zoom:.0598}));await page.waitForTimeout(80);
  assert.equal(await page.locator('[data-testid=subject]').getAttribute('src'),saved);assert.equal(requests.length,count);checks.push('PAN_RETURN_DECODED_FRAME_RETAINED');
  assert.deepEqual(await page.evaluate(()=>window.flow.getNodes().map(n=>({id:n.id,position:n.position}))),initialPosition);checks.push('NODE_GEOMETRY_AND_EDGES_PRESERVED');
  if(restored)assert.ok(requests.every(r=>r.variant==='original'&&r.sha256===hash(original)));
  await page.evaluate(()=>window.fixture.replace());await page.waitForFunction(()=>document.querySelector('[data-testid=subject]')?.naturalWidth===2400);checks.push('SOURCE_REPLACEMENT_REAUTHORIZES');
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>window.fixture.empty());await page.waitForTimeout(40);await page.evaluate(()=>window.fixture.large());
  await page.waitForFunction(()=>window.flow.getNodes().length===234&&document.querySelectorAll('.react-flow__node').length===234);
  await page.waitForTimeout(650);
  const scene=await page.evaluate(async()=>{const before=window.flow.getNodes().map(n=>[n.id,n.position.x,n.position.y]);let times=[],last=performance.now();
    for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);let now=performance.now();times.push(now-last);last=now;await window.flow.setViewport({x:20+i,y:20+i*.5,zoom:.08+(i%45)*.002});}
    const sorted=[...times].sort((a,b)=>a-b);return{nodes:document.querySelectorAll('.react-flow__node').length,edges:document.querySelectorAll('.react-flow__edge').length,geometryUnchanged:JSON.stringify(before)===JSON.stringify(window.flow.getNodes().map(n=>[n.id,n.position.x,n.position.y])),frames:times.length,meanMs:times.reduce((a,b)=>a+b)/times.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:Math.max(...times),nodePlane:getComputedStyle(document.querySelector('.react-flow__nodes')).willChange,edgePlane:getComputedStyle(document.querySelector('.react-flow__edges')).willChange};});
  assert.equal(scene.nodes,234);assert.equal(scene.edges,150);assert.ok(scene.geometryUnchanged);
  if(mode==='MODIFIED'){assert.equal(scene.nodePlane,'auto');assert.equal(scene.edgePlane,'transform');assert.ok(scene.p95Ms<100,'local interaction smoke budget: repeated frames below 100ms');}
  checks.push('234_NODE_150_EDGE_INTERACTION_GEOMETRY');
  const sceneScreenshot=path.join(out,'234-node-scene.png');await page.screenshot({path:sceneScreenshot});screenshots.push(sceneScreenshot);
  const result={scene,renderDpr,mode,result:mode==='REPRODUCTION'?'REPRODUCED':'PASS',sourceRoot:root,rasterError,policyCases:bands.length,checks,first,plane,zooms,requests,screenshots,loaded,react:req('react/package.json').version,paidCalls:0,productionWrites:0,pageErrors:errors};
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));
  console.log(`${mode}_RASTER=${result.result} DPR=${renderDpr} POLICY_CASES=${bands.length} CHECKS=${checks.length} INITIAL_PIXELS=${first.width} QUALITY=${restored?'ALL_ORIGINAL':'STAGED'} NODE_PLANE=${plane.willChange.toUpperCase()} PAID_CALLS=0 EXIT=0`);
}catch(error){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:error.stack,errors,requests,checks},null,2));await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
