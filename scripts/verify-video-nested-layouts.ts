import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compileVideoRequest,prepareVideoDraftConstraints} from '../src/lib/video/compile';
import {createNativeVideoProfile,nativeVideoQueryMatches,type NativeVideoRecipe} from '../src/lib/video/profiles/native-profile';
import {materializeNativeVideoPlan} from '../src/lib/video/profiles/native-materialization';
import {materializeJsonVideoPlan} from '../src/lib/video/profiles/json-materialization';
import {emptyVideoExecutionPolicy,type VideoResult,type CompiledVideoPlan,type ResolvedVideoDraft,type PublishedVideoModelBinding} from '../src/lib/video/execution-contract';
import {buildTokenDanceCreate} from '../src/lib/video/providers/protocols/tokendance';
import {buildTFRouterCreate} from '../src/lib/video/providers/protocols/tfrouter';
import {buildCompshareCreate} from '../src/lib/video/providers/protocols/compshare';
import {nestedVideoProtocol} from '../src/lib/video/profiles/nested-layouts';
import {NESTED_FIXTURE_LAYOUTS,nestedFixtureCases,nestedFixtureRecipe,type NestedFixtureCase} from './video-nested-cases';
import type {VideoWireContext} from '../src/lib/video/providers/wire-contracts';

