// Real Next/React Canvas; isolated HTTP fixtures. No production credentials or supplier access.
const http=require('node:http'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const port=Number(process.env.CANVAS_REGEN_PORT||14991),nextPort=port+1,now=new Date().toISOString(),email='regeneration-ui@example.test';
const user={name:'原位重生成验收',email,plan:'starter',creditsTotal:9999,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[],canHigh:true};
const image=`http://127.0.0.1:${port}/demos/suite-demo/suppl-main.png`,resultImage=`http://127.0.0.1:${port}/demos/suite-demo/suppl-selling.png`;
const root={id:'regeneration-root',title:'产品主图',category:'main',prompt:'白色营养品瓶身，居中构图，浅蓝背景，柔和自然光。',createdAt:now,status:'completed',image,gradient:'',origin:'canvas',source:'canvas-add',groupId:'regeneration-root',width:1024,height:1024,canvasWidth:320,canvasHeight:320,canvasX:300,canvasY:160,ratio:'1:1',resolution:'1K',canvasImageRevision:0,canvasImageVersionId:'initial'};
const arts=[root,{...root,id:'reference-neighbor',title:'下游节点',parentId:root.id,source:'generate',canvasX:780,canvasY:160}];
const version=art=>({id:art.canvasImageVersionId||'initial',image:art.image,prompt:art.prompt,width:art.width,height:art.height,ratio:art.ratio,resolution:art.resolution,style:null,createdAt:now});
const versions=new Map(arts.map(a=>[a.id,[version(a)]])),historyIds=new Set();
const state={submissions:[],positions:[],history:[],jobs:{},apiErrors:[],receiptChecks:0,paidCalls:0,versions};
const model={id:'gpt-image-2',label:'GPT Image 2',modality:'image',supportsEdit:true,qualities:['medium'],qualitySupported:true,nativeResolutions:['1K'],generationParameters:{ratios:['auto','1:1','3:4','16:9'],resolutions:['1K']}};
const app=cp.spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-H','127.0.0.1','-p',String(nextPort)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',SETTINGS_SECRET:crypto.randomUUID(),VIDEO_WORKER_SECRET:crypto.randomUUID(),NAUMI_VIDEO_WORKER:'0',OPENAI_API_KEY:'fixture-only',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:'.next-canvas-regeneration'},windowsHide:true,stdio:['ignore','pipe','pipe']});
app.stdout.on('data',b=>process.stdout.write(b));app.stderr.on('data',b=>process.stderr.write(b));
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data))};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),p=url.pathname;let raw='';if(['POST','PATCH'].includes(req.method))for await(const b of req)raw+=b;const body=raw.startsWith('{')?JSON.parse(raw):{};
 if(p==='/__fixture/state')return json(res,{...state,versions:Object.fromEntries(versions),artworks:arts});
 if(p==='/__fixture/complete'||p==='/__fixture/fail'){
  const index=Number(url.searchParams.get('index')||state.submissions.length)-1,request=state.submissions[index],job=request&&state.jobs[request.operationId];if(!job)return json(res,{error:'no submitted job'},404);
  if(p.endsWith('/fail')){Object.assign(job,{status:'failed',error:'测试上游连接被重置；原图已保留'});return json(res,{ok:true})}
  if(job.status==='succeeded')return json(res,{ok:true});
  const target=request.canvasTarget&&arts.find(a=>a.id===request.canvasTarget.nodeId),ids=[];
  for(let i=0;i<(request.variants||1);i++){
   const id=`result-${index+1}-${i+1}`,output={...root,id,title:'新生成结果',image:resultImage,prompt:request.prompt,source:target?'canvas-node-version':'generate',parentId:target?.id||root.id,canvasImageRevision:0,canvasImageVersionId:'initial'};arts.push(output);ids.push(id);
   if(target)versions.get(target.id).unshift({...version(output),id});
  }
  if(target){const before=target.canvasImageVersionId,previousImage=target.image,applied=target.canvasImageRevision===request.canvasTarget.expectedRevision;
   if(applied)Object.assign(target,{image:resultImage,prompt:request.prompt,canvasImageRevision:target.canvasImageRevision+1,canvasImageVersionId:ids[0]});
   job.canvasAttachment={nodeId:target.id,applied,previousVersionId:before,previousImage,versionId:ids[0],revision:target.canvasImageRevision};
  }
  Object.assign(job,{status:'succeeded',artifacts:ids.map(id=>({artworkId:id,url:resultImage,width:1024,height:1024,mime:'image/png'}))});return json(res,{ok:true});
 }
 if(p==='/api/download'){const name=new URL(url.searchParams.get('u'),'http://localhost').pathname.split('/').pop();if(!['suppl-main.png','suppl-selling.png'].includes(name))return json(res,{error:'fixture media only'},404);res.writeHead(200,{'content-type':'image/png'});return res.end(fs.readFileSync(path.join('public/demos/suite-demo',name)))}
 if(p.startsWith('/api/')){
  if(p==='/api/config')return json(res,{db:true,authMode:'mock',multiUser:true,commerceVisible:false,imageQualityCapable:true,creditsMetered:true,imageModels:[model],defaultImageModelId:model.id});
  if(p==='/api/auth/session')return json(res,{user});
  if(p==='/api/feature-access')return json(res,{email,policy:{mode:'default',allowed:[],version:1}});
  if(p==='/api/account')return json(res,{persisted:true,user,artworks:arts});
  if(p==='/api/projects')return json(res,{names:{'tree:regeneration-root':'原位重生成验收'}});
  if(p==='/api/models')return json(res,{managed:false,supported:true,feature:url.searchParams.get('feature'),version:1,models:[model],defaultModelId:model.id});
  if(p==='/api/text-models')return json(res,{models:['gpt-4o'],defaultModel:'gpt-4o'});
  if(p==='/api/billing/catalog')return json(res,{version:1,features:Object.fromEntries(['image.generate','canvas.image','canvas.expand','canvas.text-generate','canvas.assistant','tool.cutout'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{medium:{'1K':0}}}])),products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}});
  if(p==='/api/billing/quote')return json(res,{...body,credits:0,reserveCredits:0,version:1});
  if(p==='/api/imagegen/inputs')return json(res,{artworkId:'asset-fixture',url:image,width:1024,height:1024});
  if(p==='/api/imagegen/plan')return json(res,{request:body,intent:{operation:'generate',background:null,requirements:[],conflicts:[]},steps:[{key:'generate',operation:'generate',credits:0}],warnings:[],confirmationRequired:false,totalCredits:0,billingVersion:1,modelVersion:1});
  if(p==='/api/imagegen'){
   if(req.method==='POST'){state.submissions.push(body);const id=body.operationId;state.jobs[id]={operationId:id,jobId:'imagegen-'+id,status:'pending',stage:'generating',artifacts:[],chargedCredits:0};return json(res,state.jobs[id])}
   state.receiptChecks++;return json(res,state.jobs[url.searchParams.get('operationId')]||{status:'pending',artifacts:[]});
  }
  if(p==='/api/generate-image'&&req.method==='GET'){const job=state.jobs[(url.searchParams.get('job')||'').replace(/^imagegen-/,'')];state.receiptChecks++;return json(res,{status:job?.status==='succeeded'?'done':job?.status==='failed'?'error':'pending',operationStatus:job?.status,canvasAttachment:job?.canvasAttachment,error:job?.error,images:job?.artifacts.map(a=>({id:a.artworkId,url:a.url,width:a.width,height:a.height}))||[],user})}
  if(p==='/api/artworks/position'){state.positions.push(body);const art=arts.find(a=>a.id===body.id);if(art)Object.assign(art,{canvasX:body.x,canvasY:body.y});return json(res,{ok:true})}
  if(p==='/api/canvas/image-versions'){const art=arts.find(a=>a.id===url.searchParams.get('nodeId'));return json(res,{image:art.image,currentVersionId:art.canvasImageVersionId,revision:art.canvasImageRevision,versions:versions.get(art.id)})}
  if(p==='/api/canvas/history'){
   if(historyIds.has(body.operationId))return json(res,{ok:true,persisted:true});
   for(const op of body.operations||[]){const art=arts.find(a=>a.id===op.id);if(op.type==='image-version'){
    if(!art||art.canvasImageRevision!==op.expectedRevision||art.image!==op.expectedImage)return json(res,{error:'节点版本已改变'},409);
    const next=versions.get(art.id).find(v=>v.id===op.versionId);Object.assign(art,{image:next.image,prompt:next.prompt,canvasImageRevision:art.canvasImageRevision+1,canvasImageVersionId:next.id});
   }}state.history.push(body);historyIds.add(body.operationId);return json(res,{ok:true,persisted:true});
  }
  if(p==='/api/artworks/get')return json(res,{artworks:arts.filter(a=>(url.searchParams.get('ids')||'').split(',').includes(a.id))});
  return json(res,{items:[],tasks:[],names:{},nodes:[],settings:{},records:[],artworks:[],models:[],ok:true,persisted:true});
 }
 if(p.startsWith('/_next/static/chunks/')){const file=path.resolve('.next-canvas-regeneration',p.replace('/_next/',''));if(file.startsWith(path.resolve('.next-canvas-regeneration')+path.sep)&&fs.existsSync(file)){res.writeHead(200,{'content-type':'application/javascript'});return res.end(fs.readFileSync(file))}}
 const upstream=http.request({hostname:'127.0.0.1',port:nextPort,path:req.url,method:req.method,headers:{...req.headers,'accept-encoding':'identity',host:`127.0.0.1:${nextPort}`}},r=>{const pieces=[];r.on('data',b=>pieces.push(b));r.on('end',()=>{let data=Buffer.concat(pieces),headers={...r.headers};delete headers['content-encoding'];if(headers['content-type']?.includes('text/html')){data=Buffer.from(data.toString().replace('<head>',`<head><script>localStorage.setItem('nv:canvas:last','tree:regeneration-root');localStorage.setItem('nv:canvas:bg','light');</script>`));delete headers['content-length']}res.writeHead(r.statusCode,headers);res.end(data)})});upstream.on('error',e=>{res.writeHead(502);res.end(e.message)});if(raw)upstream.write(raw);upstream.end();
 }catch(e){state.apiErrors.push(e.message);json(res,{error:e.message},500)}});
server.listen(port,'127.0.0.1',()=>console.log(`CANVAS_REGEN_UI=http://127.0.0.1:${port}/canvas REAL_SUPPLIER_CALLS=0`));
process.on('SIGINT',()=>{app.kill();server.close(()=>process.exit(0))});process.on('SIGTERM',()=>{app.kill();server.close(()=>process.exit(0))});process.on('exit',()=>app.kill());
