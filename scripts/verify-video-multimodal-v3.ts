import ts from "typescript";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createHash} from "node:crypto";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import path from "node:path";
import {MULTIMODAL_VIDEO_FAMILIES} from "../src/lib/model-config/video-family-multimodal";
import prior from "../src/lib/model-config/video-family-capabilities.json";
import {normalizeVideoInput,VideoContractError} from "../src/lib/video/contract";
import {videoDefinitionSchema,videoProfileProtocol,type VideoMode} from "../src/lib/video/capability-schema";
import {buildVideoCreate,buildVideoPoll,type VideoWireContext} from "../src/lib/video/providers/wire";
import type {VideoReference,VideoGenerationRequest,VideoTaskSnapshot} from "../src/lib/video/types";
import {attachVideoInputs,selectVideoIntent} from "../src/lib/video/legacy-mode-selection";
import type {VideoCatalogModel,VideoNodeConfig} from "../src/lib/video/legacy-client-settings";
import type {OrderedInput} from "../src/lib/video/references";

type Entry=typeof MULTIMODAL_VIDEO_FAMILIES[number];
const out=path.resolve(process.env.VIDEO_MULTIMODAL_OUT||"E:/Workspace/naumi/output/canvas-video-modes-20261102/wire");
mkdirSync(out,{recursive:true});let checks=0,posts=0,polls=0;const results:string[]=[];
const check=(actual:unknown,expected:unknown,label:string)=>{assert.deepEqual(actual,expected,label);checks++;results.push(label)};
const reject=(action:()=>unknown,label:string)=>{assert.throws(action,e=>e instanceof VideoContractError,label);checks++;results.push(label)};
const ref=(kind:VideoReference['kind'],n=1,role:VideoReference['role']='reference'):VideoReference=>({id:`${kind}-${n}`,kind,role,url:`https://media.example.test/${kind}-${n}?signature=retained`,mimeType:kind==='image'?'image/png':kind==='video'?'video/mp4':'audio/mpeg',bytes:1000,...(kind!=='image'?{durationSeconds:3}:{}),...(kind!=='audio'?{width:1280,height:720}:{})});
function request(item:Entry,mode:VideoMode,references:VideoReference[]):VideoGenerationRequest {
  const ratio=item.definition.modeParameters?.[mode]?.aspectRatios?.[0]||item.definition.defaultAspectRatio!;
  return {source:'canvas',providerId:item.providerId,modelId:item.model,prompt:'固定主体，参考输入动作与节奏',mode,references,idempotencyKey:`fixture-${item.publicId}-${mode}`,
    durationSeconds:item.definition.defaultDurationSeconds!,resolution:item.definition.defaultResolution!,aspectRatio:ratio};
}
function context(item:Entry,req:VideoGenerationRequest):VideoWireContext {
  return {profile:item.profile,request:req,provider:{id:item.providerId,label:'Local protocol fixture',protocol:videoProfileProtocol(item.profile),baseUrl:'https://supplier.example.test',apiKey:'fixture-not-a-live-key',models:[item.model],defaultModel:item.model,idempotencyStrategy:'header',videoProfile:item.profile}};
}
function references(item:Entry):VideoReference[]{return item.model==='kling-v3-omni'?[ref('video')]:[ref('image'),ref('video'),ref('audio')];}
const legacyFiles=['src/lib/video/providers/protocols/apib-documented.ts','src/lib/video/providers/protocols/geek-documented.ts','src/lib/video/providers/protocols/geek-h3-documented.ts','src/lib/model-config/video-family-capabilities.json'];
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');