async function main(){
 let cases=0,parity=0,reads=0;const check=(name:string,fn:()=>void)=>{fn();cases++;console.log('CASE='+name+' PASS');},value=<T>(r:VideoResult<T>)=>{assert(r.ok,JSON.stringify(r));return r.value;},code=<T>(r:VideoResult<T>)=>r.ok?'OK':r.diagnostics[0].code;
 const bytes=(id:string)=>Buffer.from('owned-nested-'+id),asset=(ref:NestedFixtureCase['refs'][number])=>({storageKey:ref.id,sha256:createHash('sha256').update(bytes(ref.id)).digest('hex'),bytes:bytes(ref.id).length,mimeType:ref.kind==='image'?'image/png':ref.kind==='video'?'video/mp4':'audio/wav',...(ref.kind==='image'?{width:32,height:24}:{durationSeconds:2})});
 const binding=(recipe:NativeVideoRecipe):PublishedVideoModelBinding=>({publicModelId:'public',wireModel:'future-nested-model',connectionId:'channel',revision:5,profileId:'native-video',profileVersion:1,recipe});
 const draft=(c:NestedFixtureCase):ResolvedVideoDraft=>({scope:{actorId:'fixture',projectKey:null},prompt:'A precise action',legacyMode:'text',intentPreference:c.intent,parameters:{durationSeconds:4,resolution:'4K',...c.parameters},inputs:c.refs.map(ref=>({...ref,nodeId:ref.id,asset:asset(ref)}))});
 const compile=(r:NativeVideoRecipe,c:NestedFixtureCase)=>compileVideoRequest({profile:createNativeVideoProfile(),binding:binding(r),policy:emptyVideoExecutionPolicy(),draft:draft(c)});
 const materialize=async(p:CompiledVideoPlan):Promise<VideoResult<{path:string;body:unknown}>>=>p.wireTemplate.encoding==='inline-json'?materializeNativeVideoPlan(p,{bytes:async(_s,a)=>{reads++;return {ok:true,value:{asset:a,bytes:bytes(a.storageKey)}};}}):materializeJsonVideoPlan(p,{url:async(_s,a)=>{reads++;return {ok:true,value:{asset:a,url:'https://owned.example/'+a.storageKey}};}});
 for(const layout of NESTED_FIXTURE_LAYOUTS){const recipe=nestedFixtureRecipe(layout);
  check(layout+'-query-protocol-exact-pair',()=>{assert(nativeVideoQueryMatches(layout,layout,nestedVideoProtocol(layout)!));assert(!nativeVideoQueryMatches(layout,layout,'openai-videos'));});
  for(const c of nestedFixtureCases(layout)){
   const plan=value(compile(recipe,c)),actual=value(await materialize(plan));
   const options:Record<string,unknown>={};for(const [name,rule]of Object.entries(recipe.parameters)){if(!Object.hasOwn(plan.effectiveParameters,name))continue;const aliases:Record<string,string>={useContextIR:'useContextIR',speech:'text',size:'size',seed:'seed'};if(aliases[name])options[aliases[name]]=plan.effectiveParameters[name];}
   const old={profile:layout,provider:{},request:{source:'workbench',modelId:'future-nested-model',idempotencyKey:'op',prompt:'A precise action',mode:c.intent,durationSeconds:4,resolution:'2K',aspectRatio:plan.effectiveParameters.aspectRatio,generateAudio:plan.effectiveParameters.generateAudio,watermark:plan.effectiveParameters.watermark,providerOptions:options,references:c.refs.map(ref=>({...ref,url:'https://owned.example/'+ref.id,...(layout==='compshare-hailuo'?{inlineData:{mimeType:'image/png',data:bytes(ref.id).toString('base64')}}:{})}))}} as VideoWireContext;
   const expected=layout.startsWith('tokendance-')?buildTokenDanceCreate(old):layout.startsWith('tfrouter-')?buildTFRouterCreate(old):buildCompshareCreate(old);
   check(layout+'-'+c.name+'-actual-codec-wire-parity',()=>{assert.equal(actual.path,expected.path);assert.deepEqual(actual.body,JSON.parse(JSON.stringify(expected.body)));assert.equal(plan.requestedParameters.resolution,'4K');assert.equal(plan.billingFacts.resolution,'2K');});parity++;
   const {scope:_scope,...raw}=draft(c);const before=reads,prepared=value(prepareVideoDraftConstraints({profile:createNativeVideoProfile(),binding:binding(recipe),policy:emptyVideoExecutionPolicy(),draft:{...raw,inputs:raw.inputs.map(i=>({id:i.id,nodeId:i.nodeId,kind:i.kind,role:i.role}))}}));check(layout+'-'+c.name+'-pending-same-facts-zero-materialization',()=>{assert.equal(reads,before);assert.deepEqual(prepared.billingFacts,plan.billingFacts);});
  }
  const c=nestedFixtureCases(layout)[0];check(layout+'-unknown-parameter-no-drop',()=>assert.equal(code(compile(recipe,{...c,parameters:{...c.parameters,unknown:1}})),'PARAMETER_MAPPING_MISSING'));
 }
 for(const layout of ['tokendance-kling-motion','compshare-vidu-extend','compshare-vidu-lip-sync'] as const){const sample=nestedFixtureCases(layout)[0],automatic={...draft(sample),intentPreference:undefined};const plan=value(compileVideoRequest({profile:createNativeVideoProfile(),binding:binding(nestedFixtureRecipe(layout)),policy:emptyVideoExecutionPolicy(),draft:automatic}));check(layout+'-automatic-intent-from-unique-wire-and-inputs',()=>assert.equal(plan.intent,sample.intent));const explicit={...automatic,intentPreference:'reference'};check(layout+'-explicit-intent-not-silently-overridden',()=>assert.equal(compileVideoRequest({profile:createNativeVideoProfile(),binding:binding(nestedFixtureRecipe(layout)),policy:emptyVideoExecutionPolicy(),draft:explicit}).ok,false));}
 const two:NestedFixtureCase={name:'two',intent:'reference',refs:[{id:'image1',kind:'image',role:'reference'},{id:'image2',kind:'image',role:'reference'}]};
 check('tfrouter-kling-second-ordinary-image-not-silently-lost',()=>assert.equal(code(compile(nestedFixtureRecipe('tfrouter-kling'),two)),'INPUT_NOT_CONSUMED'));
 const imageRecipe=nestedFixtureRecipe('tokendance-kling-image');imageRecipe.operations.push({intent:'reference'});check('tokendance-image-two-ordinary-not-invented-as-frames',()=>assert.equal(compile(imageRecipe,two).ok,false));
 const reversed:NestedFixtureCase={name:'reversed',intent:'frames_required',refs:[{id:'image2',kind:'image',role:'last_frame'},{id:'image1',kind:'image',role:'first_frame'}]},reversedPlan=value(compile(nestedFixtureRecipe('tokendance-kling-image'),reversed)),reversedBody=value(await materialize(reversedPlan));
 check('tokendance-frames-explicit-role-not-array-index',()=>{const contents=(reversedBody.body as any).contents;assert.deepEqual(contents.slice(1).map((i:any)=>[i.type,i.url]),[['first_frame','https://owned.example/image1'],['last_frame','https://owned.example/image2']]);});
 const video={id:'video',kind:'video' as const,role:'source_video' as const},audio={id:'audio',kind:'audio' as const,role:'source_audio' as const};
 check('lipsync-audio-plus-explicit-text-not-dropped',()=>assert.equal(code(compile(nestedFixtureRecipe('compshare-vidu-lip-sync'),{name:'conflict',intent:'lip_sync',refs:[video,audio],parameters:{speech:'explicit'}})),'PARAMETER_MAPPING_MISSING'));
 const h3=nestedFixtureRecipe('compshare-h3');h3.parameters.mute={type:'boolean',default:false,wireField:'mute_audio'};check('h3-inconsistent-audio-toggle-rejected',()=>assert.equal(code(compile(h3,{name:'audio',intent:'text',refs:[]})),'AUDIO_PARAMETER_CONFLICT'));
 const wan=nestedFixtureRecipe('compshare-wan');delete wan.sizes;check('wan-no-unpublished720p-size-fallback',()=>assert.equal(code(compile(wan,{name:'text',intent:'text',refs:[]})),'PARAMETER_VALUE_NOT_MAPPABLE'));
 const hailuo=nestedFixtureRecipe('compshare-hailuo');check('hailuo-tail-not-dropped',()=>assert.equal(code(compile(hailuo,{name:'tail',intent:'single_image',refs:[{id:'image2',kind:'image',role:'last_frame'}]})),'NATIVE_MEDIA_COMBINATION_INVALID'));
 const happy=nestedFixtureRecipe('tokendance-happyhorse');check('happyhorse-video-plus-image-rejected',()=>assert.equal(code(compile(happy,{name:'mixed',intent:'reference',refs:[video,two.refs[0]]})),'NATIVE_MEDIA_COMBINATION_INVALID'));
 const motion=nestedFixtureRecipe('tokendance-kling-motion');check('motion-needs-one-image-and-one-video',()=>assert.equal(code(compile(motion,{name:'bad',intent:'motion_control',refs:[two.refs[0]]})),'NATIVE_MEDIA_COMBINATION_INVALID'));
 const untyped=nestedFixtureRecipe('tfrouter-generic');untyped.parameters.unmapped={type:'boolean',default:false,wireField:'not_a_field'};check('unknown-nested-wire-field-diagnostic',()=>assert.equal(code(compile(untyped,{name:'text',intent:'text',refs:[]})),'PARAMETER_MAPPING_MISSING'));
 const omitted=nestedFixtureRecipe('compshare-hailuo');delete omitted.operations.find(o=>o.intent==='single_image')!.parameters;check('unmapped-frame-ratio-never-silently-discarded',()=>assert.equal(code(compile(omitted,nestedFixtureCases('compshare-hailuo')[1])),'PARAMETER_MAPPING_MISSING'));
 console.log(`VIDEO_NESTED_LAYOUTS=PASS CASES=${cases} LAYOUTS=19 LEGACY_WIRE_PARITY=${parity} NETWORK=0`);
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
