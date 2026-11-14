// Local-only native Next canvas + mock API. No DB or supplier connections.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync,appendFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
if(process.env.NAUMI_CANVAS_SELECTION_FIXTURE!=='1')throw Error('Explicit isolated fixture flag required');
const evidence=process.env.CANVAS_SELECTION_EVIDENCE; if(!evidence)throw Error('Evidence directory required');mkdirSync(evidence,{recursive:true});
const port=Number(process.env.CANVAS_SELECTION_PORT||4787),nextPort=port+1;
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(nextPort)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',NAUMI_VIDEO_WORKER:'0',SETTINGS_SECRET:randomUUID(),VIDEO_WORKER_SECRET:randomUUID(),OPENAI_API_KEY:'fixture-never-call',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_DIST_DIR:process.env.CANVAS_SELECTION_DIST||'.next-selection-fixture',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
for(const stream of [app.stdout,app.stderr])stream.on('data',b=>appendFileSync(path.join(evidence,'next.log'),b));
const now=new Date().toISOString(),email='selection-run@example.test',image=`http://127.0.0.1:${port}/demos/suite-demo/suppl-src.png`;
const user={name:'框选验收',email,plan:'starter',creditsTotal:99999,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[],canHigh:true};
const root={id:'selection-root',title:'产品参考图',category:'main',prompt:'root-unselected',createdAt:now,status:'completed',image,gradient:'',origin:'canvas',source:'canvas-add',groupId:'selection-root',width:1024,height:1024,canvasWidth:230,canvasHeight:230,canvasX:100,canvasY:220,ratio:'1:1',resolution:'1K'};
const initialImages=[root,...Array.from({length:4},(_,i)=>({...root,id:'selection-'+(i+1),title:'待运行图片 '+(i+1),prompt:'node-prompt-'+(i+1),parentId:root.id,source:'canvas-gen',canvasX:600,canvasY:30+i*270,ratio:i%2?'3:4':'1:1',resolution:i%2?'2K':'1K',style:i%2?'自然':'极简'}))];
const initialTexts=[{id:'text-selection-1',projectKey:'tree:selection-root',title:'文字一',content:'第一个节点的文字要求',prompt:'',status:'completed',canvasX:1030,canvasY:70,width:300,height:160,sourceIds:[],targetIds:[],createdAt:now,updatedAt:now},{id:'text-selection-2',projectKey:'tree:selection-root',title:'文字二',content:'第二个节点的文字要求',prompt:'',status:'completed',canvasX:1030,canvasY:360,width:300,height:160,sourceIds:[],targetIds:[],createdAt:now,updatedAt:now}];
let images=[...initialImages],texts=initialTexts.map(t=>({...t}));
let settings={},requests=[],jobs=new Map(),hold=false,failSource='',active=0,peak=0;
const save=()=>writeFileSync(path.join(evidence,'requests.json'),JSON.stringify({requests,active,peak},null,2));
const model={id:'gpt-image-2',label:'GPT-Image-2.5',modality:'image',supportsEdit:true,qualities:['low','medium','high'],qualitySupported:true,nativeResolutions:['1K','2K','4K'],generationParameters:{ratios:['1:1','3:4','16:9'],resolutions:['1K','2K','4K']}};
const features=Object.fromEntries(['image.generate','canvas.image','canvas.text-generate','canvas.assistant','tool.cutout'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{medium:{'1K':4,'2K':6}}}]));
const png=readFileSync('public/demos/suite-demo/suppl-src.png');
async function body(req){const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks);try{return JSON.parse(raw.toString())}catch{return {bytes:raw.length}}}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,`http://127.0.0.1:${port}`),p=url.pathname;
 const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
 try{
  if(p==='/__fixture/state')return json({requests,images,texts,settings,hold,active,peak});
  if(p==='/__fixture/control'){const b=await body(req);if(b.reset){images=[...initialImages];texts=initialTexts.map(t=>({...t}));requests=[];jobs.clear();active=0;peak=0;}if(b.settings)settings=b.settings;if(b.texts)texts=b.texts;if(b.failSource!==undefined)failSource=b.failSource;if(b.hold!==undefined)hold=b.hold;save();return json({ok:true});}
  if(p==='/api/config')return json({db:true,authMode:'mock',multiUser:true,commerceVisible:false,imageQualityCapable:true,creditsMetered:true,imageModels:[model],defaultImageModel:model.id});
  if(p==='/api/auth/session')return json({user});
  if(p==='/api/account')return json({persisted:true,user,artworks:images});
  if(p==='/api/feature-access')return json({email,policy:{mode:'default',allowed:[],version:1}});
  if(p==='/api/projects')return json({names:{'tree:selection-root':'框选批量运行验收'}});
  if(p==='/api/canvas/node-settings')return json({persisted:true,settings});
  if(p==='/api/canvas/text-nodes'){if(req.method==='POST'){const n=await body(req);texts=texts.map(t=>t.id===n.id?n:t);return json({persisted:true,node:n});}return json({persisted:true,nodes:texts});}
  if(p==='/api/models')return json({managed:false,supported:true,feature:url.searchParams.get('feature'),version:1,models:[model],defaultModelId:model.id});
  if(p==='/api/text-models')return json({models:['gpt-4o'],defaultModel:'gpt-4o'});
  if(p==='/api/billing/catalog')return json({version:1,features,products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}});
  if(p==='/api/billing/quote')return json({...await body(req),credits:4,reserveCredits:4,version:1});
  if(p==='/api/imagegen/inputs'){await body(req);return json({artworkId:'fixture-input',url:image,width:1024,height:1024});}
  if(p==='/api/imagegen/plan'){const request=await body(req);return json({request,intent:{background:null,operation:'edit',requirements:[],conflicts:[]},steps:[{key:'generate',operation:'edit',credits:4}],totalCredits:4,billingVersion:1,modelVersion:1,confirmationRequired:false,warnings:[]});}
  if(p==='/api/imagegen'&&req.method==='POST'){
   const b=await body(req);requests.push({kind:'image',body:b});active++;peak=Math.max(peak,active);jobs.set(b.operationId,{body:b,result:null});save();return json({id:b.operationId,jobId:'imagegen-'+b.operationId,status:'running',artifacts:[]});
  }
  if(p==='/api/imagegen'||p==='/api/generate-image'){
   const id=(url.searchParams.get('operationId')||url.searchParams.get('job')||'').replace(/^imagegen-/,''),job=jobs.get(id);
   if(!job)return json({status:'pending',artifacts:[]});
   if(hold)return json(p==='/api/generate-image'?{status:'pending',operationStatus:'queued'}:{status:'queued',stage:'planning',artifacts:[],operationId:id});
   if(!job.result){
    active--;job.result=job.body.sourceNodeId===failSource?'failed':'succeeded';
    if(job.result==='succeeded'){const art={...root,id:'result-'+id,parentId:job.body.sourceNodeId,title:'批量结果',prompt:job.body.prompt,source:'canvas-gen',ratio:job.body.parameters.ratio,resolution:job.body.parameters.resolution};images.push(art);job.art=art;}save();
   }
   if(job.result==='failed')return json(p==='/api/generate-image'?{status:'error',operationStatus:'failed',error:'模拟单节点失败'}:{operationId:id,status:'failed',artifacts:[],error:{code:'MOCK_FAILED',message:'模拟单节点失败'}});
   const artifacts=[{artworkId:job.art.id,url:image,width:1024,height:1024,mime:'image/png',transparentPixels:0,totalPixels:1048576}];
   return json(p==='/api/generate-image'?{status:'done',images:artifacts.map(a=>({id:a.artworkId,url:a.url,width:a.width,height:a.height})),user}:{operationId:id,jobId:'imagegen-'+id,status:'succeeded',stage:'done',artifacts,chargedCredits:4});
  }
  if(p==='/api/canvas/text-generate'){const b=await body(req);requests.push({kind:'text',body:b});save();return json({text:'已完成：'+b.prompt,model:'gpt-4o'});}
  if(p==='/api/artworks/position'){const b=await body(req),art=images.find(a=>a.id===b.id);if(art){art.canvasX=b.x;art.canvasY=b.y;}return json({ok:true});}
  if(p==='/api/artworks/get')return json({artworks:images.filter(a=>(url.searchParams.get('ids')||'').split(',').includes(a.id))});
  if(p==='/api/download'||p==='/demos/suite-demo/suppl-src.png'){res.writeHead(200,{'content-type':'image/png'});res.end(png);return;}
  if(p.startsWith('/api/'))return json({items:[],tasks:[],names:{},nodes:[],settings:{},records:[],artworks:[],ok:true,persisted:true});
  const upstream=await fetch(`http://127.0.0.1:${nextPort}`+req.url,{headers:{...req.headers,host:`127.0.0.1:${nextPort}`}});
  const headers=Object.fromEntries(upstream.headers);delete headers['content-length'];delete headers['content-encoding'];
  if(headers['content-type']?.includes('text/html')){
   const seed=`<script>if(!localStorage.getItem('selection-fixture-seeded')){localStorage.setItem('selection-fixture-seeded','1');localStorage.setItem('theme','light');localStorage.setItem('naumi:last-email',${JSON.stringify(email)});localStorage.setItem('naumi:user:'+${JSON.stringify(email)},${JSON.stringify(JSON.stringify(user))});localStorage.setItem('nv:canvas:last','tree:selection-root');localStorage.setItem('nv:canvas:bg','light');}document.cookie='naumi_locale=zh;path=/';window.__selectionPageErrors=window.__selectionPageErrors||[];window.addEventListener('error',e=>window.__selectionPageErrors.push(e.message));</script>`;
   res.writeHead(upstream.status,headers);res.end((await upstream.text()).replace('<head>','<head>'+seed));
  }else{res.writeHead(upstream.status,headers);res.end(Buffer.from(await upstream.arrayBuffer()));}
 }catch(e){console.error(e.message);json({error:e.message},500);}
});
server.listen(port,'127.0.0.1',()=>console.log(`FIXTURE=http://127.0.0.1:${port}/canvas PROVIDER_CALLS=0`));
process.on('SIGTERM',()=>{app.kill();server.close();});
