// Local UI fixture only. No production DB, credentials, worker or supplier network.
const http=require('node:http'),cp=require('node:child_process'),fs=require('node:fs'),crypto=require('node:crypto');
const port=14865,nextPort=14864,now=new Date().toISOString(),email='pdf-fixture@example.test';
const user={name:'PDF验收',email,plan:'starter',creditsTotal:99999,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[],canHigh:true};
const image='http://127.0.0.1:'+port+'/__fixture/media/product.png';
const sharp=require('sharp');const media={};
const art={id:'placement-root',title:'主图',category:'main',prompt:'保留主体',createdAt:now,status:'completed',image,gradient:'',origin:'canvas',source:'canvas-add',groupId:'placement-root',width:320,height:260,canvasWidth:320,canvasHeight:260,canvasX:100,canvasY:100,ratio:'1:1',resolution:'1K'};
const arts=[{...art,title:'产品原图',width:1500,height:1500,canvasWidth:320,canvasHeight:420,canvasX:100,canvasY:100}, {...art,id:'composition',title:'构图参考',parentId:art.id,image:'http://127.0.0.1:'+port+'/__fixture/media/reference.png',width:750,height:1000,canvasX:550,canvasY:100,canvasWidth:320,canvasHeight:420}];
const initial=JSON.parse(JSON.stringify(arts));
const uploadedFiles=new Map();
const model={id:'gpt-image-2',label:'GPT Image 2',modality:'image',supportsEdit:true,qualities:['low','medium','high'],qualitySupported:true,nativeResolutions:['1K'],generationParameters:{ratios:['auto','1:1','3:4'],resolutions:['1K']}};
const state={submissions:[],positions:[],history:[],jobs:{},paidCalls:0,apiErrors:[],failNextPosition:false,hideUploads:false,inputUploads:[],plans:[],cutouts:[],mediaReads:[]};
const app=cp.spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(nextPort)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',SETTINGS_SECRET:crypto.randomUUID(),VIDEO_WORKER_SECRET:crypto.randomUUID(),NAUMI_VIDEO_WORKER:'0',OPENAI_API_KEY:'fixture-not-a-key',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:'.next-pdf-repair-fixture'},stdio:['ignore','pipe','pipe']});
app.stdout.on('data',b=>process.stdout.write(b));app.stderr.on('data',b=>process.stderr.write(b));
const json=(res,v,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(v))};
const server=http.createServer(async(req,res)=>{
 try{
 const u=new URL(req.url,'http://localhost'),p=u.pathname;
 let raw='';if(['POST','DELETE'].includes(req.method)) {const chunks=[];for await(const b of req)chunks.push(b);raw=Buffer.concat(chunks)}
 const body=String(raw).startsWith('{')?JSON.parse(raw):{};
 if(p==='/api/download'){const url=new URL(u.searchParams.get('u'));if(url.origin!=='http://127.0.0.1:'+port)return json(res,{error:'fixture download only'},403);const file=media[url.pathname]||uploadedFiles.get(url.pathname);if(!file)return json(res,{error:'missing media'},404);res.writeHead(200,{'content-type':'image/png'});return res.end(file)}
 if(p.startsWith('/__fixture/media/')){const file=media[p];state.mediaReads.push(p);if(!file){res.writeHead(404);return res.end()}res.writeHead(200,{'content-type':'image/png','cache-control':'private,max-age=600'});return res.end(file)}
 if(p==='/__fixture/sync-mode'){state.hideUploads=u.searchParams.get('mode')==='missing';return json(res,{ok:true})}
 if(p==='/api/artworks/parents'){const target=arts.find(a=>a.id===body.id);if(!target)return json(res,{error:'missing node'},404);target.parentIds=req.method==='DELETE'?(target.parentIds||[]).filter(id=>id!==body.parentId):[...new Set([...(target.parentIds||[]),body.parentId])];return json(res,{ok:true})}
 if(p==='/api/cutout'){const form=await new Request('http://fixture/cutout',{method:'POST',headers:{'content-type':req.headers['content-type']},body:raw}).formData();const file=form.get('image');state.cutouts.push({file:file?.name,sha256:file?crypto.createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'):null,sourceUrl:form.get('sourceUrl')});const id='cutout-result-'+state.cutouts.length;arts.push({...art,id,title:'透明主体',image:'http://127.0.0.1:'+port+'/__fixture/media/alpha.png',parentId:body.parentId||art.id,width:1500,height:1500,source:'derived'});return json(res,{ok:true,id,image:'http://127.0.0.1:'+port+'/__fixture/media/alpha.png',user})}
 if(p.startsWith('/__fixture/uploaded/')){const file=uploadedFiles.get(p);if(!file){res.writeHead(404);return res.end()}res.writeHead(200,{'content-type':'image/png'});return res.end(file)}
 if(p==='/__fixture/state')return json(res,{...state,artworks:state.hideUploads?arts.filter(a=>!a.id.startsWith('uploaded-')):arts});
 if(p==='/__fixture/reset'){arts.splice(0,arts.length,...JSON.parse(JSON.stringify(initial)));state.submissions.length=0;state.positions.length=0;state.history.length=0;state.jobs={};state.apiErrors.length=0;state.inputUploads.length=0;state.plans.length=0;state.cutouts.length=0;state.hideUploads=false;return json(res,{ok:true})}
 if(p.startsWith('/_next/static/chunks/')){
  const file=require('node:path').resolve('.next-pdf-repair-fixture',p.replace('/_next/',''));
  if(file.startsWith(require('node:path').resolve('.next-pdf-repair-fixture')+require('node:path').sep)&&fs.existsSync(file)){res.writeHead(200,{'content-type':'application/javascript'});return res.end(fs.readFileSync(file))}
 }
 if(p==='/__fixture/complete'){
  const index=Number(u.searchParams.get('index')||state.submissions.length)-1,job=state.submissions[index];if(!job)return json(res,{error:'missing job'},404);
  const result={...art,id:'placement-result-'+(index+1),title:'结果 '+(index+1),source:'generate',parentId:art.id,canvasX:undefined,canvasY:undefined,createdAt:new Date().toISOString()};arts.push(result);state.jobs[job.operationId].status='succeeded';state.jobs[job.operationId].artifacts=[{artworkId:result.id,url:image,width:320,height:260,mime:'image/png'}];return json(res,{ok:true});
 }
 if(p==='/__fixture/fail-position'){state.failNextPosition=true;return json(res,{ok:true})}
 if(p==='/api/artworks/add') {
  const form=await new Request('http://fixture/upload',{method:'POST',headers:{'content-type':req.headers['content-type']},body:raw}).formData();
  const file=form.get('image');const metadata=await require('sharp')(Buffer.from(await file.arrayBuffer())).metadata();
  const id='uploaded-'+(arts.filter(a=>a.id.startsWith('uploaded-')).length+1),parentId=form.get('parentId');
  uploadedFiles.set('/__fixture/uploaded/'+id+'.png',Buffer.from(await file.arrayBuffer()));
  const a={...art,id,image:'http://127.0.0.1:'+port+'/__fixture/uploaded/'+id+'.png',title:String(form.get('title')),parentId,groupId:parentId||id,canvasX:Number(form.get('x')),canvasY:Number(form.get('y')),width:metadata.width,height:metadata.height,canvasWidth:120,canvasHeight:Math.round(120*metadata.height/metadata.width),createdAt:new Date().toISOString()};
  arts.push(a);state.submissions.push({type:'upload',id,x:a.canvasX,y:a.canvasY,parentId});return json(res,{...a,ok:true});
 }
 if(p.startsWith('/api/')){
  if(p==='/api/config')return json(res,{db:true,authMode:'mock',multiUser:true,commerceVisible:false,imageQualityCapable:true,creditsMetered:true,imageModels:[model],defaultImageModel:model.id});
  if(p==='/api/auth/session')return json(res,{user});
  if(p==='/api/feature-access')return json(res,{email,policy:{mode:'default',allowed:[],version:1}});
  if(p==='/api/account')return json(res,{persisted:true,user,artworks:state.hideUploads?arts.filter(a=>!a.id.startsWith('uploaded-')):arts});
  if(p==='/api/projects')return json(res,{names:{'tree:placement-root':'PDF验收'}});
  if(p==='/api/models')return json(res,{managed:false,supported:true,feature:u.searchParams.get('feature'),version:1,models:[model],defaultModelId:model.id});
  if(p==='/api/text-models')return json(res,{models:['gpt-4o'],defaultModel:'gpt-4o'});
  if(p==='/api/billing/catalog')return json(res,{version:1,features:Object.fromEntries(['image.generate','canvas.image','canvas.expand','canvas.text-generate','canvas.assistant','tool.cutout'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{medium:{'1K':0}}}])),products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}});
  if(p==='/api/billing/quote')return json(res,{...body,credits:0,reserveCredits:0,version:1});
  if(p==='/api/imagegen/inputs'){const form=await new Request('http://fixture/input',{method:'POST',headers:{'content-type':req.headers['content-type']},body:raw}).formData();const file=form.get('file')||form.get('image');const bytes=Buffer.from(await file.arrayBuffer()),m=await sharp(bytes).metadata();const id='asset-'+(state.inputUploads.length+1);state.inputUploads.push({id,width:m.width,height:m.height,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});return json(res,{artworkId:id,url:image,width:m.width,height:m.height})}
  if(p==='/api/imagegen/plan'){state.plans.push(body);return json(res,{request:body,intent:{operation:'edit',background:null,requirements:[],conflicts:[]},steps:[{key:'generate',operation:'edit',credits:0}],warnings:[],confirmationRequired:false,totalCredits:0,billingVersion:1,modelVersion:1});}
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
  if(p==='/api/artworks/get')return json(res,{artworks:arts.filter(a=>(!state.hideUploads||!a.id.startsWith('uploaded-'))&&(u.searchParams.get('ids')||'').split(',').includes(a.id))});
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
Promise.all([
 sharp({create:{width:1500,height:1500,channels:3,background:'#f2d5ba'}}).composite([{input:Buffer.from('<svg width="1500" height="1500"><rect x="500" y="300" width="500" height="950" fill="#49977e"/><text x="625" y="800" font-size="100" fill="white">产品</text></svg>')}]).png().toBuffer(),
 sharp({create:{width:750,height:1000,channels:3,background:'#c36357'}}).png().toBuffer(),
 sharp({create:{width:1500,height:1500,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:Buffer.from('<svg width="1500" height="1500"><rect x="500" y="300" width="500" height="950" fill="#49977e"/></svg>')}]).png().toBuffer()
]).then(([product,reference,alpha])=>{media['/__fixture/media/product.png']=product;media['/__fixture/media/reference.png']=reference;media['/__fixture/media/alpha.png']=alpha;server.listen(port,'127.0.0.1',()=>console.log('PDF_FIXTURE=http://127.0.0.1:'+port+'/canvas PAID_CALLS=0'))});
process.on('SIGINT',()=>{app.kill();server.close(()=>process.exit(0))});process.on('exit',()=>app.kill());
