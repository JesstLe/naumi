import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compileVideoRequest,prepareVideoDraftConstraints} from '../src/lib/video/compile';
import {createNativeVideoProfile,nativeVideoQueryMatches,type NativeVideoRecipe} from '../src/lib/video/profiles/native-profile';
import {materializeNativeVideoPlan} from '../src/lib/video/profiles/native-materialization';
import {materializeJsonVideoPlan} from '../src/lib/video/profiles/json-materialization';
import {emptyVideoExecutionPolicy,type CompiledVideoPlan,type PublishedVideoModelBinding,type ResolvedVideoDraft,type VideoResult} from '../src/lib/video/execution-contract';
import {buildOpenAICompatibleCreate} from '../src/lib/video/providers/protocols/openai-compatible';
import {buildArkCreate} from '../src/lib/video/providers/protocols/ark';
import {buildMiniMaxCreate} from '../src/lib/video/providers/protocols/minimax';
import type {VideoWireContext} from '../src/lib/video/providers/wire-contracts';

async function main(){
 let cases=0,reads=0;const check=(name:string,run:()=>void)=>{run();cases++;console.log('CASE='+name+' PASS');};
 const value=<T>(r:VideoResult<T>)=>{assert(r.ok,JSON.stringify(r));return r.value;},code=<T>(r:VideoResult<T>)=>r.ok?'OK':r.diagnostics[0].code;
 const content=new Map(['one','two','three','four','video','audio'].map(id=>[id,Buffer.from('native-owned-'+id)]));
 const media=(id:string,kind:'image'|'video'|'audio'='image',role:'reference'|'first_frame'|'last_frame'|'source_video'|'source_audio'='reference')=>({id,nodeId:id,kind,role,asset:{storageKey:id,sha256:createHash('sha256').update(content.get(id)!).digest('hex'),bytes:content.get(id)!.length,mimeType:kind==='image'?'image/png':kind==='video'?'video/mp4':'audio/wav',...(kind==='image'?{width:32,height:24}:{durationSeconds:2})}});
 const draft:ResolvedVideoDraft={scope:{actorId:'fixture',projectKey:null},prompt:'Action',legacyMode:'text',parameters:{durationSeconds:4,resolution:'4K',aspectRatio:'16:9'},inputs:[media('one')]};
 const recipe=(layout:NativeVideoRecipe['layout']):NativeVideoRecipe=>({layout,sizes:{'2K':{'16:9':[2048,1080]}},frameSchedules:{'4':{frameRate:24,numFrames:97},'19':{frameRate:16,numFrames:305}},defaults:{ordinaryImage:'single_image',sourceVideo:'reference'},parameters:{durationSeconds:{type:'integer',send:'semantic'},resolution:{type:'string',mapping:{'4K':'2K'},send:'semantic'},aspectRatio:{type:'string',send:'semantic'},...(layout==='grok2api'?{}:{seed:{type:'integer',default:0,wireField:'seed'}}),...(layout==='cogvideox3'?{generateAudio:{type:'boolean',default:false,wireField:'with_audio'}}:layout==='ark'?{generateAudio:{type:'boolean',default:false,wireField:'generate_audio'},cameraFixed:{type:'boolean',default:false,wireField:'camera_fixed'}}:{})},operations:[{intent:'text'},{intent:'single_image'},...(layout==='grok2api'?[]:[{intent:'frames_required' as const}]),{intent:'reference'}]});
 const binding=(r:NativeVideoRecipe):PublishedVideoModelBinding=>({publicModelId:'public',wireModel:'brand-new-model',connectionId:'channel',revision:2,profileId:'native-video',profileVersion:1,recipe:r});
 const compile=(r:NativeVideoRecipe,d=draft)=>compileVideoRequest({profile:createNativeVideoProfile(),binding:binding(r),policy:emptyVideoExecutionPolicy(),draft:d});
 const materialize=async(plan:CompiledVideoPlan):Promise<VideoResult<{path:string;body:unknown}>>=>plan.wireTemplate.encoding==='inline-json'?materializeNativeVideoPlan(plan,{bytes:async(_s,a)=>{reads++;return {ok:true,value:{asset:a,bytes:content.get(a.storageKey)!}};}}):materializeJsonVideoPlan(plan,{url:async(_s,a)=>{reads++;return {ok:true,value:{asset:a,url:'https://owned.example/'+a.storageKey}};}});
 const json=(x:unknown)=>JSON.parse(JSON.stringify(x));
 for(const layout of ['grok2api','cogvideox3','agnes','agnes-v25','ark','minimax','metaso'] as const){
  const r=recipe(layout),plan=value(compile(r)),actual=value(await materialize(plan));
  const references=[{id:'one',kind:'image',role:'reference',url:'https://owned.example/one',...(['grok2api','cogvideox3','agnes'].includes(layout)?{inlineData:{mimeType:'image/png',data:content.get('one')!.toString('base64')}}:{})}];
  const context={profile:layout,provider:{},request:{source:'workbench',idempotencyKey:'op',modelId:'brand-new-model',prompt:'Action',durationSeconds:4,resolution:'2K',aspectRatio:'16:9',references,providerOptions:layout==='grok2api'?{}:layout==='ark'?{seed:0,cameraFixed:false}:{seed:0},...(layout==='cogvideox3'||layout==='ark'?{generateAudio:false}:{})}} as VideoWireContext;
  const expected=layout==='ark'?buildArkCreate(context):['minimax','metaso'].includes(layout)?buildMiniMaxCreate(context):buildOpenAICompatibleCreate(context);
  check(layout+'-real-codec-single-image-exact-wire-parity',()=>{assert.deepEqual(actual.body,json(expected.body));assert.equal(actual.path,expected.path);assert.equal(plan.requestedParameters.resolution,'4K');assert.equal(plan.billingFacts.resolution,'2K');});
  check(layout+'-new-name-no-evidence-permission',()=>assert(compileVideoRequest({profile:createNativeVideoProfile(),binding:{...binding(r),wireModel:'future-unlisted'},policy:emptyVideoExecutionPolicy(),draft}).ok));
  const before=reads,raw={prompt:draft.prompt,parameters:draft.parameters,legacyMode:draft.legacyMode,inputs:draft.inputs.map(i=>({id:i.id,nodeId:i.nodeId,kind:i.kind,role:i.role}))};
  const prepared=value(prepareVideoDraftConstraints({profile:createNativeVideoProfile(),binding:binding(r),policy:emptyVideoExecutionPolicy(),draft:raw}));
  check(layout+'-pending-preparation-same-facts-no-byte-read',()=>{assert.deepEqual(prepared.billingFacts,plan.billingFacts);assert.equal(reads,before);});
  const refPlan=value(compile(r,{...draft,inputs:[media('two'),media('one')]})),refBody=value(await materialize(refPlan));
  check(layout+'-two-ordinary-reference-order-preserved',()=>{assert.equal(refPlan.intent,'reference');const body=refBody.body as any;
   if(layout==='grok2api')assert.deepEqual(body.reference_images.map((i:any)=>i.url),['two','one'].map(id=>'data:image/png;base64,'+content.get(id)!.toString('base64')));
   else if(layout==='cogvideox3')assert.deepEqual(body.image_url,['two','one'].map(id=>'data:image/png;base64,'+content.get(id)!.toString('base64')));
   else if(layout==='agnes')assert.deepEqual(body.extra_body.image,['two','one'].map(id=>'data:image/png;base64,'+content.get(id)!.toString('base64')));
   else if(layout==='agnes-v25')assert.deepEqual(body.images,['https://owned.example/two','https://owned.example/one']);
   else assert.deepEqual(body.content.slice(1).map((i:any)=>i.image_url.url),['https://owned.example/two','https://owned.example/one']);
  });
  if(layout!=='grok2api'){
   const framePlan=value(compile(r,{...draft,inputs:[media('two','image','last_frame'),media('one','image','first_frame')]})),frameBody=value(await materialize(framePlan));
   check(layout+'-explicit-frames-not-array-position',()=>{assert.equal(framePlan.intent,'frames_required');const b=frameBody.body as any;
    if(layout==='cogvideox3')assert.deepEqual(b.image_url,['one','two'].map(id=>'data:image/png;base64,'+content.get(id)!.toString('base64')));
    else if(layout==='agnes')assert.deepEqual(b.extra_body.image,['one','two'].map(id=>'data:image/png;base64,'+content.get(id)!.toString('base64')));
    else if(layout==='agnes-v25'){assert.equal(b.first_frame,'https://owned.example/one');assert.equal(b.last_frame,'https://owned.example/two');}
    else {assert.equal(b.content[1].role,'last_frame');assert.equal(b.content[2].role,'first_frame');}
    if(layout==='minimax'||layout==='metaso'){assert.equal(framePlan.requestedParameters.aspectRatio,'16:9');assert.equal(framePlan.billingFacts.aspectRatio,'adaptive');assert.equal(b.ratio,'adaptive');}
   });
  }
  check(layout+'-unknown-parameter-not-discarded',()=>assert.equal(code(compile(r,{...draft,parameters:{...draft.parameters,unknown:true}})),'PARAMETER_MAPPING_MISSING'));
  check(layout+'-explicit-policy-authoritative',()=>assert.equal(code(compileVideoRequest({profile:createNativeVideoProfile(),binding:binding(r),policy:{kind:'video.execution-policy',revision:1,restrictions:{disabled:true},audit:{actor:'admin',reason:'explicit',changedAt:'2026-11-14T00:00:00Z'}},draft})),'EXECUTION_POLICY_DISABLED'));
 }
 check('grok-tail-role-never-reinterpreted',()=>assert.equal(code(compile(recipe('grok2api'),{...draft,intentPreference:'reference',inputs:[media('one','image','last_frame')]})),'NATIVE_MEDIA_COMBINATION_INVALID'));
 check('cog-actual-two-image-limit',()=>assert.equal(code(compile(recipe('cogvideox3'),{...draft,inputs:[media('one'),media('two'),media('three')]})),'NATIVE_MEDIA_COMBINATION_INVALID'));
 check('agnes-duration-not-silently-truncated',()=>assert.equal(code(compile(recipe('agnes'),{...draft,parameters:{...draft.parameters,durationSeconds:20}})),'FRAME_SCHEDULE_NOT_MAPPABLE'));
 const nineteen=value(compile(recipe('agnes'),{...draft,parameters:{...draft.parameters,durationSeconds:19}}));check('agnes-published-exact-duration-schedule',()=>{assert.equal((nineteen.wireTemplate.body as any).num_frames,305);assert.equal((nineteen.wireTemplate.body as any).frame_rate,16);assert.equal(nineteen.billingFacts.durationSeconds,19);});
 const wrong=recipe('agnes');wrong.frameSchedules!['4']={frameRate:24,numFrames:89};check('agnes-billing-duration-mismatch-rejected',()=>assert.equal(code(compile(wrong)),'FRAME_SCHEDULE_NOT_MAPPABLE'));
 for(const layout of ['agnes-v25','minimax','metaso'] as const){check(layout+'-frames-mixed-reference-rejected',()=>assert.equal(code(compile(recipe(layout),{...draft,inputs:[media('one','image','first_frame'),media('two')]})),'NATIVE_MEDIA_COMBINATION_INVALID'));}
 check('minimax-audio-alone-rejected',()=>assert.equal(code(compile(recipe('minimax'),{...draft,inputs:[media('audio','audio')]})),'NATIVE_MEDIA_COMBINATION_INVALID'));
 for(const layout of ['agnes-v25','ark','minimax','metaso'] as const){const multi=value(compile(recipe(layout),{...draft,inputs:[media('one'),media('video','video','source_video'),media('audio','audio','source_audio')]})),body=value(await materialize(multi));check(layout+'-image-video-audio-all-consumed',()=>{assert.equal(multi.inputManifest.length,3);assert(JSON.stringify(body.body).includes('https://owned.example/video'));assert(JSON.stringify(body.body).includes('https://owned.example/audio'));});}
 const limited=recipe('ark');limited.operations.find(o=>o.intent==='reference')!.videos={min:0,maxDurationSeconds:1};check('actual-media-duration-not-metadata-permission',()=>assert.equal(code(compile(limited,{...draft,inputs:[media('video','video','source_video')]})),'MEDIA_PROPERTIES_OUT_OF_RANGE'));
 check('direct-query-pairing-explicit-no-fallback',()=>{assert(nativeVideoQueryMatches('ark',undefined,'ark','direct'));assert(nativeVideoQueryMatches('minimax',undefined,'minimax','direct'));assert(nativeVideoQueryMatches('gemini',undefined,'gemini','direct'));assert(!nativeVideoQueryMatches('ark',undefined,'ark'));assert(!nativeVideoQueryMatches('ark','ark','ark','direct'));assert(!nativeVideoQueryMatches('metaso',undefined,'metaso','direct'));});
 const bad=await materializeNativeVideoPlan(value(compile(recipe('grok2api'))),{bytes:async(_s,a)=>({ok:true,value:{asset:a,bytes:Buffer.from('wrong')}})});check('inline-data-url-changed-bytes-never-sent',()=>assert.equal(code(bad),'FROZEN_MEDIA_CHANGED'));
 console.log(`VIDEO_REFERENCE_LAYOUTS=PASS CASES=${cases} LAYOUTS=7 NETWORK=0 LEGACY_CODEC_PARITY=true`);
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