async function main(){
  check(MULTIMODAL_VIDEO_FAMILIES.length,11,'eleven exact published identities, not model-name wildcard routing');
  const executable=(file:string,bytes:Buffer)=>file.endsWith('.json')?bytes.toString('utf8').replace(/\r\n/g,'\n'):
    ts.createSourceFile(file,bytes.toString('utf8'),ts.ScriptTarget.Latest,true).statements.filter(node=>!ts.isImportDeclaration(node)).map(node=>node.getText()).join('\n').replace(/\r\n/g,'\n');
  const legacyHashes:Record<string,string>={};for(const file of legacyFiles){const before=execFileSync('git',['show','2b990949:'+file]),after=readFileSync(file);check(executable(file,after),executable(file,before),'old frozen executable contract unchanged '+file);legacyHashes[file]=hash(after)}
  for(const item of MULTIMODAL_VIDEO_FAMILIES){
    videoDefinitionSchema.parse(item.definition);checks++;
    assert.ok(item.documentation.sources.every(source=>source.sha256.length===64));checks++;
    const req=request(item,'reference',references(item)),ctx=context(item,req),before=JSON.stringify(ctx),wire=buildVideoCreate(ctx),body=wire.body as any;
    check(JSON.stringify(ctx),before,item.publicId+' input unchanged');check(wire.method,'POST',item.publicId+' POST');
    check(body.model,item.model,item.publicId+' exact wire identity');
    const old=prior.items.find(entry=>entry.publicId===item.publicId)!;
    reject(()=>buildVideoCreate({...ctx,profile:old.profile as any,provider:{...ctx.provider,videoProfile:old.profile as any}}),item.publicId+' baseline v2 rejects multimodal input');
    if(item.profile==='apib-video-v3'){
      if(item.model==='kling-v3-omni'){
        check(body.video_list,[{video_url:req.references[0].url,refer_type:'feature',keep_original_sound:'no'}],'Kling feature video never becomes base edit');check('audio' in body,false,'Kling video reference omits conflicting audio flag');
      }else{
        check(body.video_urls,[req.references[1].url],item.publicId+' video URL preserved');check(body.audio_urls,[req.references[2].url],item.publicId+' audio URL preserved');
        if(item.model.startsWith('wan3.'))check(body.image_with_roles,[{url:req.references[0].url,role:'reference_image'}],item.publicId+' explicit reference family');
        else check(body.image_urls,[req.references[0].url],item.publicId+' image order preserved');
      }
    }else if(item.profile==='geek-wan3-v3'){
      check(body.mode,'all-reference','Geek Wan explicit all-reference');check(body.images,[req.references[0].url],'Geek Wan image remains reference');
      check(body.metadata,{reference_video_urls:[req.references[1].url],reference_audio_urls:[req.references[2].url]},'Geek Wan media metadata fields');
    }else{
      check(wire.path,'/v1/videos','Geek H3 public gateway, not internal v2 route');
      check(body.content,[{type:'text',text:req.prompt+'\n\n引用素材对应关系（仅说明本次输入，不改写正文）：\n图片1 = <Picture 1>\n视频1 = <Video 1>\n音频1 = <Audio 1>'},...req.references.map(r=>({type:r.kind+'_url',[r.kind+'_url']:{url:r.url},role:'reference_'+r.kind}))],'Geek H3 original media order and roles');
      check(body.ratio,req.aspectRatio,'Geek H3 concrete ratio retained');
    }
    const text=context(item,request(item,'text',[]));check(buildVideoCreate(text).method,'POST',item.publicId+' text positive control');
    for(const mode of ['single_image','frames_required','first_optional'] as const)if(item.definition.modes?.includes(mode)){
      const refs=mode==='single_image'?[ref('image',1,'first_frame')]:mode==='frames_required'?[ref('image',1,'first_frame'),ref('image',2,'last_frame')]:[ref('image',1,'last_frame')];
      check(buildVideoCreate(context(item,request(item,mode,refs))).method,'POST',item.publicId+' '+mode+' existing path remains');
      reject(()=>buildVideoCreate(context(item,request(item,mode,[...refs,ref('audio')]))),item.publicId+' frame/audio mutual exclusion');
    }
    for(const patch of [{mode:'text',references:req.references},{providerOptions:{arbitrary:true}},{negativePrompt:'not silently dropped'},{references:[{...ref('video'),durationSeconds:undefined}]},{references:[{...ref('image'),role:'element'},ref('video')]},{references:[{...ref('image'),url:'file:///test.png'},ref('video')]}])reject(()=>buildVideoCreate({...ctx,request:{...req,...patch} as VideoGenerationRequest}),item.publicId+' bad payload '+JSON.stringify(patch).slice(0,65));
    const max=item.definition.limits!.videos!;
    reject(()=>buildVideoCreate({...ctx,request:{...req,references:Array.from({length:max+1},(_,i)=>ref('video',i+1))}}),item.publicId+' exact video count limit');
  }
  const find=(id:string)=>MULTIMODAL_VIDEO_FAMILIES.find(item=>item.publicId===id)!;
  const seed=find('video-apib-seedance-2-0'),s25=find('video-apib-seedance-2-5'),wan=find('video-apib-wan3-0-video'),kling=find('video-apib-kling-v3-omni'),h3=find('video-geek-minimax-h3');
  for(const item of [seed,find('video-apib-minimax-h3'),find('video-apib-minimax-h3-max'),h3])reject(()=>buildVideoCreate(context(item,request(item,'reference',[ref('audio')]))),item.publicId+' audio requires visual');
  check((buildVideoCreate(context(s25,request(s25,'reference',[ref('audio')]))).body as any).audio_urls,[ref('audio').url],'Seedance 2.5 supports audio-only');
  reject(()=>buildVideoCreate(context(s25,request(s25,'reference',[{...ref('video'),durationSeconds:1}]))),'Seedance 2.5 min clip duration');
  reject(()=>buildVideoCreate(context(seed,request(seed,'reference',[{...ref('video'),durationSeconds:1.8}]))),'Seedance 2.0 min total video duration');
  reject(()=>buildVideoCreate(context(seed,request(seed,'reference',[{...ref('video'),durationSeconds:15.2}]))),'Seedance 2.0 exclusive maximum video duration');
  check((buildVideoCreate(context(seed,request(seed,'reference',[{...ref('video'),durationSeconds:15.1}]))).body as any).video_urls,[ref('video').url],'Seedance 2.0 documented fractional video boundary retained');
  reject(()=>buildVideoCreate(context(wan,{...request(wan,'reference',[{...ref('video'),durationSeconds:15}]),durationSeconds:16})),'Wan input plus output <=30s');
  reject(()=>buildVideoCreate(context(kling,request(kling,'reference',[ref('image'),ref('video')]))),'Kling cannot silently convert reference image to first frame');
  check((buildVideoCreate(context(kling,request(kling,'reference',[ref('image',1,'first_frame'),ref('video')]))).body as any).image_with_roles,[{url:ref('image').url,role:'first_frame'}],'Kling explicit first frame with feature video');
  const frameRefs=[ref('image',1,'first_frame'),ref('video',1,'source_video')],frameInputs:OrderedInput[]=frameRefs.map(r=>({id:r.id,nodeId:r.id,kind:r.kind,role:r.role,value:r.url!}));
  const frameCap={...kling.definition,sources:{}},frameConfig:VideoNodeConfig={mode:'single_image',prompt:'Preserve first frame',modelId:kling.publicId,providerId:'managed-video'};
  const frameModel={modelId:kling.publicId,providerId:'managed-video',definition:frameCap} as VideoCatalogModel;
  for(const draft of [attachVideoInputs(frameConfig,frameInputs,frameCap),selectVideoIntent({...frameConfig,mode:'reference'},frameInputs,frameModel,'omni_reference')]){
    const preserved=frameRefs.map((r,index)=>({...r,role:draft.inputs[index].role as VideoReference['role']}));
    check((buildVideoCreate(context(kling,request(kling,'reference',preserved))).body as any).image_with_roles,[{url:ref('image').url,role:'first_frame'}],'real UI selection preserves Kling first-frame wire');
  }
  reject(()=>buildVideoCreate(context(kling,request(kling,'reference',[ref('audio')]))),'Kling no independent audio');
  reject(()=>buildVideoCreate(context(h3,request(h3,'reference',[...Array.from({length:9},(_,i)=>ref('image',i+1)),...Array.from({length:3},(_,i)=>ref('video',i+1)),ref('audio')]))),'Geek H3 total media max12');
  const ordered=[ref('audio'),ref('image'),ref('video')];check(((buildVideoCreate(context(h3,request(h3,'reference',ordered))).body as any).content as any[]).slice(1).map(x=>x.type),['audio_url','image_url','video_url'],'cross-kind media order retained');
  for(const item of MULTIMODAL_VIDEO_FAMILIES.filter(item=>item.providerId==='apib-video')){
    reject(()=>buildVideoCreate(context(item,request(item,'reference',[{...ref('video'),mimeType:'video/webm'}]))),item.publicId+' rejects documented unsupported WebM before HTTP');
    if(item.model!=='kling-v3-omni')for(const mimeType of ['audio/mp4','audio/aac','audio/ogg','audio/flac',''])
      reject(()=>buildVideoCreate(context(item,request(item,'reference',[ref('image'),{...ref('audio'),mimeType}]))),item.publicId+' rejects unsupported audio '+mimeType);
  }
  check((buildVideoCreate(context(h3,request(h3,'reference',[ref('image'),{...ref('audio'),mimeType:'audio/mp4'}]))).body as any).content[2].type,'audio_url','Geek H3 independently supports verified M4A');
  reject(()=>buildVideoCreate(context(h3,request(h3,'reference',[ref('image'),{...ref('audio'),mimeType:'audio/flac'}]))),'Geek H3 rejects FLAC before HTTP');
  const literal='招牌上原样写“图片1 与 视频1”，不要更换文字。';const literalWire=buildVideoCreate(context(h3,{...request(h3,'reference',ordered),prompt:literal})).body as any;
  check(literalWire.content[0].text.startsWith(literal+'\n\n'),true,'literal prompt and quoted labels remain unchanged');
  check(literalWire.content[0].text.includes('音频1 = <Audio 1>\n图片1 = <Picture 1>\n视频1 = <Video 1>'),true,'only actual ordered references receive native token descriptions');
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url!,'http://fixture');res.setHeader('content-type','application/json');
      if(req.method==='POST'){
        posts++;const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const body=JSON.parse(Buffer.concat(chunks).toString());assert.ok(req.headers['idempotency-key']);
        const item=MULTIMODAL_VIDEO_FAMILIES.find(e=>e.model===body.model&&req.headers['x-no-such-header']===undefined);
        assert.ok(item);const id='fixture-'+posts;
        return res.end(JSON.stringify(url.pathname.endsWith('/generations')?{data:[{task_id:id,status:'queued'}]}:{id,status:'queued'}));
      }
      if(url.pathname==='/result.mp4'){res.setHeader('content-type','video/mp4');return res.end(Buffer.from('fixture-video-body'));}
      polls++;const result=`http://127.0.0.1:${(server.address() as any).port}/result.mp4`;
      if(url.pathname.startsWith('/v1/tasks/'))return res.end(JSON.stringify({data:{status:'completed',result:{videos:[{url:[result]}]}}}));
      return res.end(JSON.stringify({status:'completed',video_url:result,output:{task_status:'SUCCEEDED',video_url:result},task:{status:'completed',content:{url:result}}}));
    }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${(server.address() as any).port}`;process.env.MODEL_CONFIG_TRUSTED_ORIGINS=origin;
  try{
    const {createWireVideoAdapter}=await import('../src/lib/video/providers/wire-adapter'),{runPrivateVideoProvider}=await import('../src/lib/video/providers/private-context');
    for(const item of MULTIMODAL_VIDEO_FAMILIES){
      const req=request(item,'reference',references(item)),cfg={...context(item,req).provider,baseUrl:origin},scope={config:cfg,manifest:{} as any};
      await runPrivateVideoProvider(scope,async()=>{
        const api=createWireVideoAdapter(cfg),created=await api.create(req);check(created.status,'queued',item.publicId+' real HTTP receipt');
        const snapshot:VideoTaskSnapshot={id:req.idempotencyKey,email:'fixture@example.test',providerId:item.providerId,modelId:item.model,upstreamTaskId:created.upstreamTaskId,prompt:req.prompt,parameters:{durationSeconds:req.durationSeconds,resolution:req.resolution},references:req.references};
        const frozen=JSON.stringify(snapshot),before=posts;
        const recovered=createWireVideoAdapter(cfg),result=await recovered.poll(JSON.parse(frozen));check(result.status,'completed',item.publicId+' recreated adapter polls original task');
        await recovered.poll(JSON.parse(frozen));check(posts,before,item.publicId+' recovered receipt does not POST again');
        check(JSON.stringify(snapshot),frozen,item.publicId+' frozen snapshot unchanged');
        const received=await recovered.fetchResult(snapshot,result);check(Buffer.from(received.bytes!).toString(),'fixture-video-body',item.publicId+' loopback delivery');
        await assert.rejects(()=>api.create({...req,mode:'text'}),VideoContractError);check(posts,before,item.publicId+' invalid input rejected before HTTP');
      });
    }
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
  check(posts,11,'one local create per explicit exact model');check(polls,22,'two original-task polls per model');
  writeFileSync(path.join(out,'MULTIMODAL_WIRE.json'),JSON.stringify({checks,posts,polls,realSupplierCalls:0,legacyHashes,results,evidenceTier:'actual wire codecs and HTTP adapter; supplied media metadata/local server; not live-provider or DB lifecycle acceptance'},null,2));
  console.log(`VIDEO_MULTIMODAL_V3=PASS MODELS=11 CHECKS=${checks} LOCAL_POSTS=${posts} POLLS=${polls} RECOVERY_REPOSTS=0 LEGACY_FILES_UNCHANGED=4 REAL_SUPPLIER_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
