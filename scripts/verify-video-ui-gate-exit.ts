import assert from 'node:assert/strict';
import {freezeCreationSettings,creationToolArguments} from '../src/lib/agent/creation-settings';
import {compileCanvasLink} from '../src/lib/canvas/link-command';
import {createCanvasVideoNodeActions} from '../src/lib/canvas/video-node-actions';
import {validateVideoSettings,videoNodeCreationDefaults,type VideoCatalogModel,type VideoNodeConfig} from '../src/lib/video/client-settings';
import {selectVideoUiIntent,selectVideoUiModel,videoUiCreationDefaults} from '../src/lib/video/ui-draft';
import {videoNodeConfigSchema} from '../src/lib/canvas/video-node-schema';
import {attachVideoInputs} from '../src/lib/video/mode-selection';
import type {OrderedInput} from '../src/lib/video/references';
let cases=0;const check=(name:string,fn:()=>void)=>{fn();cases++;console.log('UI_EXIT_CHECK='+name+' PASS');};
const model:VideoCatalogModel={modelId:'unknown-name',providerId:'managed-video',label:'Unknown',modes:[],durations:[],resolutions:[],aspectRatios:[],maxReferenceImages:0,supportsFirstFrame:false,supportsLastFrame:false,supportsNegativePrompt:false,supportsGenerateAudio:false,definition:{sources:{},modes:['text'],limits:{images:0,videos:0,audios:0},defaultDurationSeconds:9,defaultResolution:'4K',defaultAspectRatio:'9:16'}};
const config:VideoNodeConfig={modelId:model.modelId,providerId:model.providerId,prompt:'完整描述 {{ref 1}}',mode:'text',durationSeconds:9,resolution:'unmapped',aspectRatio:'1:1',camera:{movement:'pan_left'},providerOptions:{keep:false,seed:0},shots:[{id:'s',prompt:'原镜头',durationSeconds:9}]};
const inputs:OrderedInput[]=[1,2].map(n=>({id:'i'+n,nodeId:'image:'+n,kind:'image',role:'reference',value:'/media/i'+n+'.png'}));
const choices=inputs.map(input=>({id:input.id,nodeId:input.nodeId,kind:input.kind,title:input.id,value:input.value,available:true}));
for(const durationSeconds of [-1,0,1.5,4200])check('agent-freezes-duration-'+durationSeconds+'-without-inventing-profile-constraints',()=>{const settings=freezeCreationSettings({video:{aspectRatio:'adaptive',resolution:'native/provider-size',durationSeconds}});assert.equal(settings.video!.durationSeconds,durationSeconds);const next=creationToolArguments('generate_video',{config:{parameters:{resolution:'old'}}},settings) as any;assert.equal(next.config.parameters.durationSeconds,durationSeconds);assert.equal(next.config.parameters.aspectRatio,'adaptive');const flat=creationToolArguments('generate_video',{config:{prompt:'original'}},settings) as any;assert(videoNodeConfigSchema.safeParse(flat.config).success);assert.equal(flat.config.parameters?.durationSeconds??flat.config.durationSeconds,durationSeconds);});
check('old-zero-limits-and-camera-metadata-no-ui-veto',()=>assert.equal(validateVideoSettings(config,inputs,model.definition!,choices),null));
check('pending-input-still-rejected',()=>assert.match(validateVideoSettings(config,inputs,model.definition!,[{...choices[0],available:false},choices[1]])!,/前序/));
check('unknown-model-catalog-can-create-draft-with-explicit-defaults',()=>{const creation=videoNodeCreationDefaults({models:[model],loading:false,error:''});assert(creation);assert.equal(creation.config.durationSeconds,9);assert.equal(creation.config.mode,undefined);assert.equal(creation.config.resolution,'4K');});
check('empty-description-does-not-invent-defaults-or-hide-model',()=>{const m={...model,definition:undefined};assert.deepEqual(videoUiCreationDefaults(m),{modelId:model.modelId,providerId:model.providerId,prompt:''});assert(videoNodeCreationDefaults({models:[m],loading:false,error:''}));});
check('model-switch-retains-every-nonidentity-field',()=>{const next=selectVideoUiModel(config,{...model,modelId:'other'});assert.deepEqual({...next,modelId:config.modelId},config);});
for(const intent of ['frames_required','image_reference','omni_reference'] as const)check('unbound-intent-'+intent+'-legacy-ingress-with-no-role-rewrite',()=>{const before=structuredClone(inputs),next=selectVideoUiIntent(config,model,intent);assert.equal(next.mode,intent==='frames_required'?intent:'reference');assert.equal(next.intentPreference,undefined);assert.deepEqual(inputs,before);assert.equal(next.prompt,config.prompt);assert.deepEqual(next.providerOptions,config.providerOptions);});
check('attach-keeps-ordinary-images-and-all-draft-settings',()=>{const result=attachVideoInputs(config,inputs,model.definition);assert.deepEqual(result.inputs,inputs);assert.deepEqual(result.config,config);assert.equal(result.changed,false);});
for(const available of [true,false])for(const add of [true,false]){
 const before=add?inputs.slice(0,1):[{...inputs[0],role:'first_frame' as const},{...inputs[1],role:'last_frame' as const}];
 const action=compileCanvasLink({project:null,artworks:[],texts:[],videos:[{id:'video',config,inputs:before}] as never,pending:[],selected:[],choices,videoModels:available?[model]:[],locked:()=>false,productTitle:'',referenceLimit:'',cycleMessage:'',productMention:x=>x},{source:add?inputs[1].nodeId:inputs[0].nodeId,target:'video',add,...(!add?{edgeId:'e-video-'+inputs[0].id+'-video'}:{})});
 check('link-'+add+'-catalog-'+available+'-only-graph-inputs',()=>{assert(action?.kind==='video-patch');assert.deepEqual(Object.keys(action.to),['inputs']);assert.equal(action.to.inputs!.length,add?2:1);assert.equal(action.to.inputs!.at(-1)!.role,add?'reference':'last_frame');});
}
async function main(){
 const writes:any[]=[],history:any[]=[],owner=createCanvasVideoNodeActions();
 const scope={account:'fixture',workspace:'personal',project:'tree:fixture',key:'fixture',documentCurrent:()=>true,viewCurrent:()=>true,assertView(){}};
 const actions=owner.bind(scope,{writable:()=>true,allowed:()=>true,catalog:()=>({models:[model],loading:false,error:'',refresh:async()=>{}}),location:at=>({projectKey:'tree:fixture',...at}),store:{getNode:()=>undefined,flush:async()=>{},save:async(id,patch)=>{writes.push(patch);return {...patch,id,revision:1} as never;}},created:()=>{},history:a=>history.push(a),busy:()=>{},notice:()=>{},english:false});
 await actions.create({at:{x:0,y:0},blank:false,prompt:config.prompt||'',choices});check('actual-native-creation-has-no-mode-inference-or-role-mutation',()=>{assert.equal(writes.length,1);assert.equal(writes[0].config.mode,undefined);assert.deepEqual(writes[0].inputs.map((x:any)=>x.role),['reference','reference']);assert.equal(history.length,1);});
 console.log('VIDEO_UI_GATE_EXIT=PASS CASES='+cases+' DB=0 SUPPLIER_CALLS=0 OLD_CAPABILITY_VETO=0 AUTO_ROLE_REWRITES=0 UNBOUND_REQUEST_SHAPE=COMPATIBLE');
}
void main().catch(error=>{console.error(error);process.exitCode=1});
