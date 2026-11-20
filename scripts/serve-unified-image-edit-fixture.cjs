// Actual Next UI + actual planner/pixel inspector. Only HTTP/DB/provider ports are local fixtures.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),sharp=require('sharp');
(async()=>{
 process.env.FIXTURE_PORT||='15095';process.env.FIXTURE_DIST||='.next-unified-image-edit';process.env.FIXTURE_OUT||='output/unified-image-edit/browser';
 let setup=fs.readFileSync('scripts/verify-imagegen-hidden-cutout.cjs','utf8');const cut=setup.indexOf('  const req=');if(cut<0)throw Error('Planner fixture boundary changed');
 setup=setup.slice(0,cut)+`  return {api,state,config};\n}\nmodule.exports=main;`;
 setup=setup.replace('export {planImagegen}', 'export {inspectImagegenPixels} from "./src/lib/imagegen/postprocess"; export {hasTransparentSubject} from "./src/lib/imagegen/pixels"; export {planImagegen}').replace('width:1024,height:1024','width:1918,height:1080');
 const loader=new Module(path.resolve('scripts/.unified-planner-fixture.cjs'),module);loader.filename=path.resolve('scripts/.unified-planner-fixture.cjs');loader.paths=module.paths;loader._compile(setup,loader.filename);const planner=await loader.exports();
 const source=await sharp({create:{width:1918,height:1080,channels:4,background:'#a7c9e5'}}).composite([{input:await sharp({create:{width:600,height:700,channels:4,background:'#355f4a'}}).png().toBuffer(),left:659,top:190}]).png().toBuffer();
 const valid=await sharp(source).ensureAlpha().raw().toBuffer();for(let y=0;y<1080;y++)for(let x=0;x<1918;x++)if(x<659||x>=1259||y<190||y>=890)valid[(y*1918+x)*4+3]=0;
 const transparent=await sharp(valid,{raw:{width:1918,height:1080,channels:4}}).png().toBuffer();
 globalThis.__unifiedImageFixture={...planner,source,transparent,quotes:new Map(),jobs:new Map()};
 let app=fs.readFileSync('scripts/serve-agent-chat-attachments-fixture.cjs','utf8');
 app="const unified=globalThis.__unifiedImageFixture;\n"+app;
 app=app.replace("image:'http://127.0.0.1:'+port+'/demos/suite-demo/suppl-src.png'", "image:'http://127.0.0.1:'+port+'/unified-source.png'").replace('width:320,height:260,canvasWidth:320,canvasHeight:260','width:1918,height:1080,canvasWidth:360,canvasHeight:203');
 app=app.replace("const model={id:'image-fixture'", "const model={id:'image-a'");
 const at=app.indexOf(" if(p==='/api/config')");if(at<0)throw Error('Existing HTTP fixture boundary changed');
 app=app.slice(0,at)+`
 if(p==='/unified-source.png'||p==='/unified-result.png'){res.writeHead(200,{'content-type':'image/png','cache-control':'no-store'});return res.end(p==='/unified-source.png'?unified.source:unified.transparent);}
 if(p==='/api/download'&&['unified-source.png','unified-result.png'].some(name=>u.searchParams.get('u')==='http://127.0.0.1:'+port+'/'+name)){res.writeHead(200,{'content-type':'image/png'});return res.end(u.searchParams.get('u').endsWith('unified-source.png')?unified.source:unified.transparent);}
 if(p==='/__unified/control'){state.invalid=u.searchParams.get('invalid')==='1';return json(res,{ok:true});}
 if(p==='/api/canvas/image-prompts')return json(res,{document:req.method==='GET'?null:body.document,revision:req.method==='GET'?0:(body.expectedRevision||0)+1,workspace:'personal',persisted:true});
 if(p==='/api/canvas/workflow-import')return json(res,{manifests:[]});
 if(p==='/api/imagegen/inputs'){
  const form=await new Request('http://fixture',{method:'POST',headers:{'content-type':req.headers['content-type']},body:raw}).formData(),file=form.get('image');state.inputUploads=(state.inputUploads||0)+1;
  return json(res,{artworkId:'asset-'+crypto.randomUUID(),url:'http://127.0.0.1:'+port+'/unified-source.png',width:1918,height:1080});
 }
 if(p==='/api/imagegen/plan'){
  try{const plan=await unified.api.planImagegen(body,email),qid=crypto.randomUUID();plan.quote={id:qid,expiresAt:new Date(Date.now()+600000).toISOString()};unified.quotes.set(qid,plan);state.plans||=[];state.plans.push({operationId:plan.request.operationId,entry:plan.request.entry,prompt:plan.request.prompt,ratio:plan.request.parameters.ratio,modelId:plan.request.modelId,canvasTarget:plan.request.canvasTarget,intent:plan.intent,steps:plan.steps.map(s=>({key:s.key,operation:s.operation,modelId:s.modelId})),totalCredits:plan.totalCredits});return json(res,plan);}
  catch(e){return json(res,{error:e.message,code:e.code,accepted:false},e.status||422);}
 }
 if(p==='/api/imagegen'&&req.method==='POST'){
  const plan=unified.quotes.get(body.quoteId);if(!plan||body.operationId!==plan.request.operationId)return json(res,{error:'quote mismatch',accepted:false},409);
  state.generations||=[];if(!unified.jobs.has(body.operationId)){state.generations.push({operationId:body.operationId,entry:plan.request.entry,modelId:plan.steps[0].modelId,ratio:plan.request.parameters.ratio,steps:plan.steps.length});unified.jobs.set(body.operationId,{plan,invalid:!!state.invalid});}
  return json(res,{operationId:body.operationId,jobId:'imagegen-'+body.operationId,status:'queued'});
 }
 if((p==='/api/imagegen'||p==='/api/generate-image')&&req.method==='GET'){
  const legacy=p==='/api/generate-image',id=legacy?(u.searchParams.get('job')||'').slice(9):u.searchParams.get('operationId'),job=unified.jobs.get(id);if(!job)return json(res,{error:'unknown original task'},404);
  state.polls=(state.polls||0)+1;const artifactId='unified-'+id,plan=job.plan;const pixels=await unified.api.inspectImagegenPixels(job.invalid?unified.source:unified.transparent);
  if(plan.intent.background==='transparent'&&!unified.api.hasTransparentSubject(pixels))return json(res,{operationId:id,jobId:'imagegen-'+id,status:'failed',stage:'done',artifacts:[],chargedCredits:0,error:{code:'IMAGE_OUTPUT_INVALID',message:'模型未返回有效透明主体，原任务已保留'}});
  const url='http://127.0.0.1:'+port+'/unified-result.png';if(!arts.some(a=>a.id===artifactId))arts.push({...art,id:artifactId,title:'统一编辑结果',image:url,category:plan.intent.useCase==='background-extraction'?'cutout':'main',parentId:plan.request.sourceNodeId||'attachment-root',groupId:'attachment-root',canvasX:950});
  let canvasAttachment;
  if(plan.request.canvasTarget){const node=arts.find(a=>a.id===plan.request.canvasTarget.nodeId);canvasAttachment={nodeId:node.id,applied:true,previousVersionId:node.canvasImageVersionId||'original',previousImage:node.image,versionId:artifactId,revision:(node.canvasImageRevision||0)+1};Object.assign(node,{image:url,canvasImageVersionId:artifactId,canvasImageRevision:canvasAttachment.revision});}
  return json(res,legacy?{canvasAttachment,status:'done',operationStatus:'succeeded',stage:'done',images:[{id:artifactId,url,width:1918,height:1080}],creditsUsed:plan.totalCredits,user}:{operationId:id,jobId:'imagegen-'+id,status:'succeeded',stage:'done',artifacts:[{artworkId:artifactId,url,mime:'image/png',...pixels}],chargedCredits:plan.totalCredits});
 }
 if(p==='/api/cutout'){state.legacyCutoutPosts=(state.legacyCutoutPosts||0)+1;return json(res,{error:'No new request may use cutout route'},500);}
 `+app.slice(at);
 const fixture=new Module(path.resolve('scripts/.unified-image-ui.cjs'),module);fixture.filename=path.resolve('scripts/.unified-image-ui.cjs');fixture.paths=module.paths;fixture._compile(app,fixture.filename);
})().catch(e=>{console.error(e);process.exitCode=1});
