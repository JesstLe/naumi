// Actual React video controls with a local documented catalog, no API or generation.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const esbuild=require('esbuild'),postcss=require('postcss'),tailwind=require('tailwindcss');
const root=process.cwd(),out=path.resolve('output/video-node-capabilities-20261023/ui-fixture');
const port=Number(process.env.VIDEO_CAPABILITY_FIXTURE_PORT||14339);
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const entry=`import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {VideoCompactComposer} from '@/components/canvas/video/compact-composer';
import {VideoParameterPanel} from '@/components/canvas/video/parameter-panel';
import {reconcileVideoSettings,catalogCapability} from '@/lib/video/client-settings';
import {resolveVideoCapability} from '@/lib/video/contract';
import {DOCUMENTED_VIDEO_FAMILIES} from '@/lib/model-config/video-family-capabilities';
const selected=['video-apib-seedance-2-0','video-apib-kling-v2-6','video-apib-wan2-5-preview','video-geeknow-h3'];
const entries=DOCUMENTED_VIDEO_FAMILIES.filter(x=>selected.includes(x.publicId)||x.providerId==='geeknow-video-h3');
const models=entries.map(x=>({providerId:'managed-video',modelId:x.publicId,label:x.model+(x.providerId==='geeknow-video-h3'?' · Geek':''),definition:resolveVideoCapability({manual:x.definition})}));
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#9caec3" width="100" height="100"/></svg>');
const choices=[1,2].map(n=>({id:'local-image-'+n,nodeId:'image:local-image-'+n,kind:'image',title:'本地参考图 '+n,value:image,available:true}));
function App(){const [config,setConfig]=useState(()=>reconcileVideoSettings({modelId:models[0].modelId,providerId:'managed-video',prompt:'清晨的海岸，镜头缓缓掠过海面。'},catalogCapability(models[0])).config),[inputs,setInputs]=useState([]),[blocked,setBlocked]=useState(false),[count,setCount]=useState(1);
 const cap=catalogCapability(models.find(x=>x.modelId===config.modelId));
 window.fixtureState={config,inputs,blocked,modelCount:models.length,supplierCalls:0};
 return <main><header><b>Naumi</b><span>视频节点 · 本地真实控件验收</span><label><input aria-label="锁定节点" type="checkbox" checked={blocked} onChange={e=>setBlocked(e.target.checked)}/> 锁定节点</label></header><div className="layout"><section className="canvas-ui-light fixture-node"><div className="preview"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="14" height="14" rx="3"/><path d="m17 10 4-3v10l-4-3"/></svg><span>视频预览</span></div><div className="composer"><VideoCompactComposer config={config} inputs={inputs} models={models} choices={choices} nodeId="local-video-node" light blocked={blocked} onConfig={setConfig} onInputs={setInputs} onImportBusyChange={()=>{}} onAdvanced={()=>{}} count={count} onCount={setCount} onOptimize={async p=>p} actions={<button disabled aria-label="生成视频">↑</button>} feedback={null}/></div></section><aside className="canvas-ui-light"><h2>生成参数</h2><VideoParameterPanel config={config} capability={cap} count={count} onCount={setCount} onConfig={next=>setConfig(reconcileVideoSettings(next,cap).config)} disabled={blocked}/></aside></div></main>;
}createRoot(document.getElementById('app')).render(<App/>);`;
 const input=path.join(out,'entry.tsx');fs.writeFileSync(input,entry);
 await esbuild.build({entryPoints:[input],bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:path.join(out,'app.js'),loader:{'.css':'local-css'},tsconfig:path.join(root,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'},banner:{js:'var process={env:{},browser:true};'}});
 const config=require(path.join(root,'tailwind.config.ts')).default;
 const css=await postcss([tailwind({...config,content:[...config.content,input]})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
 fs.writeFileSync(path.join(out,'style.css'),css.css);
 const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>视频节点能力验收</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:#f5f7fa;color:#283448;font-family:Arial,"Microsoft YaHei",sans-serif}main{max-width:1320px;margin:0 auto;padding:28px}header{display:flex;align-items:center;gap:20px;margin-bottom:30px}header b{font-size:24px;letter-spacing:-1px}header span{font-size:13px;color:#748095}header label{margin-left:auto;font-size:13px}.layout{display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:24px;align-items:start}.fixture-node,aside{border:1px solid #e0e6ee;border-radius:16px;background:#fff;box-shadow:0 10px 32px #2030490c;overflow:hidden}.preview{height:320px;background:linear-gradient(145deg,#e8eef3,#f4f7f9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#8c9cac;font-size:13px}.composer [data-composer-body]{padding:16px}.composer textarea{min-height:90px}aside{padding:20px}h2{font-size:14px;font-weight:600;margin:0 0 16px}@media(max-width:850px){main{padding:14px}.layout{grid-template-columns:1fr}.preview{height:220px}aside{width:100%}header{flex-wrap:wrap;gap:10px}}</style></head><body><div id="app"></div><script>window.fixtureErrors=[];window.addEventListener("error",e=>fixtureErrors.push(e.message));window.fetch=()=>{throw Error("Fixture has no API transport")};</script><script src="/app.js"></script></body></html>';
 fs.writeFileSync(path.join(out,'index.html'),html);
 if(process.argv.includes('--build')){console.log('VIDEO_CAPABILITY_UI_BUILD=PASS');return;}
 const server=http.createServer((req,res)=>{const name=({'/':'index.html','/app.js':'app.js','/app.css':'app.css','/style.css':'style.css'})[req.url];if(!name){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(path.join(out,name)));});
 server.listen(port,'127.0.0.1',()=>console.log('VIDEO_CAPABILITY_UI=http://127.0.0.1:'+port+' ACTUAL_REACT_CONTROLS=1 SUPPLIER_CALLS=0'));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
