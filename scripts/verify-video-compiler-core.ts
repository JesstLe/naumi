import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileVideoRequest,readCompiledVideoPlan} from '../src/lib/video/compile';
import {resolveVideoDraft,type VideoInputResolverPorts} from '../src/lib/video/input-resolver';
import {materializeJsonVideoPlan} from '../src/lib/video/profiles/json-materialization';
import {deriveVideoIntent} from '../src/lib/video/intent';
import {createJsonVideoProfile} from '../src/lib/video/profiles/json-profile';
import {emptyVideoExecutionPolicy,videoExecutionPolicySchema,videoCapabilityEvidenceSchema,videoModelBindingSchema,videoDiagnostic,
 type PublishedVideoModelBinding,type ResolvedVideoDraft,type ResolvedVideoAsset,type VideoExecutionPolicy,type VideoModelProfile,type CompiledVideoPlan,type VideoResult} from '../src/lib/video/execution-contract';

const cases:string[]=[];
async function test(name:string,run:()=>unknown|Promise<unknown>){await run();cases.push(name);}
const clone=<T>(x:T):T=>structuredClone(x);
const profile=createJsonVideoProfile('apib-video-v2',1);
function recipe():any{return {createPath:'/v1/videos/generations',modelField:'model',promptField:'prompt',defaults:{ordinaryImage:'single_image',sourceVideo:'reference'},parameters:{
 durationSeconds:{type:'integer',wireField:'duration',required:true,minimum:1,maximum:15,default:4},
 resolution:{type:'string',wireField:'resolution',required:true,values:['480p','720p','1080p','4K'],default:'720p',mapping:{'480p':'480p','720p':'720p','1080p':'1080p','4K':'2K'}},
 aspectRatio:{type:'string',wireField:'size',default:'16:9'},generateAudio:{type:'boolean',wireField:'audio'},
 seed:{type:'integer',wireField:'seed'},watermark:{type:'boolean',send:'omit'},
 },operations:[
 {intent:'text',requiresPrompt:true,media:[]},
 {intent:'single_image',images:{min:1,max:1,maxBytes:2000},media:[{kind:'image',wireField:'image_with_roles',shape:'roles',roleMap:{first_frame:'first_frame'}}]},
 {intent:'frames_required',images:{min:2,max:2},media:[{kind:'image',wireField:'image_with_roles',shape:'roles'}]},
 {intent:'first_optional',images:{min:1,max:1},media:[{kind:'image',roles:['last_frame'],wireField:'last_frame_image',shape:'single'}]},
 {intent:'reference',images:{max:9},videos:{max:3,maxDurationSeconds:10,totalDurationSeconds:15},audios:{max:2},media:[
 {kind:'image',wireField:'image_with_roles',shape:'roles',roleMap:{reference:'reference_image'}},
 {kind:'video',wireField:'video_urls',shape:'urls'}, {kind:'audio',wireField:'audio_urls',shape:'urls'}]},
 ]};}
