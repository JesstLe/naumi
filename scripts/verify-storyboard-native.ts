import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createHash} from "node:crypto";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import path from "node:path";
import {STORYBOARD_VIDEO_FAMILIES} from "../src/lib/model-config/video-family-storyboard";
import {normalizeVideoInput,resolveVideoCapability,VideoContractError} from "../src/lib/video/contract";
import {videoDefinitionSchema,videoProfileProtocol,type VideoMode} from "../src/lib/video/capability-schema";
import {buildVideoCreate,buildVideoPoll,type VideoWireContext} from "../src/lib/video/providers/wire";
import type {VideoGenerationRequest,VideoReference,VideoTaskSnapshot} from "../src/lib/video/types";

const out=path.resolve(process.env.STORYBOARD_NATIVE_OUT||"E:/Workspace/naumi/output/storyboard-flow-20261102/native");
mkdirSync(out,{recursive:true});let checks=0,posts=0,polls=0;const cases:string[]=[];
const check=(a:unknown,b:unknown,label:string)=>{assert.deepEqual(a,b,label);checks++;cases.push(label);};
const reject=(fn:()=>unknown,label:string)=>{assert.throws(fn,e=>e instanceof VideoContractError,label);checks++;cases.push(label);};
type Item=typeof STORYBOARD_VIDEO_FAMILIES[number];
const image=(id="image-1",role:VideoReference['role']='reference'):VideoReference=>({id,kind:'image',role,url:`https://media.example.test/${id}.png`,mimeType:'image/png',bytes:1000,width:1280,height:720});
const video:VideoReference={id:'motion',kind:'video',role:'source_video',url:'https://media.example.test/motion.mp4',mimeType:'video/mp4',durationSeconds:4,bytes:1000,width:1280,height:720};
const shots=[{id:'shot-a',textNodeId:'text-a',prompt:'A red cube enters the frame. Dialogue: "Keep every word."',durationSeconds:2},{id:'shot-b',textNodeId:'text-b',prompt:'The camera holds. The exact sign reads "图片1".',durationSeconds:4}];
function request(item:Item,mode:VideoMode='text',refs:VideoReference[]=[]):VideoGenerationRequest{return {source:'canvas',providerId:item.providerId,modelId:item.model,mode,prompt:'Original overall prompt remains unchanged.',durationSeconds:6,resolution:'720p',aspectRatio:['single_image','frames_required'].includes(mode)?'adaptive':'16:9',references:refs,idempotencyKey:'storyboard-fixture-'+item.model};}
function context(item:Item,req:VideoGenerationRequest):VideoWireContext{return {profile:item.profile,request:req,provider:{id:item.providerId,label:'Local storyboard fixture',protocol:videoProfileProtocol(item.profile),baseUrl:'https://supplier.example.test',apiKey:'fixture-not-live',models:[item.model],defaultModel:item.model,videoProfile:item.profile,idempotencyStrategy:'header'}};}
const legacyFiles=['src/lib/model-config/video-family-capabilities.json','src/lib/model-config/video-family-multimodal.json','src/lib/video/providers/protocols/apib-documented.ts','src/lib/video/providers/protocols/apib-multimodal-v3.ts','src/lib/video/providers/protocols/multimodal-v3-input.ts','src/lib/video/providers/protocols/geek-multimodal-v3.ts'];
async function main(){
 check(STORYBOARD_VIDEO_FAMILIES.map(x=>x.model),['kling-v3','kling-v3-omni'],'two exact model identities');
 const hashes:Record<string,string>={};for(const file of legacyFiles){const before=execFileSync('git',['show','2e795097:'+file]);const after=readFileSync(file);hashes[file]=createHash('sha256').update(after).digest('hex');check(hashes[file],createHash('sha256').update(before).digest('hex'),'immutable previous file '+file);}
 for(const item of STORYBOARD_VIDEO_FAMILIES){
  videoDefinitionSchema.parse(item.definition);checks++;check(item.definition.supportsMultiShot,true,item.model+' catalog flag');check(item.definition.maxShots,6,item.model+' max shots');
  check(item.documentation.sources[0].sha256.length,64,item.model+' sourced contract hash');
  const modes:Array<[VideoMode,VideoReference[]]>=[['text',[]],['single_image',[image('first','first_frame')]],['frames_required',[image('first','first_frame'),image('last','last_frame')]]];
  if(item.model==='kling-v3-omni')modes.push(['reference',[image()]],['reference',[video]],['reference',[image('first','first_frame'),video]]);
  for(const [mode,refs] of modes){
   const req=request(item,mode,refs),ctx=context(item,req),previous={...ctx,profile:item.previousProfile,provider:{...ctx.provider,videoProfile:item.previousProfile}};
   check(buildVideoCreate(ctx),buildVideoCreate(previous),item.model+'/'+mode+' ordinary wire exact prior behavior');
   const withShots={...ctx,request:{...req,shots:structuredClone(shots)}},before=JSON.stringify(withShots),wire=buildVideoCreate(withShots),body=wire.body as Record<string,any>;
   check(JSON.stringify(withShots),before,item.model+'/'+mode+' immutable caller');
   check([wire.path,wire.method,body.multi_shot,body.shot_type],['/v1/videos/generations','POST',true,'customize'],item.model+'/'+mode+' exact storyboard envelope');
   check(body.multi_prompt.map((s:any)=>[s.index,s.duration]),[[1,2],[2,4]],item.model+'/'+mode+' original order and seconds');
   check(body.multi_prompt.map((s:any)=>Object.keys(s)),[['index','prompt','duration'],['index','prompt','duration']],item.model+'/'+mode+' no local node identity leaks');
   for(let i=0;i<2;i++)check(body.multi_prompt[i].prompt.startsWith(shots[i].prompt),true,item.model+'/'+mode+' exact shot text prefix');
   if(mode!=='reference'||!refs.some(ref=>ref.kind==='image'))check(body.multi_prompt.map((s:any)=>s.prompt),shots.map(s=>s.prompt),item.model+'/'+mode+' text exactly preserved');
   else check(body.multi_prompt[1].prompt.includes('"图片1".'),true,'Omni literal labels never replaced');
   const {multi_shot:_m,shot_type:_s,multi_prompt:_p,...ordinary}=body;check(ordinary,(buildVideoCreate(previous).body),item.model+'/'+mode+' no unrelated wire field change');
   reject(()=>buildVideoCreate({...previous,request:{...req,shots}}),item.model+'/'+mode+' prior profile still rejects structured shots');
  }
  const req={...request(item),shots:structuredClone(shots)},ctx=context(item,req);
  for(const bad of [[],[{prompt:'single',durationSeconds:6}],Array.from({length:6},(_,i)=>({prompt:'shot'+i,durationSeconds:1}))]){
   const wire=buildVideoCreate({...ctx,request:{...req,shots:bad}}).body as any;
   check(bad.length?wire.multi_prompt.length:'multi_prompt' in wire,bad.length||false,item.model+' accepted count '+bad.length);
  }
  for(const patch of [
   {shots:Array.from({length:7},()=>({prompt:'one second',durationSeconds:1})),durationSeconds:7},
   {shots:[{prompt:'too short',durationSeconds:0.5},{prompt:'rest',durationSeconds:5.5}]},
   {shots:[{prompt:'wrong sum',durationSeconds:5}]},
   {shots:[{prompt:'',durationSeconds:6}]},
   {shots:[{prompt:'nan',durationSeconds:NaN}]},
   {durationSeconds:16},
   {providerOptions:{multi_shot:true}},
   {negativePrompt:'not silently omitted'},
   {watermark:true},
   {elements:[{name:'undeclared',references:[image()]}]},
   {references:[{...video,mimeType:'video/webm'}],mode:'reference'},
  ])reject(()=>buildVideoCreate({...ctx,request:{...req,...patch} as VideoGenerationRequest}),item.model+' invalid '+JSON.stringify(patch).slice(0,75));
  const disabled=resolveVideoCapability({manual:{...item.definition,supportsMultiShot:false}});reject(()=>normalizeVideoInput(req as unknown as Record<string,unknown>,disabled),item.model+' administrator false preserved');
  reject(()=>normalizeVideoInput(req as unknown as Record<string,unknown>,{...item.definition,maxShots:0}),item.model+' administrator zero preserved');
  check(buildVideoPoll(ctx,'task/unsafe ?').path,'/v1/tasks/task%2Funsafe%20%3F?language=zh',item.model+' poll path escaped');
 }
 const [standard,omni]=STORYBOARD_VIDEO_FAMILIES;
 check((buildVideoCreate(context(standard,{...request(standard),shots:[{prompt:'x'.repeat(512),durationSeconds:2.5},{prompt:'precise fractional duration',durationSeconds:3.5}]})).body as any).multi_prompt[0].duration,2.5,'standard channel preserves documented fractional shot duration');
 reject(()=>buildVideoCreate(context(standard,{...request(standard),shots:[{prompt:'x'.repeat(513),durationSeconds:6}]})),'standard 512-char per-shot boundary');
 reject(()=>buildVideoCreate(context(omni,{...request(omni),shots:[{prompt:'one',durationSeconds:2.5},{prompt:'two',durationSeconds:3.5}]})),'Omni requires integer shot durations');
 check((buildVideoCreate(context(omni,{...request(omni),shots:[{prompt:'x'.repeat(513),durationSeconds:6}]})).body as any).multi_prompt[0].prompt.length,513,'Omni does not inherit another channel 512-char limit');
 reject(()=>buildVideoCreate({...context(standard,request(standard)),request:{...request(standard),modelId:'kling-v4',shots}}),'unregistered model does not inherit storyboard profile');
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url!,'http://fixture');res.setHeader('content-type','application/json');
  if(req.method==='POST'){
   const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const body=JSON.parse(Buffer.concat(chunks).toString());assert.equal(url.pathname,'/v1/videos/generations');assert.ok(req.headers['idempotency-key']);
   assert.equal(body.multi_shot,true);assert.equal(body.shot_type,'customize');assert.deepEqual(body.multi_prompt,shots.map((s,i)=>({index:i+1,prompt:s.prompt,duration:s.durationSeconds})));assert.equal(body.duration,6);posts++;
   return res.end(JSON.stringify({data:[{task_id:'local-shot-'+posts,status:'queued'}]}));
  }
  if(url.pathname==='/result.mp4'){res.setHeader('content-type','video/mp4');return res.end(Buffer.from('local-storyboard-protocol-fixture'));}
  assert.ok(url.pathname.startsWith('/v1/tasks/local-shot-'));polls++;const media=`http://127.0.0.1:${(server.address() as any).port}/result.mp4`;
  res.end(JSON.stringify({data:{status:'completed',result:{videos:[{url:[media]}]}}}));
 }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${(server.address() as any).port}`;process.env.MODEL_CONFIG_TRUSTED_ORIGINS=origin;
 try{
  const {createWireVideoAdapter}=await import('../src/lib/video/providers/wire-adapter'),{runPrivateVideoProvider}=await import('../src/lib/video/providers/private-context');
  for(const item of STORYBOARD_VIDEO_FAMILIES){const req={...request(item),shots:structuredClone(shots)},cfg={...context(item,req).provider,baseUrl:origin};
   await runPrivateVideoProvider({config:cfg,manifest:{} as any},async()=>{
    const adapter=createWireVideoAdapter(cfg),created=await adapter.create(req);check(created.status,'queued',item.model+' HTTP receipt');
    const task:VideoTaskSnapshot={id:req.idempotencyKey,email:'fixture@example.test',providerId:item.providerId,modelId:item.model,prompt:req.prompt,parameters:{durationSeconds:6,resolution:'720p',shots:req.shots},references:[],upstreamTaskId:created.upstreamTaskId};
    const before=JSON.stringify(task),postCount=posts,recovered=createWireVideoAdapter(cfg),result=await recovered.poll(structuredClone(task));check(result.status,'completed',item.model+' recovered original task');
    await recovered.poll(structuredClone(task));check(posts,postCount,item.model+' recovery does not repeat POST');check(JSON.stringify(task),before,item.model+' frozen shot snapshot unchanged');
    const fetched=await recovered.fetchResult(task,result);check(Buffer.from(fetched.bytes!).toString(),'local-storyboard-protocol-fixture',item.model+' HTTP result bytes');
    await assert.rejects(()=>adapter.create({...req,shots:[{prompt:'invalid sum',durationSeconds:4}]}),VideoContractError);check(posts,postCount,item.model+' bad shot rejected before HTTP');
   });
  }
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
 check(posts,2,'one create per explicit exact model');check(polls,4,'two recovery polls per accepted task');
 writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({checks,posts,polls,realSupplierCalls:0,legacyHashes:hashes,cases,evidence:'real codec and HTTP adapter with local supplier fixture; not paid video quality or application DB billing acceptance'},null,2));
 console.log(`STORYBOARD_NATIVE=PASS MODELS=2 CHECKS=${checks} LOCAL_POSTS=${posts} POLLS=${polls} RECOVERY_REPOSTS=0 LEGACY_FILES_UNCHANGED=${legacyFiles.length} REAL_SUPPLIER_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
