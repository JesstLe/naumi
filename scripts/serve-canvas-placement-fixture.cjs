// Local UI fixture only. No production DB, credentials, worker or supplier network.
const http=require('node:http'),cp=require('node:child_process'),fs=require('node:fs'),crypto=require('node:crypto');
const port=Number(process.env.CANVAS_FIXTURE_PORT||14317),nextPort=Number(process.env.CANVAS_FIXTURE_NEXT_PORT||14316),dist=process.env.CANVAS_FIXTURE_DIST||'.next-placement-fixture',now=new Date().toISOString(),email='placement-fixture@example.test';
const user={name:'位置验收',email,plan:'starter',creditsTotal:99999,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[],canHigh:true};
const image='http://127.0.0.1:'+port+'/demos/suite-demo/suppl-src.png';
const art={id:'placement-root',title:'主图',category:'main',prompt:'保留主体',createdAt:now,status:'completed',image,gradient:'',origin:'canvas',source:'canvas-add',groupId:'placement-root',width:320,height:260,canvasWidth:320,canvasHeight:260,canvasX:100,canvasY:100,ratio:'1:1',resolution:'1K'};
const arts=[art,{...art,id:'placement-second',title:'邻近图片',parentId:art.id,canvasX:620,canvasY:150}];
const historyMode=process.env.CANVAS_FIXTURE_HISTORY==='1';
const texts=historyMode?[{id:'text-history',projectKey:'tree:placement-root',title:'历史文字',prompt:'',content:'原始文字',status:'completed',canvasX:100,canvasY:650,width:380,height:260,sourceIds:[],targetIds:[],productIds:[],createdAt:now,updatedAt:now}]:[];
const initialArts=structuredClone(arts),initialTexts=structuredClone(texts);
const model={id:'gpt-image-2',label:'GPT Image 2',modality:'image',supportsEdit:true,qualities:['low','medium','high'],qualitySupported:true,nativeResolutions:['1K'],generationParameters:{ratios:['auto','1:1','3:4'],resolutions:['1K']}};
const state={submissions:[],positions:[],history:[],jobs:{},paidCalls:0,apiErrors:[],failNextPosition:false,failNextHistory:false,textSaves:[],historyApplied:[],failTextSaves:false,failTextRead:false,failArtworkAccount:false,failArtworkIds:false,accountReads:0,artworkIdReads:[]};
const appliedHistory=new Map();let loseHistoryResponse=false;
const taskState={details:[],edits:[],detailJobs:{},failPoll:false};
const app=cp.spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(nextPort)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',SETTINGS_SECRET:crypto.randomUUID(),VIDEO_WORKER_SECRET:crypto.randomUUID(),NAUMI_VIDEO_WORKER:'0',OPENAI_API_KEY:'fixture-not-a-key',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:dist},stdio:['ignore','pipe','pipe']});
app.stdout.on('data',b=>process.stdout.write(b));app.stderr.on('data',b=>process.stderr.write(b));
const json=(res,v,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(v))};
const server=http.createServer(async(req,res)=>{
 try{
 const u=new URL(req.url,'http://localhost'),p=u.pathname;
 let raw='';if(req.method==='POST')for await(const b of req)raw+=b;
 const body=raw.startsWith('{')?JSON.parse(raw):{};
 if(p==='/__fixture/state')return json(res,{...state,...taskState,artworks:arts,texts});
 if(p==='/__fixture/reset'){loseHistoryResponse=false;taskState.details=[];taskState.edits=[];taskState.detailJobs={};taskState.failPoll=false;arts.splice(0,arts.length,...structuredClone(initialArts));texts.splice(0,texts.length,...structuredClone(initialTexts));state.submissions.length=0;state.positions.length=0;state.history.length=0;state.historyApplied.length=0;state.textSaves.length=0;state.accountReads=0;state.artworkIdReads.length=0;appliedHistory.clear();state.jobs={};state.apiErrors.length=0;state.failNextHistory=state.failNextPosition=state.failTextSaves=state.failTextRead=state.failArtworkAccount=state.failArtworkIds=false;return json(res,{ok:true})}
 if(p.startsWith('/_next/static/chunks/')){
  const file=require('node:path').resolve(dist,p.replace('/_next/',''));
  if(file.startsWith(require('node:path').resolve(dist)+require('node:path').sep)&&fs.existsSync(file)){res.writeHead(200,{'content-type':'application/javascript'});return res.end(fs.readFileSync(file))}
 }
 if(p==='/__fixture/complete'){
  const index=Number(u.searchParams.get('index')||state.submissions.length)-1,job=state.submissions[index];if(!job)return json(res,{error:'missing job'},404);
  const result={...art,id:'placement-result-'+(index+1),title:'结果 '+(index+1),source:'generate',parentId:art.id,canvasX:undefined,canvasY:undefined,createdAt:new Date().toISOString()};arts.push(result);state.jobs[job.operationId].status='succeeded';state.jobs[job.operationId].artifacts=[{artworkId:result.id,url:image,width:320,height:260,mime:'image/png'}];return json(res,{ok:true});
 }
 if(p==='/__fixture/detail-failure'){taskState.failPoll=true;return json(res,{ok:true})}
 if(p==='/__fixture/detail-complete'){
  const job=taskState.details[Number(u.searchParams.get('index')||taskState.details.length)-1];if(!job)return json(res,{error:'missing detail'},404);
  const id='detail-result-'+job.index,result={...art,id,title:'详情结果',parentId:art.id,source:'generate',width:320,height:640,canvasX:undefined,canvasY:undefined};arts.push(result);
  taskState.detailJobs[job.id]={status:'done',done:1,shots:[{id,status:'done',url:image}]};return json(res,{ok:true});
 }
 if(p==='/__fixture/shutdown'){json(res,{ok:true});app.kill();return server.close(()=>process.exit(0));}
 if(p==='/__fixture/fail-position'){state.failNextPosition=true;return json(res,{ok:true})}
 if(p==='/__fixture/fail-history'){state.failNextHistory=true;return json(res,{ok:true})}
 if(p==='/__fixture/lose-history-response'){loseHistoryResponse=true;return json(res,{ok:true})}
 if(p==='/__fixture/group'){for(const art of arts)art.canvasGroupId=u.searchParams.get('enabled')==='1'?'group-fixture':null;return json(res,{ok:true})}
 if(p==='/__fixture/text-failure'){state.failTextSaves=u.searchParams.get('save')==='1';state.failTextRead=u.searchParams.get('read')==='1';return json(res,{ok:true})}
 if(p==='/__fixture/artwork-failure'){state.failArtworkAccount=u.searchParams.get('account')==='1';state.failArtworkIds=u.searchParams.get('ids')==='1';return json(res,{ok:true})}
 if(p.startsWith('/api/')){
  if(p==='/api/download'){res.writeHead(200,{'content-type':'image/png'});return res.end(fs.readFileSync('public/demos/suite-demo/suppl-src.png'));}
  if(p==='/api/media/image-cache'||p==='/api/public-image-cache')return json(res,{account:email,results:Object.fromEntries((body.sources||[]).map(source=>[source,{account:email,source,version:'fixture-v1',fetchUrl:image,bytes:fs.statSync('public/demos/suite-demo/suppl-src.png').size,contentType:'image/png'}]))});
  if(p==='/api/config')return json(res,{db:true,authMode:'mock',multiUser:true,commerceVisible:false,imageQualityCapable:true,creditsMetered:true,imageModels:[model],defaultImageModel:model.id});
  if(p==='/api/auth/session')return json(res,{user});
  if(p==='/api/feature-access')return json(res,{email,policy:{mode:'default',allowed:[],version:1}});
  if(p==='/api/account'){state.accountReads++;if(state.failArtworkAccount)return json(res,{error:'fixture artwork load failed'},503);return json(res,{persisted:true,user,artworks:arts.filter(a=>!a.deletedAt)});}
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
  if(p==='/api/aplus'){
   if(req.method==='POST'){const id='aplus-'+req.headers['x-naumi-billing-operation-id'];taskState.details.push({id,index:taskState.details.length+1});taskState.detailJobs[id]={status:'pending',shots:[]};return json(res,{jobId:id});}
   if(taskState.failPoll){taskState.failPoll=false;return json(res,{error:'fixture detail poll failed'},503);}
   return json(res,taskState.detailJobs[u.searchParams.get('job')]||{status:'pending',shots:[]});
  }
  if(p==='/api/canvas/expand'&&req.method==='POST'){
   const id='edit-result-'+(taskState.edits.length+1);taskState.edits.push({id,body,operationId:req.headers['x-naumi-billing-operation-id']});arts.push({...art,id,title:'扩图结果',parentId:body.artworkId,source:'generate',canvasX:undefined,canvasY:undefined});return json(res,{id,user});
  }
  if(p==='/api/artworks/rename'){const art=arts.find(a=>a.id===body.id);if(art)art.title=body.title;return json(res,{ok:true});}
  if(p==='/api/artworks/position'){
   if(state.failNextPosition){state.failNextPosition=false;return json(res,{error:'fixture position save failed'},500)}
   state.positions.push(body);const a=arts.find(a=>a.id===body.id);if(a){a.canvasX=body.x;a.canvasY=body.y}return json(res,{ok:true});
  }
  if(p==='/api/canvas/history'){
   state.history.push(body);
   if(state.failNextHistory){state.failNextHistory=false;return json(res,{error:'fixture history save failed'},409)}
   if(appliedHistory.has(body.operationId))return json(res,{ok:true,persisted:true});
   for(const op of body.operations||[]){const a=arts.find(a=>a.id===op.id),t=texts.find(t=>t.id===op.id);
    if(op.type==='position'){const n=op.text?t:a;if(n){n.canvasX=op.x;n.canvasY=op.y}}
    if(a&&op.type==='visibility')a.deletedAt=op.visible?null:now;
    if(a&&op.type==='rename')a.title=op.title;
    if(a&&op.type==='parent'){
     const parents=new Set(a.parentIds||[]);if(op.add){parents.add(op.parentId);a.parentId??=op.parentId;}else{parents.delete(op.parentId);if(a.source!=='canvas-add'&&a.parentId===op.parentId)a.parentId=null;}a.parentIds=[...parents];
    }
    if(t&&op.type==='text-patch')Object.assign(t,op.fields);
    if(op.type==='text-delete'){const i=texts.findIndex(t=>t.id===op.id);if(i>=0)texts.splice(i,1);}
    if(op.type==='text-restore'){const i=texts.findIndex(t=>t.id===op.node.id);if(i>=0)texts[i]=op.node;else texts.push(op.node);}
   }
   appliedHistory.set(body.operationId,body);state.historyApplied.push(body);if(loseHistoryResponse){loseHistoryResponse=false;return json(res,{error:'fixture response lost after commit'},503);}return json(res,{ok:true,persisted:true});
  }
  if(p==='/api/canvas/text-nodes'){
   if(req.method==='POST'){state.textSaves.push(body);if(state.failTextSaves)return json(res,{error:'fixture text save failed'},503);const i=texts.findIndex(t=>t.id===body.id);if(i>=0)texts[i]=body;else texts.push(body);return json(res,{ok:true,persisted:true,node:body});}
   if(state.failTextRead)return json(res,{error:'fixture text load failed'},503);
   return json(res,{nodes:texts,persisted:true});
  }
  if(p==='/api/artworks/get'){state.artworkIdReads.push(u.searchParams.get('ids')||'');if(state.failArtworkIds)return json(res,{error:'fixture artwork sync failed'},503);return json(res,{artworks:arts.filter(a=>!a.deletedAt&&(u.searchParams.get('ids')||'').split(',').includes(a.id))});}
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
