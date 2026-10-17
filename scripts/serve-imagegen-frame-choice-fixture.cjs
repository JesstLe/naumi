// Actual ImagegenPanel/schema/client/CSS. Auth/model catalog and local HTTP only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),esbuild=require('esbuild'),postcss=require('postcss'),tailwind=require('tailwindcss'),ts=require('typescript');
const port=Number(process.env.FIXTURE_PORT||14695);
(async()=>{
 const code=ts.transpileModule(fs.readFileSync('tailwind.config.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,m={exports:{}};new Function('require','module','exports',code)(require,m,m.exports);
 const css=(await postcss([tailwind({...m.exports.default,content:['src/components/imagegen/**/*.{ts,tsx}']})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')})).css;
 const output=await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{ImagegenPanel}from'./src/components/imagegen/imagegen-panel';const p=new URLSearchParams(location.search);const image=(id,role,label)=>({artworkId:id,role,label,url:'/image/'+id+'.png'});let inputs=p.has('empty')?[]:p.has('single')?[image('layout','edit-target','竖版海报')]:[image('product','edit-target','产品素材'),image('layout','reference','竖版海报')];if(p.has('multi'))inputs.push(image('layout2','reference','另一张参考海报'));window.fixture={results:[]};createRoot(document.getElementById('root')).render(<ImagegenPanel key={location.search} entry="canvas" inputs={inputs} modelId="image" sourceNodeId="fixture" onResult={result=>window.fixture.results.push(result)} onClose={()=>window.fixture.closed=true}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'output/imagegen-frame-choice-20261017/bundle',platform:'browser',format:'iife',jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture-isolation',setup(b){
  b.onResolve({filter:/^@\/lib\/(supabase|auth-context|model-config\/feature-client)$/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.endsWith('supabase')?`export async function authHeader(){return {}}`:args.path.endsWith('auth-context')?`export function useAuth(){return {ready:true,user:{email:'fixture@example.test'}}}`:`import{useState}from'react';const models=[{id:'image',label:'图片模型',qualities:['medium'],generationParameters:{ratios:['auto','1:1','3:4','9:16'],resolutions:['1K']}},{id:'square-only',label:'仅方图模型',qualities:['medium'],generationParameters:{ratios:['1:1'],resolutions:['1K']}}];const catalog={version:1,models};export function useFeatureModels(){const[selected,setSelected]=useState('image');return{catalog,selected,setSelected}}`,loader:'tsx',resolveDir:process.cwd()}));
  if(process.env.FIXTURE_SOURCE_ROOT)b.onLoad({filter:/imagegen-panel\.tsx$/},args=>({contents:fs.readFileSync(path.join(process.env.FIXTURE_SOURCE_ROOT,'src/components/imagegen/imagegen-panel.tsx'),'utf8'),resolveDir:path.dirname(args.path),loader:'tsx'}));
 }}]});
 const js=output.outputFiles.find(f=>f.path.endsWith('.js')).contents,modules=output.outputFiles.find(f=>f.path.endsWith('.css'))?.contents;
 const sharp=require('sharp'),images={};
 images.product=await sharp({create:{width:1500,height:1500,channels:3,background:'#edf3f8'}}).composite([{input:Buffer.from('<svg width="1500" height="1500"><rect x="550" y="500" width="400" height="600" rx="80" fill="#b7cce0"/><rect x="620" y="350" width="260" height="190" rx="30" fill="#607996"/></svg>')}]).png().toBuffer();
 images.layout=await sharp({create:{width:750,height:1000,channels:3,background:'#e7d2ca'}}).composite([{input:Buffer.from('<svg width="750" height="1000"><rect x="70" y="70" width="610" height="80" rx="14" fill="#b59083"/><rect x="260" y="290" width="230" height="420" rx="35" fill="#fff6ef"/><rect x="70" y="840" width="610" height="90" rx="14" fill="#b59083"/></svg>')}]).png().toBuffer();
 let plans=[],posts=[];
 const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://fixture'),p=u.pathname;const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data))};
  if(p==='/__fixture/state')return json({plans,posts});
  if(p==='/__fixture/reset'){plans=[];posts=[];return json({ok:true})}
  if(p.startsWith('/image/')){res.setHeader('content-type','image/png');return res.end(images[path.basename(p,'.png')]||images.layout)}
  if(p==='/api/imagegen/capabilities')return json({values:{mask:['supported']}});
  if(p==='/api/imagegen/plan'||p==='/api/imagegen'&&req.method==='POST'){
   let raw='';for await(const b of req)raw+=b;const request=JSON.parse(raw);
   if(p.endsWith('/plan')){plans.push(request);return json({request,intent:{operation:'edit',background:null,requirements:[],conflicts:[]},steps:[{key:'generate',operation:'edit',credits:6}],totalCredits:6,modelVersion:117,billingVersion:8,warnings:[],confirmationRequired:true})}
   posts.push(request);return json({operationId:request.operationId,jobId:'fixture-'+request.operationId,status:'succeeded',stage:'done',artifacts:[],chargedCredits:6});
  }
  if(p==='/api/imagegen'&&req.method==='GET'){const request=posts.at(-1);return json({operationId:request?.operationId,jobId:'fixture',status:'succeeded',stage:'done',artifacts:[],chargedCredits:6})}
  if(p.startsWith('/api/'))return json({error:'ISOLATED_FIXTURE_NO_EXTERNAL_CALLS'},403);
  if(p==='/app.js'){res.setHeader('content-type','application/javascript');return res.end(js)}
  if(p==='/checks.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync('scripts/verify-imagegen-frame-choice-browser.js'))}
  if(p==='/style.css'){res.setHeader('content-type','text/css');return res.end(css+'\n'+Buffer.from(modules||'').toString())}
  res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>画幅基准 · 本地验收</title><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/app.js"></script><script src="/checks.js"></script></body></html>');
 });server.listen(port,'127.0.0.1',()=>console.log('FIXTURE_READY=http://127.0.0.1:'+port+' SOURCE='+(process.env.FIXTURE_SOURCE_ROOT||'modified')+' SUPPLIER_CALLS=0'));
})().catch(error=>{console.error(error);process.exit(1)});