function binding():PublishedVideoModelBinding{return {publicModelId:'public-video',wireModel:'seedance-2.0-fast',connectionId:'test-local',revision:7,profileId:profile.profileId,profileVersion:1,recipe:recipe()};}
function draft():ResolvedVideoDraft{return {scope:{actorId:'actor',projectKey:'project'},prompt:'镜头缓慢推进',parameters:{durationSeconds:4,resolution:'720p'},inputs:[]};}
function asset(kind:'image'|'video'|'audio'='image'):ResolvedVideoAsset{return {artworkId:kind+'-art',storageKey:'owned/'+kind+'.bin',sha256:'a'.repeat(64),bytes:1000,mimeType:kind==='image'?'image/png':kind==='video'?'video/mp4':'audio/wav',...(kind==='image'?{width:1024,height:1024}:{durationSeconds:4})};}
function media(id='image1',kind:'image'|'video'|'audio'='image',role:any='reference'):any{return {id,nodeId:id,kind,role,asset:asset(kind)};}
function compiled(d=draft(),b=binding(),p=emptyVideoExecutionPolicy(),selected=profile){return compileVideoRequest({profile:selected,binding:b,policy:p,draft:d});}
function success(result:VideoResult<CompiledVideoPlan>):CompiledVideoPlan {assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)throw Error('failed');return result.value;}
function failure(result:VideoResult<unknown>,code:string){assert.equal(result.ok,false);if(!result.ok)assert.equal(result.diagnostics[0].code,code);}
function policy(r:VideoExecutionPolicy['restrictions']):VideoExecutionPolicy{return {kind:'video.execution-policy',revision:2,restrictions:r,audit:{actor:'admin',reason:'explicit action',changedAt:'2026-11-14T00:00:00.000Z'}};}
async function main(){
 await test('NO_MODEL_ALLOWLIST',()=>{const b=binding();b.wireModel='tomorrows-unlisted-model';assert.equal((success(compiled(draft(),b)).wireTemplate.body as any).model,b.wireModel);});
 await test('TEXT_REQUEST_BODY',()=>{const plan=success(compiled());assert.deepEqual(plan.wireTemplate,{method:'POST',path:'/v1/videos/generations',encoding:'json',body:{model:'seedance-2.0-fast',prompt:'镜头缓慢推进',duration:4,resolution:'720p',size:'16:9'}});});
 await test('SINGLE_IMAGE_ACTUAL_TEMPLATE',()=>{const d=draft();d.inputs=[media()];const plan=success(compiled(d));assert.equal(plan.intent,'single_image');assert.deepEqual((plan.wireTemplate.body as any).image_with_roles,[{url:{$videoAsset:'image1'},role:'first_frame'}]);});
 await test('STALE_TEXT_IMAGE_AUTO',()=>{const d=draft();d.legacyMode='text';d.inputs=[media()];assert.equal(success(compiled(d)).intent,'single_image');});
 await test('TWO_NORMAL_IMAGES_NOT_FRAMES',()=>{const d=draft();d.inputs=[media('a'),media('b')];const plan=success(compiled(d));assert.equal(plan.intent,'reference');assert.equal((plan.wireTemplate.body as any).image_with_roles[0].role,'reference_image');});
 await test('EXPLICIT_FRAME_PAIR',()=>{const d=draft();d.inputs=[media('a','image','first_frame'),media('b','image','last_frame')];assert.equal(success(compiled(d)).intent,'frames_required');});
 await test('EXPLICIT_FRAMES_DO_NOT_REWRITE_NORMAL_ROLES',()=>{const d=draft();d.intentPreference='frames_required';d.inputs=[media('a'),media('b')];failure(compiled(d),'FRAME_INPUT_REQUIRED');assert.equal(d.inputs[0].role,'reference');});
 await test('LAST_FRAME_ONLY',()=>{const d=draft();d.inputs=[media('last','image','last_frame')];assert.equal(success(compiled(d)).intent,'first_optional');});
 await test('VIDEO_DEFAULT_IS_CONTRACT_VALUE',()=>{const d=draft();d.inputs=[media('v','video','source_video')];assert.equal(success(compiled(d)).intent,'reference');});
 await test('VIDEO_AMBIGUITY_NEEDS_INTENT',()=>{const d=draft();d.inputs=[media('v','video','source_video')];const b=binding();(b.recipe as any).defaults={ordinaryImage:'single_image'};failure(compiled(d,b),'INPUT_INTENT_AMBIGUOUS');});
 await test('ONE_IMAGE_NO_DEFAULT_NO_GUESS',()=>{const d=draft();d.inputs=[media()];const b=binding();(b.recipe as any).defaults={};failure(compiled(d,b),'INPUT_INTENT_AMBIGUOUS');});
 await test('AUDIO_REFERENCE',()=>{const d=draft();d.inputs=[media('sound','audio','source_audio')];assert.deepEqual((success(compiled(d)).wireTemplate.body as any).audio_urls,[{$videoAsset:'sound'}]);});
 await test('ALL_MEDIA_KEPT',()=>{const d=draft();d.inputs=[media('a'),media('v','video','source_video'),media('s','audio','source_audio')];assert.equal(success(compiled(d)).inputManifest.length,3);});
 await test('IMAGE_PREFERENCE_REJECTS_VIDEO',()=>{const d=draft();d.inputs=[media('v','video','source_video')];d.intentPreference='image_reference';failure(compiled(d),'IMAGE_PREFERENCE_HAS_OTHER_MEDIA');});
 await test('STRUCTURAL_LEGACY_PREFERENCE_PRESERVED',()=>{const d=draft();d.legacyMode='extend';d.inputs=[media('v','video','source_video')];failure(compiled(d),'INPUT_INTENT_NOT_MAPPABLE');});
 await test('NO_FALLBACK_FOR_UNMAPPED_FIELDS',()=>{const d=draft();d.parameters.newOption='keep me';failure(compiled(d),'PARAMETER_MAPPING_MISSING');assert.equal(d.parameters.newOption,'keep me');});
 await test('MAPPING_EXACTLY_ONCE',()=>{const d=draft();d.parameters.resolution='4K';const b=binding();(b.recipe as any).parameters.resolution.mapping['2K']='1K';const plan=success(compiled(d,b));assert.equal(plan.requestedParameters.resolution,'4K');assert.equal(plan.effectiveParameters.resolution,'2K');assert.equal(plan.billingFacts.resolution,'2K');assert.equal((plan.wireTemplate.body as any).resolution,'2K');});
 await test('WIRE_SPELLING_IS_NOT_BILLING_SEMANTICS',()=>{const b=binding();(b.recipe as any).parameters.resolution.wireField='mode';(b.recipe as any).parameters.resolution.wireMapping={'720p':'std'};const plan=success(compiled(draft(),b));assert.equal((plan.wireTemplate.body as any).mode,'std');assert.equal(plan.billingFacts.resolution,'720p');});
 await test('ZERO_AND_FALSE_PRESERVED',()=>{const d=draft();d.parameters.seed=0;d.parameters.generateAudio=false;const body=success(compiled(d)).wireTemplate.body as any;assert.equal(body.seed,0);assert.equal(body.audio,false);});
 await test('SEND_OMIT_EXPLICIT',()=>{const d=draft();d.parameters.watermark=false;const plan=success(compiled(d));assert.equal((plan.wireTemplate.body as any).watermark,undefined);assert.equal(plan.requestedParameters.watermark,false);});
 await test('BAD_PARAMETER_TYPE',()=>{const d=draft();d.parameters.durationSeconds='4';failure(compiled(d),'PARAMETER_VALUE_INVALID');});
 await test('REAL_DURATION_LIMIT',()=>{const d=draft();d.parameters.durationSeconds=20;failure(compiled(d),'PARAMETER_VALUE_INVALID');});
 await test('REAL_MEDIA_BYTES_LIMIT',()=>{const d=draft();const input=media();input.asset.bytes=3000;d.inputs=[input];failure(compiled(d),'MEDIA_PROPERTIES_OUT_OF_RANGE');});
 await test('REAL_MEDIA_COUNT_LIMIT',()=>{const d=draft();d.intentPreference='single_image';d.inputs=[media('a'),media('b')];failure(compiled(d),'MEDIA_COUNT_OUT_OF_RANGE');});
 await test('REAL_MEDIA_DURATION_LIMIT',()=>{const d=draft();const input=media('v','video');input.asset.durationSeconds=11;d.inputs=[input];failure(compiled(d),'MEDIA_PROPERTIES_OUT_OF_RANGE');});
 await test('REAL_TOTAL_DURATION_LIMIT',()=>{const d=draft();const a=media('a','video'),b=media('b','video');a.asset.durationSeconds=8;b.asset.durationSeconds=8;d.inputs=[a,b];failure(compiled(d),'MEDIA_TOTAL_DURATION_OUT_OF_RANGE');});
 await test('UNKNOWN_MEDIA_KIND_NOT_SILENTLY_DROPPED',()=>{const d=draft();d.inputs=[media('s','audio')];const b=binding();delete (b.recipe as any).operations[4].audios;(b.recipe as any).operations[4].media=(b.recipe as any).operations[4].media.filter((m:any)=>m.kind!=='audio');failure(compiled(d,b),'INPUT_KIND_NOT_MAPPABLE');});
 await test('UNMAPPED_ROLE_NOT_DROPPED',()=>{const d=draft();d.inputs=[media()];const b=binding();(b.recipe as any).operations[1].media[0].roles=['last_frame'];failure(compiled(d,b),'INPUT_ROLE_NOT_MAPPABLE');});
 await test('DUPLICATE_MAPPINGS_REJECTED',()=>{const d=draft();d.inputs=[media()];const b=binding();(b.recipe as any).operations[1].media.push({...clone((b.recipe as any).operations[1].media[0]),wireField:'duplicate'});failure(compiled(d,b),'DUPLICATE_MEDIA_MAPPING');});
 await test('WIRE_FIELDS_CANNOT_COLLIDE',()=>{const b=binding();(b.recipe as any).parameters.resolution.wireField='duration';failure(compiled(draft(),b),'WIRE_FIELD_COLLISION');});
 await test('BAD_PROTOCOL_RECIPE',()=>{const b=binding();b.recipe={};failure(compiled(draft(),b),'PROFILE_MAPPING_MISSING');});
 await test('UNKNOWN_PROFILE_VERSION',()=>{const b=binding();b.profileVersion=2;failure(compiled(draft(),b),'PROFILE_VERSION_MISMATCH');});
 await test('POLICY_EMPTY_NO_LEGACY_IMPORT',()=>{assert.deepEqual(emptyVideoExecutionPolicy().restrictions,{});assert.equal(videoExecutionPolicySchema.safeParse({modes:['text'],limits:{images:0}}).success,false);});
 await test('POLICY_REQUIRES_SOURCE',()=>{assert.equal(videoExecutionPolicySchema.safeParse({kind:'video.execution-policy',revision:0,restrictions:{mediaMaximum:{image:0}}}).success,false);});
 await test('EXPLICIT_POLICY_ZERO_NOT_UNKNOWN',()=>{const d=draft();d.inputs=[media()];failure(compiled(d,binding(),policy({mediaMaximum:{image:0}})),'POLICY_MEDIA_LIMIT');});
 await test('EXPLICIT_POLICY_DISABLE',()=>failure(compiled(draft(),binding(),policy({disabled:true})),'EXECUTION_POLICY_DISABLED'));
 await test('EXPLICIT_POLICY_MODE',()=>{const d=draft();d.inputs=[media()];failure(compiled(d,binding(),policy({deniedIntents:['single_image']})),'EXECUTION_POLICY_DISABLED');});
 await test('EVIDENCE_NOT_REQUIRED',()=>{assert.ok(compiled().ok);assert.equal(videoCapabilityEvidenceSchema.safeParse({kind:'smoke-tested'}).success,false);});
 await test('LEGACY_DESCRIPTION_CANNOT_ENTER_BINDING',()=>{assert.equal(videoModelBindingSchema.safeParse({...binding(),capabilities:{video:{modes:['text'],limits:{images:0}}}}).success,false);});
 await test('PLAN_FREEZES_BINDING_POLICY',()=>{const b=binding(),p=policy({disabled:false}),plan=success(compiled(draft(),b,p));assert.deepEqual(plan.binding,b);assert.deepEqual(plan.policy,p);assert.equal(Object.isFrozen(plan.binding.recipe),true);(b.recipe as any).createPath='/changed';assert.notEqual((plan.binding.recipe as any).createPath,'/changed');});
 await test('PREVIEW_EQUALS_SUBMISSION',()=>{const a=success(compiled()),b=success(compiled());assert.deepEqual(a,b);});
 await test('SEMANTIC_PARAMETER_ORDER_DOES_NOT_CHANGE_DIGEST',()=>{const a=draft(),b=draft();b.parameters={resolution:'720p',durationSeconds:4};assert.equal(success(compiled(a)).digest,success(compiled(b)).digest);});
 await test('INPUT_ORDER_IS_SEMANTIC',()=>{const a=draft();a.inputs=[media('a'),media('b')];const b=clone(a);b.inputs.reverse();assert.notEqual(success(compiled(a)).digest,success(compiled(b)).digest);});
 await test('ACTOR_AND_PROJECT_BOUND_DIGEST',()=>{const b=draft();b.scope.projectKey='other';assert.notEqual(success(compiled()).digest,success(compiled(b)).digest);});
 await test('PLAN_READER_NO_PROFILE_OR_CURRENT_CONFIG',()=>{const plan=success(compiled());assert.deepEqual(readCompiledVideoPlan(JSON.parse(JSON.stringify(plan))),{ok:true,value:plan});});
 await test('PLAN_READER_REJECTS_CHANGED_BODY',()=>{const plan=clone(success(compiled()));(plan.wireTemplate.body as any).duration=10;failure(readCompiledVideoPlan(plan),'COMPILED_PLAN_DIGEST_MISMATCH');});
 await test('PLAN_READER_IDENTITY_MUST_MATCH_BINDING',()=>{const plan=clone(success(compiled()));plan.identity.connectionId='other';failure(readCompiledVideoPlan(plan),'INVALID_COMPILED_PLAN');});
 await test('PLAN_READER_KEEPS_LEGACY_SEPARATE',()=>failure(readCompiledVideoPlan({provider_snapshot:{}}),'INVALID_COMPILED_PLAN'));
 await test('PLAN_READER_UNKNOWN_VERSION',()=>failure(readCompiledVideoPlan({...success(compiled()),schemaVersion:2}),'INVALID_COMPILED_PLAN'));
 await test('PROFILE_CANNOT_MUTATE_INPUT',()=>{const broken:VideoModelProfile={...profile,compile(d){d.prompt='mutation';throw Error('unreachable');}};const d=draft();failure(compiled(d,binding(),emptyVideoExecutionPolicy(),broken),'PROFILE_COMPILE_FAILED');assert.notEqual(d.prompt,'mutation');});
 await test('PROFILE_CANNOT_DROP_INPUT',()=>{const broken:VideoModelProfile={...profile,compile(d,c,b){const r=profile.compile(d,c,b);if(r.ok)r.value.consumedInputIds=[];return r;}};const d=draft();d.inputs=[media()];failure(compiled(d,binding(),emptyVideoExecutionPolicy(),broken),'INPUT_NOT_CONSUMED');});
 await test('PROFILE_CANNOT_CLAIM_CONSUMPTION_WITHOUT_SLOT',()=>{const broken:VideoModelProfile={...profile,compile(d,c,b){const r=profile.compile(d,c,b);if(r.ok)r.value.wireTemplate.body={};return r;}};const d=draft();d.inputs=[media()];failure(compiled(d,binding(),emptyVideoExecutionPolicy(),broken),'INVALID_MEDIA_SLOT');});
 await test('PROFILE_CANNOT_INJECT_UNKNOWN_SLOT',()=>{const broken:VideoModelProfile={...profile,compile(d,c,b){const r=profile.compile(d,c,b);if(r.ok)(r.value.wireTemplate.body as any).unowned={$videoAsset:'unowned'};return r;}};failure(compiled(draft(),binding(),emptyVideoExecutionPolicy(),broken),'INVALID_MEDIA_SLOT');});
 await test('PROFILE_CANNOT_USE_TEXT_AS_MEDIA_SLOT',()=>{const d=draft();d.inputs=[{id:'t',nodeId:'inline:t',kind:'text',role:'context',text:'hello'}];const broken:VideoModelProfile={...profile,compile(d,c,b){const r=profile.compile(d,c,b);if(r.ok)(r.value.wireTemplate.body as any).image={$videoAsset:'t'};return r;}};failure(compiled(d,binding(),emptyVideoExecutionPolicy(),broken),'INVALID_MEDIA_SLOT');});

 await test('PROFILE_CANNOT_LEAK_THROW_MESSAGE',()=>{const broken={...profile,describe(){throw Error('private credential');}};const r=compiled(draft(),binding(),emptyVideoExecutionPolicy(),broken);failure(r,'PROFILE_COMPILE_FAILED');assert.ok(!JSON.stringify(r).includes('private credential'));});
 await test('EMPTY_PROMPT_REQUIRES_TEXT',()=>{const d=draft();d.prompt='';failure(compiled(d),'PROMPT_REQUIRED');});
 await test('PROMPT_REFERENCE_IDENTITY',()=>{const d=draft();d.prompt='改变 {{ref 1}}';d.inputs=[media()];assert.equal((success(compiled(d)).wireTemplate.body as any).prompt,'改变 图片1');});
 await test('INVALID_PROMPT_REFERENCE',()=>{const d=draft();d.prompt='改变 {{ref 2}}';d.inputs=[media()];failure(compiled(d),'PROMPT_REFERENCE_INVALID');});
 await test('CONTEXT_TEXT_USES_RESOLVED_CONTENT',()=>{const d=draft();d.inputs=[{id:'text',nodeId:'text:one',kind:'text',role:'context',text:'trusted text'}];assert.match((success(compiled(d)).wireTemplate.body as any).prompt,/trusted text/);});
 // Resolver application ports: prove access failures and real media metadata
 // are consumed, rather than asserting that fixture records prove production DB.
 const raw=()=>({prompt:'video',parameters:{durationSeconds:4,resolution:'720p'},inputs:[{id:'image1',nodeId:'artwork',kind:'image',role:'reference',value:'https://untrusted.invalid/signed?token=not-frozen'}]});
 const ports=():VideoInputResolverPorts=>({scope:{actorId:'actor',projectKey:'project'},media:async()=>({ok:true,value:asset()}),text:async()=>({ok:true,value:'owned text'})});
 await test('RESOLVER_IGNORES_USER_URL',async()=>{const r=await resolveVideoDraft(raw(),ports());assert.ok(r.ok);if(r.ok){assert.ok(!JSON.stringify(r.value).includes('untrusted'));assert.equal(success(compiled(r.value)).inputManifest[0].nodeId,'artwork');}});
 await test('RESOLVER_PRESERVES_READY_ASSET_SCOPE',async()=>{const r=await resolveVideoDraft(raw(),ports());assert.ok(r.ok);if(r.ok)assert.deepEqual(r.value.scope,{actorId:'actor',projectKey:'project'});});
 await test('RESOLVER_ACCESS_DENIED_PROPAGATES',async()=>{const p=ports();p.media=async()=>({ok:false,diagnostics:[videoDiagnostic('input','ASSET_FORBIDDEN','inputs','no access','choose owned asset')]});failure(await resolveVideoDraft(raw(),p),'ASSET_FORBIDDEN');});
 await test('RESOLVER_PENDING_NOT_FAKE_COMPLETED',async()=>{const p=ports();p.media=async()=>({ok:false,diagnostics:[videoDiagnostic('dependency','DEPENDENCY_PENDING','inputs','not ready','wait')]});failure(await resolveVideoDraft(raw(),p),'DEPENDENCY_PENDING');});
 await test('RESOLVER_DUPLICATE_IDS_BEFORE_IO',async()=>{const p=ports();let calls=0;p.media=async()=>{calls++;return {ok:true,value:asset()};};const r=raw();r.inputs.push({...r.inputs[0]});failure(await resolveVideoDraft(r,p),'DUPLICATE_INPUT');assert.equal(calls,0);});
 await test('RESOLVER_BAD_ROLE_BEFORE_IO',async()=>{const p=ports();let calls=0;p.media=async()=>{calls++;return {ok:true,value:asset()};};const r=raw();r.inputs[0].kind='video';r.inputs[0].role='first_frame';failure(await resolveVideoDraft(r,p),'INPUT_ROLE_MISMATCH');assert.equal(calls,0);});
 await test('RESOLVER_BAD_SCOPE_BEFORE_IO',async()=>{const p=ports();p.scope.actorId='';let calls=0;p.media=async()=>{calls++;return {ok:true,value:asset()};};failure(await resolveVideoDraft(raw(),p),'INVALID_VIDEO_SCOPE');assert.equal(calls,0);});
 await test('RESOLVER_MIME_MUST_MATCH_KIND',async()=>{const p=ports();p.media=async()=>({ok:true,value:asset('video')});failure(await resolveVideoDraft(raw(),p),'INVALID_MEDIA_FACTS');});
 await test('RESOLVER_VIDEO_NEEDS_DURATION',async()=>{const p=ports();const a=asset('video');delete a.durationSeconds;p.media=async()=>({ok:true,value:a});const r=raw();r.inputs[0].kind='video';failure(await resolveVideoDraft(r,p),'INVALID_MEDIA_FACTS');});
 await test('RESOLVER_LINKED_TEXT_IS_NOT_CLIENT_TEXT',async()=>{const r=raw();r.inputs=[{id:'t',nodeId:'text:linked',kind:'text',role:'context',value:'forged'}];const result=await resolveVideoDraft(r,ports());assert.ok(result.ok);if(result.ok)assert.equal((result.value.inputs[0] as any).text,'owned text');});
 await test('RESOLVER_INLINE_TEXT_IS_USER_INPUT',async()=>{const r=raw();r.inputs=[{id:'t',nodeId:'inline:one',kind:'text',role:'context',value:'user text'}];const p=ports();let calls=0;p.text=async()=>{calls++;return {ok:true,value:'wrong'};};const result=await resolveVideoDraft(r,p);assert.ok(result.ok);if(result.ok)assert.equal((result.value.inputs[0] as any).text,'user text');assert.equal(calls,0);});
 await test('RESOLVER_CONFLICTING_VERSIONS_REJECTED',async()=>{const r:any=raw();r.inputs.push({...r.inputs[0],id:'other'});const p=ports();let count=0;p.media=async()=>({ok:true,value:{...asset(),sha256:count++?'b'.repeat(64):'a'.repeat(64)}});failure(await resolveVideoDraft(r,p),'INVALID_RESOLVED_DRAFT');});
 await test('RESOLVER_DOES_NOT_MUTATE_DRAFT',async()=>{const r=raw(),before=clone(r);await resolveVideoDraft(r,ports());assert.deepEqual(r,before);});
 await test('RESOLVED_MANIFEST_DIRECT_MIME_CONTRADICTION_REJECTED',()=>{const d=draft();const a=media();a.asset.mimeType='video/mp4';d.inputs=[a];failure(compiled(d),'INVALID_COMPILE_INPUT');});
 await test('PROFILE_HAS_NO_LEGACY_GATE_IMPORTS',()=>{for(const file of ['compile.ts','execution-contract.ts','input-resolver.ts','intent.ts','profiles/json-profile.ts']){const code=fs.readFileSync('src/lib/video/'+file,'utf8');assert.ok(!/normalizeVideoInput\s*\(|resolveVideoCapability\s*\(|verified\s*===|fallbackCapability\s*\(/.test(code),file);}});

 await test('MATERIALIZE_EXACT_API_REQUEST_WITH_FRESH_URL',async()=>{const d=draft();d.inputs=[media()];const plan=success(compiled(d));let calls=0;const result=await materializeJsonVideoPlan(plan,{url:async(scope,asset)=>{calls++;assert.deepEqual(scope,d.scope);return {ok:true,value:{asset,url:'https://fixture.invalid/asset?temporary=1'}};}});assert.ok(result.ok);if(result.ok)assert.deepEqual((result.value.body as any).image_with_roles,[{url:'https://fixture.invalid/asset?temporary=1',role:'first_frame'}]);assert.equal(calls,1);assert.ok(!JSON.stringify(plan).includes('temporary'));});
 await test('MATERIALIZE_DUPLICATE_ASSET_SIGNED_ONCE',async()=>{const d=draft();d.inputs=[media('a'),media('b')];const plan=success(compiled(d));let calls=0;const result=await materializeJsonVideoPlan(plan,{url:async(_scope,asset)=>{calls++;return {ok:true,value:{asset,url:'https://fixture.invalid/image'}};}});assert.ok(result.ok);assert.equal(calls,1);});
 await test('MATERIALIZE_NEW_URL_SAME_PLAN_NO_RECOMPILE',async()=>{const d=draft();d.inputs=[media()];const plan=success(compiled(d));const a=await materializeJsonVideoPlan(plan,{url:async(_scope,asset)=>({ok:true,value:{asset,url:'https://fixture.invalid/image?t=old'}})}),b=await materializeJsonVideoPlan(plan,{url:async(_scope,asset)=>({ok:true,value:{asset,url:'https://fixture.invalid/image?t=new'}})});assert.ok(a.ok&&b.ok);assert.notDeepEqual(a,b);assert.equal(plan.digest,success(compiled(d)).digest);});
 await test('MATERIALIZE_REFUSES_CHANGED_BYTES',async()=>{const d=draft();d.inputs=[media()];failure(await materializeJsonVideoPlan(success(compiled(d)),{url:async(_scope,asset)=>({ok:true,value:{asset:{...asset,bytes:asset.bytes+1},url:'https://fixture.invalid/image'}})}),'FROZEN_MEDIA_CHANGED');});
 await test('MATERIALIZE_REFUSES_CHANGED_SHA',async()=>{const d=draft();d.inputs=[media()];failure(await materializeJsonVideoPlan(success(compiled(d)),{url:async(_scope,asset)=>({ok:true,value:{asset:{...asset,sha256:'b'.repeat(64)},url:'https://fixture.invalid/image'}})}),'FROZEN_MEDIA_CHANGED');});
 await test('MATERIALIZE_ACCESS_REVOCATION_PROPAGATES',async()=>{const d=draft();d.inputs=[media()];failure(await materializeJsonVideoPlan(success(compiled(d)),{url:async()=>({ok:false,diagnostics:[videoDiagnostic('input','ASSET_FORBIDDEN','inputs','revoked','choose asset')]})}),'ASSET_FORBIDDEN');});
 await test('MATERIALIZE_INVALID_ADDRESS',async()=>{const d=draft();d.inputs=[media()];failure(await materializeJsonVideoPlan(success(compiled(d)),{url:async(_scope,asset)=>({ok:true,value:{asset,url:'file:///private'}})}),'INVALID_MEDIA_ADDRESS');});
 await test('MATERIALIZE_NO_UNNEEDED_IO_FOR_TEXT',async()=>{let calls=0;const result=await materializeJsonVideoPlan(success(compiled()),{url:async()=>{calls++;throw Error();}});assert.ok(result.ok);assert.equal(calls,0);});
 await test('MATERIALIZE_NO_IO_FOR_CORRUPT_PLAN',async()=>{let calls=0;failure(await materializeJsonVideoPlan({...success(compiled()),digest:'b'.repeat(64)},{url:async()=>{calls++;throw Error();}}),'COMPILED_PLAN_DIGEST_MISMATCH');assert.equal(calls,0);});
 await test('MATERIALIZE_PRIVATE_ERRORS_NOT_LEAKED',async()=>{const d=draft();d.inputs=[media()];const r=await materializeJsonVideoPlan(success(compiled(d)),{url:async()=>{throw Error('secret');}});failure(r,'MEDIA_MATERIALIZATION_FAILED');assert.ok(!JSON.stringify(r).includes('secret'));});

 await test('WORKBENCH_WITHOUT_PROJECT',()=>{const d=draft();d.scope.projectKey=null;assert.equal(success(compiled(d)).scope.projectKey,null);});
 await test('WORKSPACE_ID_BOUND_TO_DIGEST',()=>{const a=draft(),b=draft();a.scope.workspaceId='tenant:a';b.scope.workspaceId='tenant:b';assert.notEqual(success(compiled(a)).digest,success(compiled(b)).digest);});
 await test('OPERATION_PARAMETER_COMBINATIONS',()=>{const b=binding();(b.recipe as any).operations[0].parameterCombinations=[{durationSeconds:[4],resolution:['720p']},{durationSeconds:[8],resolution:['1080p']}];assert.ok(compiled(draft(),b).ok);const d=draft();d.parameters.durationSeconds=8;failure(compiled(d,b),'PARAMETER_COMBINATION_INVALID');d.parameters.resolution='1080p';assert.ok(compiled(d,b).ok);});
 await test('DECLARED_ROLE_MAP_IS_NOT_OPTIONAL_FALLBACK',()=>{const d=draft();d.inputs=[media('element','image','element')];failure(compiled(d),'INPUT_ROLE_NOT_MAPPABLE');});
 await test('FRAME_URL_ARRAY_ROLE_ORDER',()=>{const b=binding();(b.recipe as any).operations[2].media=[{kind:'image',wireField:'image_urls',shape:'urls',order:['first_frame','last_frame']}];const d=draft();d.inputs=[media('last','image','last_frame'),media('first','image','first_frame')];assert.deepEqual((success(compiled(d,b)).wireTemplate.body as any).image_urls,[{$videoAsset:'first'},{$videoAsset:'last'}]);assert.equal(d.inputs[0].id,'last');});
 await test('FRAME_ARRAY_REQUIRES_ORDER_MAPPING',()=>{const b=binding();(b.recipe as any).operations[2].media=[{kind:'image',wireField:'image_urls',shape:'urls'}];const d=draft();d.inputs=[media('first','image','first_frame'),media('last','image','last_frame')];failure(compiled(d,b),'FRAME_ORDER_MAPPING_MISSING');});

 await test('MISSING_LIMITS_DO_NOT_MEAN_ZERO',()=>{const d=draft();d.inputs=[media()];const b=binding();delete (b.recipe as any).operations[1].images;assert.ok(compiled(d,b).ok);});
 await test('MISSING_PROMPT_REQUIREMENT_NOT_ASSUMED',()=>{const d=draft();d.prompt='';d.inputs=[media()];assert.ok(compiled(d).ok);});
 await test('NEW_EXPLICIT_TEXT_IS_NOT_LEGACY_DEFAULT',()=>{const d=draft();d.intentPreference='text';d.inputs=[media()];failure(compiled(d),'TEXT_INTENT_HAS_MEDIA');});
 // Deterministic metamorphic coverage: independent key ordering, new models,
 // input order and reference cardinality, with no network or paid execution.
 for(let i=0;i<40;i++)await test('DETERMINISTIC_BINDING_'+i,()=>{const b=binding();b.wireModel='fixture-model-'+i;b.revision=i;const d=draft();d.parameters.durationSeconds=i%15+1;if(i%3)d.inputs=[media('r'+i)];const a=success(compiled(d,b)),c=success(compiled(clone(d),clone(b)));assert.equal(a.digest,c.digest);assert.ok(readCompiledVideoPlan(JSON.parse(JSON.stringify(a))).ok);});
 const output=process.env.VIDEO_COMPILER_EVIDENCE;if(output){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(output+'/CORE_RESULTS.json',JSON.stringify({status:'PASS',checks:cases.length,cases,productionWrites:0,paidCalls:0,actualProviderCalls:0,scope:'pure compiler/recipe + resolver fixture ports; no live route or production DB acceptance'},null,2));}
 console.log(`VIDEO_COMPILER_CORE=PASS CASES=${cases.length} PRODUCTION_WRITES=0 PAID_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
