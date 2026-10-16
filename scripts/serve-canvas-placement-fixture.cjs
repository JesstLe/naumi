// Local UI fixture only. No production DB, credentials, worker or supplier network.
const http=require('node:http'),cp=require('node:child_process'),fs=require('node:fs'),crypto=require('node:crypto');
const port=14317,nextPort=14316,now=new Date().toISOString(),email='placement-fixture@example.test';
const user={name:'位置验收',email,plan:'starter',creditsTotal:99999,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[],canHigh:true};
const image='http://127.0.0.1:'+port+'/demos/suite-demo/suppl-src.png';
const art={id:'placement-root',title:'主图',category:'main',prompt:'保留主体',createdAt:now,status:'completed',image,gradient:'',origin:'canvas',source:'canvas-add',groupId:'placement-root',width:320,height:260,canvasWidth:320,canvasHeight:260,canvasX:100,canvasY:100,ratio:'1:1',resolution:'1K'};
const arts=[art,{...art,id:'placement-second',title:'邻近图片',parentId:art.id,canvasX:620,canvasY:150}];
const model={id:'gpt-image-2',label:'GPT Image 2',modality:'image',supportsEdit:true,qualities:['low','medium','high'],qualitySupported:true,nativeResolutions:['1K'],generationParameters:{ratios:['auto','1:1','3:4'],resolutions:['1K']}};
const state={submissions:[],positions:[],history:[],jobs:{},paidCalls:0,apiErrors:[],failNextPosition:false};
const app=cp.spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(nextPort)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',SETTINGS_SECRET:crypto.randomUUID(),VIDEO_WORKER_SECRET:crypto.randomUUID(),NAUMI_VIDEO_WORKER:'0',OPENAI_API_KEY:'fixture-not-a-key',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:'.next-placement-fixture'},stdio:['ignore','pipe','pipe']});
app.stdout.on('data',b=>process.stdout.write(b));app.stderr.on('data',b=>process.stderr.write(b));
const json=(res,v,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(v))};
const server=http.createServer(async(req,res)=>{
 try{
 const u=new URL(req.url,'http://localhost'),p=u.pathname;
 let raw='';if(req.method==='POST')for await(const b of req)raw+=b;
 const body=raw.startsWith('{')?JSON.parse(raw):{};
 if(p==='/__fixture/state')return json(res,{...state,artworks:arts});
 if(p==='/__fixture/reset'){arts.splice(2);state.submissions.length=0;state.positions.length=0;state.history.length=0;state.jobs={};state.apiErrors.length=0;return json(res,{ok:true})}
 if(p.startsWith('/_next/static/chunks/')){
  const file=require('node:path').resolve('.next-placement-fixture',p.replace('/_next/',''));
  if(file.startsWith(require('node:path').resolve('.next-placement-fixture')+require('node:path').sep)&&fs.existsSync(file)){res.writeHead(200,{'content-type':'application/javascript'});return res.end(fs.readFileSync(file))}
 }
 if(p==='/__fixture/complete'){
  const index=Number(u.searchParams.get('index')||state.submissions.length)-1,job=state.submissions[index];if(!job)return json(res,{error:'missing job'},404);
  const result={...art,id:'placement-result-'+(index+1),title:'结果 '+(index+1),source:'generate',parentId:art.id,canvasX:undefined,canvasY:undefined,createdAt:new Date().toISOString()};arts.push(result);state.jobs[job.operationId].status='succeeded';state.jobs[job.operationId].artifacts=[{artworkId:result.id,url:image,width:320,height:260,mime:'image/png'}];return json(res,{ok:true});
 }
 if(p==='/__fixture/fail-position'){state.failNextPosition=true;return json(res,{ok:true})}
 if(p.startsWith('/api/')){
  if(p==='/api/config')return json(res,{db:true,authMode:'mock',multiUser:true,commerceVisible:false,imageQualityCapable:true,creditsMetered:true,imageModels:[model],defaultImageModel:model.id});
  if(p==='/api/auth/session')return json(res,{user});
  if(p==='/api/feature-access')return json(res,{email,policy:{mode:'default',allowed:[],version:1}});
  if(p==='/api/account')return json(res,{persisted:true,user,artworks:arts});
  if(p==='/api/projects')return json(res,{names:{'tree:placement-root':'位置验收'}});
  if(p==='/api/models')return json(res,{managed:false,supported:true,feature:u.searchParams.get('feature'),version:1,models:[model],defaultModelId:model.id});
  if(p==='/api/text-models')return json(res,{models:['gpt-4o'],defaultModel:'gpt-4o'});
  if(p==='/api/billing/catalog')return json(res,{version:1,features:Object.fromEntries(['image.generate','canvas.image','canvas.expand','canvas.text-generate','canvas.assistant','tool.cutout'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{medium:{'1K':0}}}])),products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}});
  if(p==='/api/billing/quote')return json(res,{...body,credits:0,reserveCredits:0,version:1});
  if(p==='/api/imagegen/inputs')return json(res,{artworkId:'asset-fixture',url:image,width:320,height:260});
  if(p==='/api/imagegen/plan')return json(res,{request:body,intent:{operation:'edit',background:null,requirements:[],conflicts:[]},steps:[{key:'generate',operation:'edit',credits:0}],warnings:[],confirmationRequired:false,totalCredits:0,billingVersion:1,modelVersion:1});
  if(p==='/api/imagegen'){
   if(req.method==='POST'){state.submissions.push(body);const id=body.operationId;state.jobs[id]={operationId:id,jobId:'imagegen-'+id,status:'pending',stage:'generating',artifacts:[],chargedCredits:0};return json(res,state.jobs[id])}
   return json(res,state.jobs[u.searchParams.get('operationId')]||{status:'pending',artifacts:[]});
  }
  if(p==='/api/generate-image'&&req.method!=='POST'){
   const job=state.jobs[(u.searchParams.get('job')||'').replace(/^imagegen-/,'')];return json(res,{status:job?.status==='succeeded'?'done':'pending',images:job?.artifacts.map(a=>({id:a.artworkId,url:a.url,width:a.width,height:a.height}))||[],user});
  }
  if(p==='/api/artworks/position'){
   if(state.failNextPosition){state.failNextPosition=false;return json(res,{error:'fixture position save failed'},500)}
   state.positions.push(body);const a=arts.find(a=>a.id===body.id);if(a){a.canvasX=body.x;a.canvasY=body.y}return json(res,{ok:true});
  }
  if(p==='/api/canvas/history'){
   state.history.push(body);for(const op of body.operations||[]){const a=arts.find(a=>a.id===op.id);if(a&&op.type==='position'){a.canvasX=op.x;a.canvasY=op.y}}return json(res,{ok:true});
  }
  if(p==='/api/artworks/get')return json(res,{artworks:arts.filter(a=>(u.searchParams.get('ids')||'').split(',').includes(a.id))});
  if(p==='/api/canvas/node-settings')return json(res,{persisted:true,settings:{}});
  return json(res,{items:[],tasks:[],names:{},nodes:[],settings:{},records:[],artworks:[],ok:true,persisted:true});
 }
 // Proxy the actual local Next UI, injecting only isolated fixture account state.
 const upstream=http.request({host:'127.0.0.1',port:nextPort,path:req.url,method:req.method,headers:{...req.headers,'accept-encoding':'identity',host:'127.0.0.1:'+nextPort}},r=>{
  const chunks=[];r.on('data',b=>chunks.push(b));r.on('end',()=>{let data=Buffer.concat(chunks),headers={...r.headers};
   if(String(headers['content-type']).includes('text/html')){const bootstrap=`<script>localStorage.setItem('theme','light');localStorage.setItem('naumi:last-email',${JSON.stringify(email)});localStorage.setItem('naumi:user:'+${JSON.stringify(email)},${JSON.stringify(JSON.stringify(user))});if(!localStorage.getItem('nv:canvas:last'))localStorage.setItem('nv:canvas:last','tree:placement-root');localStorage.setItem('nv:canvas:bg','light');</script>`;data=Buffer.from(data.toString().replace('<head>','<head>'+bootstrap));delete headers['content-length'];}
   res.writeHead(r.statusCode,headers);res.end(data);
  });
 });upstream.on('error',e=>{res.writeHead(502);res.end(e.message)});if(raw)upstream.write(raw);upstream.end();
 }catch(e){state.apiErrors.push(e.message);json(res,{error:e.message},500)}
});
server.listen(port,'127.0.0.1',()=>console.log('PLACEMENT_FIXTURE=http://127.0.0.1:'+port+'/canvas PAID_CALLS=0'));
process.on('SIGINT',()=>{app.kill();server.close(()=>process.exit(0))});process.on('exit',()=>app.kill());
