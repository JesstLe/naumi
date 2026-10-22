// Real CanvasClient, isolated loopback API fixtures. No DB, worker or supplier traffic.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=process.cwd(),port=Number(process.env.FIXTURE_PORT||14871),nextPort=port+1,out=path.resolve(process.env.FIXTURE_OUT||'output/agent-chat-attachments-20261020/browser-modified');fs.mkdirSync(out,{recursive:true});
const now=new Date().toISOString(),email='attachment-ui@example.test',user={email,name:'附件验收',plan:'starter',creditsTotal:10000,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[],canHigh:true};
const art={id:'attachment-root',title:'原始场景',category:'main',prompt:'场景',createdAt:now,status:'completed',image:'http://127.0.0.1:'+port+'/demos/suite-demo/suppl-src.png',gradient:'',origin:'canvas',source:'canvas-add',groupId:'attachment-root',width:320,height:260,canvasWidth:320,canvasHeight:260,canvasX:500,canvasY:400,ratio:'1:1',resolution:'1K'};
const arts=[art,{...art,id:'other-project',groupId:'other-project',title:'另一项目',canvasX:0,canvasY:0}];
const model={id:'image-fixture',label:'图片模型',modality:'image',supportsEdit:true,qualities:['medium'],nativeResolutions:['1K'],generationParameters:{ratios:['auto','1:1','3:4'],resolutions:['1K']}};
const state={uploads:[],turns:[],positions:[],history:[],failUpload:false,prepareDelay:0,paidCalls:0};
let holdStream=false;const heldReplies=[];
function finishReply(res,body){res.end(`event: delta\ndata: ${JSON.stringify({text:'本地验收已收到 '+body.contextIds.length+' 张图片。'})}\n\nevent: done\ndata: {"ok":true}\n\n`);}
const dist=process.env.FIXTURE_DIST||'.next-agent-chat-attachments';
const app=cp.spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'dev','-p',String(nextPort)],{cwd:root,env:{...process.env,DATABASE_URL:'',VIDEO_WORKER_DISABLED:'1',NAUMI_VIDEO_WORKER:'0',OPENAI_API_KEY:'fixture-not-a-key',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:dist},windowsHide:true,stdio:['ignore','pipe','pipe']});
app.stdout.on('data',b=>process.stdout.write(b));app.stderr.on('data',b=>process.stderr.write(b));
const json=(r,v,s=200)=>{r.writeHead(s,{'content-type':'application/json','cache-control':'no-store'});r.end(JSON.stringify(v));};
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1'),p=u.pathname;const chunks=[];for await(const b of req)chunks.push(b);const raw=Buffer.concat(chunks);const body=req.headers['content-type']?.includes('application/json')&&raw.length?JSON.parse(raw):{};
 if(p==='/__fixture/state')return json(res,{...state,artworks:arts});
 if(p==='/__fixture/control'){if(u.searchParams.has('fail'))state.failUpload=u.searchParams.get('fail')==='1';if(u.searchParams.has('delay'))state.prepareDelay=Number(u.searchParams.get('delay'));if(u.searchParams.has('hold'))holdStream=u.searchParams.get('hold')==='1';if(u.searchParams.has('release'))for(const [reply,turn] of heldReplies.splice(0))finishReply(reply,turn);return json(res,{ok:true});}
 if(p==='/api/media/uploads'){if(state.prepareDelay)await new Promise(r=>setTimeout(r,state.prepareDelay));return json(res,{enabled:false});}
 if(p==='/api/artworks/add'){
  if(state.failUpload){state.failUpload=false;return json(res,{error:'本地验收：此张上传失败'},500);}
  const f=await new Request('http://fixture',{method:'POST',headers:{'content-type':req.headers['content-type']},body:raw}).formData(),file=f.get('image');
  const id='uploaded-'+(state.uploads.length+1),entry={id,title:String(f.get('title')),parentId:f.get('parentId'),x:Number(f.get('x')),y:Number(f.get('y')),bytes:file.size,hash:crypto.createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),previews:['thumbnail','preview'].every(k=>f.get(k)?.size>0)};
  state.uploads.push(entry);arts.push({...art,id,title:entry.title,parentId:entry.parentId,canvasX:entry.x,canvasY:entry.y,createdAt:new Date().toISOString()});return json(res,{ok:true,id,image:art.image,width:320,height:260});
 }
 if(p==='/api/canvas/assistant'){
  if(req.method==='POST'){state.turns.push(body);res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});res.write(`event: open\ndata: ${JSON.stringify({sessionId:body.sessionId})}\n\n`);if(holdStream)heldReplies.push([res,body]);else finishReply(res,body);return;}
  const last=state.turns.at(-1);if(u.searchParams.has('id'))return json(res,{session:{id:u.searchParams.get('id'),anchorId:last?.anchorId||'attachment-root',referenceIds:last?.contextIds||[],turns:[],steps:[],running:false,status:'completed'}});
  return json(res,{sessions:last?[{id:last.sessionId,title:'多图会话',anchorId:last.anchorId,updatedAt:now}]:[]});
 }
 if(p==='/api/config')return json(res,{db:true,authMode:'mock',multiUser:true,commerceVisible:false,imageQualityCapable:true,creditsMetered:true,imageModels:[model],defaultImageModel:model.id});
 if(p==='/api/auth/session')return json(res,{user});if(p==='/api/account')return json(res,{persisted:true,user,artworks:arts});
 if(p==='/api/feature-access')return json(res,{email,policy:{mode:'default',allowed:[],version:1}});
 if(p==='/api/projects')return json(res,{names:{'tree:attachment-root':'附件验收','tree:other-project':'另一项目'}});
 if(p==='/api/models')return json(res,{managed:false,supported:true,feature:u.searchParams.get('feature'),version:1,models:[model],defaultModelId:model.id});
 if(p==='/api/text-models')return json(res,{models:['fixture-text'],defaultModel:'fixture-text'});
 if(p==='/api/billing/catalog')return json(res,{version:1,features:Object.fromEntries(['image.generate','canvas.image','canvas.assistant'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{medium:{'1K':0}}}])),products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}});
 if(p==='/api/billing/quote')return json(res,{...body,credits:0,reserveCredits:0,version:1});
 if(p==='/api/artworks/get')return json(res,{artworks:arts.filter(a=>(u.searchParams.get('ids')||'').split(',').includes(a.id))});
 if(p==='/api/artworks/position'){state.positions.push(body);return json(res,{ok:true});}
 if(p==='/api/canvas/history'){state.history.push(body);return json(res,{ok:true});}
 if(p.startsWith('/api/'))return json(res,{items:[],tasks:[],names:{},nodes:[],settings:{},records:[],artworks:[],ok:true,persisted:true,models:[]});
 if(p.startsWith('/_next/static/chunks/')){const base=path.resolve(dist),file=path.resolve(dist,p.slice('/_next/'.length));if(file.startsWith(base+path.sep)&&fs.existsSync(file)){res.writeHead(200,{'content-type':'application/javascript','cache-control':'no-store'});return res.end(fs.readFileSync(file));}}
 const upstream=http.request({host:'127.0.0.1',port:nextPort,path:req.url,method:req.method,headers:{...req.headers,'accept-encoding':'identity',host:'127.0.0.1:'+nextPort}},r=>{const bufs=[];r.on('data',b=>bufs.push(b));r.on('end',()=>{let bytes=Buffer.concat(bufs),h={...r.headers};if(String(h['content-type']).includes('text/html')){const script=`<script>localStorage.setItem('theme','light');localStorage.setItem('naumi:last-email',${JSON.stringify(email)});localStorage.setItem('naumi:user:'+${JSON.stringify(email)},${JSON.stringify(JSON.stringify(user))});localStorage.setItem('nv:canvas:last','tree:attachment-root');localStorage.setItem('nv:canvas:bg','light');</script>`;bytes=Buffer.from(bytes.toString().replace('<head>','<head>'+script));delete h['content-length'];}res.writeHead(r.statusCode,h);res.end(bytes);});});upstream.on('error',()=>json(res,{error:'fixture warming'},503));upstream.end(raw);
 }catch(e){console.error(e);json(res,{error:String(e)},500);}});
server.listen(port,'127.0.0.1',()=>console.log('FIXTURE_READY=http://127.0.0.1:'+port+' NEXT='+nextPort+' SUPPLIER_CALLS=0'));
function close(){fs.writeFileSync(out+'/state.json',JSON.stringify(state,null,2));server.close();app.kill();}process.on('SIGINT',close);process.on('SIGTERM',close);
