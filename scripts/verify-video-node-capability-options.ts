// Historical capability-era fixture only; current product UI gate exit is verified by verify-video-ui-gate-exit.ts.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import documented from "../src/lib/model-config/video-family-capabilities.json";
import legacy from "../src/lib/model-config/video-family-presets.json";
import {normalizeVideoInput,resolveVideoCapability,VideoContractError} from "../src/lib/video/contract";
import {videoDefinitionSchema,videoProfileProtocol,type VideoModelDefinition,type ResolvedVideoCapability,type VideoMode,type VideoWireProfile} from "../src/lib/video/capability-schema";
import {reconcileVideoSettings,validateVideoSettings,videoAspectRatios,videoDurations,videoResolutions,videoModeRoles,type VideoNodeConfig} from "../src/lib/video/legacy-client-settings";
import {videoParameterScope} from "../src/lib/video/parameter-options";
import {buildVideoCreate,buildVideoPoll,type VideoWireContext} from "../src/lib/video/providers/wire";
import type {VideoGenerationRequest,VideoReference} from "../src/lib/video/types";
import type {OrderedInput} from "../src/lib/video/references";

/** One concentrated, entirely offline module check. Expected fields are specified
 * independently below, not obtained by serializing a codec into its own oracle.
 * A duration/resolution map is a set of legal rows, NOT a cartesian product of
 * all durations/resolutions/ratios across modes. Each row supplies legal witnesses
 * for extrema, every resolution, and every scoped ratio. No server or DB starts.
 * Run: npx tsx scripts/verify-video-node-capability-options.ts
 */
type Item={providerId:string;model:string;publicId:string;profile:VideoWireProfile;definition:VideoModelDefinition};
type Proposal={model:string;definition:VideoModelDefinition;sourceSHA256?:string};
const items=documented.items as Item[];
const prompt="An orange ceramic cube rotates on a white table.";
const output=path.resolve(process.env.VIDEO_OPTIONS_EVIDENCE||"output/video-node-capabilities-20261023");
const failures:{label:string;error:string;stack?:string}[]=[];
const coverage:{provider:string;model:string;mode:VideoMode;duration:number;resolution:string;ratio?:string}[]=[];
let assertions=0,cases=0,passed=0,httpCalls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=(async()=>{httpCalls++;throw new Error("Offline verifier attempted HTTP");}) as typeof fetch;
const eq=(actual:unknown,expected:unknown,message:string)=>{assertions++;assert.deepEqual(actual,expected,message);};
const ok=(value:unknown,message:string)=>{assertions++;assert.ok(value,message);};
const test=(label:string,run:()=>void)=>{cases++;try{run();passed++;}catch(error){const e=error as Error;failures.push({label,error:e.message,stack:e.stack});console.error(`FAIL ${label}\n${e.stack||String(error)}`);}};
function rejected(run:()=>unknown,label:string,codes?:string[]){
  assertions++;assert.throws(run,error=>error instanceof VideoContractError&&error.status===422&&(!codes||codes.includes(error.code)),label);
}
const json=(value:unknown)=>JSON.parse(JSON.stringify(value));
const sorted=(values:readonly (number|string)[])=>[...values].sort();
const unique=<T,>(values:readonly T[])=>[...new Set(values)];
const image=(i:number,role:VideoReference["role"]="reference"):VideoReference=>({id:`image-${i}`,kind:"image",role,url:`https://media.example.test/image-${i}.png`});
function refsFor(mode:VideoMode,count?:number):VideoReference[]{
  if(mode==="text")return [];
  if(mode==="single_image")return [image(1,"first_frame")];
  if(mode==="first_optional")return count===2?[image(1,"first_frame"),image(2,"last_frame")]:[image(1,"last_frame")];
  if(mode==="last_optional")return count===2?[image(1,"first_frame"),image(2,"last_frame")]:[image(1,"first_frame")];
  if(mode==="frames_required")return [image(1,"first_frame"),image(2,"last_frame")];
  if(mode==="reference")return Array.from({length:count??1},(_,i)=>image(i+1));
  throw new Error(`Unexpected active mode ${mode}`);
}
const find=(provider:string,model:string)=>{const item=items.find(row=>row.providerId===provider&&row.model===model);assert(item,`${provider}/${model} exists`);return item;};
function context(item:Item,input:ReturnType<typeof normalizeVideoInput>,profile:VideoWireProfile=item.profile):VideoWireContext{
  const request:VideoGenerationRequest={...input,providerId:item.providerId,modelId:item.model,source:"canvas",idempotencyKey:"offline-capability-fixture"};
  return {profile,request,provider:{id:item.providerId,label:"Offline fixture",protocol:videoProfileProtocol(profile),baseUrl:"https://supplier.example.test",apiKey:"unused-fixture-key",models:[item.model],defaultModel:item.model,idempotencyStrategy:"none",videoProfile:profile,...(item.providerId==="geeknow-video-h3"?{createPath:"/v1/videos",pollPath:"/v1/videos/{id}"}:{})}};
}
function baseInput(item:Item,mode:VideoMode,patch:Record<string,unknown>={}){
  const scope=videoParameterScope(item.definition,mode),map=scope.durationResolutionMap![0];
  const resolution=map.resolutions[0],ratios=videoParameterScope(scope,mode,resolution).aspectRatios!;
  return {modelId:item.model,providerId:item.providerId,prompt,mode,durationSeconds:map.durations[0],resolution,aspectRatio:ratios[0],references:refsFor(mode),...patch};
}
function wire(item:Item,mode:VideoMode,patch:Record<string,unknown>={}){
  return buildVideoCreate(context(item,normalizeVideoInput(baseInput(item,mode,patch),item.definition)));
}
// Independent supplier field expectations from apib/geek-research.json.
function expectedBody(item:Item,input:ReturnType<typeof normalizeVideoInput>):Record<string,unknown>{
  const {model}=item,frame=["single_image","frames_required","first_optional","last_optional"].includes(input.mode);
  const first=input.references.find(ref=>ref.role==="first_frame")?.url,last=input.references.find(ref=>ref.role==="last_frame")?.url;
  if(item.providerId==="geeknow-video-h3")return {model,content:[{type:"text",text:input.prompt},...input.references.map(ref=>({type:"image_url",image_url:{url:ref.url},role:["first_frame","last_frame"].includes(ref.role)?ref.role:"reference_image"}))],resolution:input.resolution,duration:input.durationSeconds,ratio:input.aspectRatio};
  if(item.providerId==="geeknow-video"){
    if(model==="wan3.0-video")return {model,prompt:input.prompt,seconds:input.durationSeconds,size:input.resolution.toUpperCase(),...(!frame?{aspect_ratio:input.aspectRatio==="adaptive"?"adaptive":input.aspectRatio!.replace(":","x")}:{}),...(input.mode==="single_image"?{image:first}:input.mode==="frames_required"?{mode:"first-last-frame",metadata:{first_frame_url:first,last_frame_url:last}}:input.mode==="reference"?{mode:"all-reference",images:input.references.map(ref=>ref.url)}:{})};
    return {model,prompt:input.prompt,seconds:String(input.durationSeconds),metadata:{output_config:{resolution:input.resolution.toUpperCase(),audio_generation:input.generateAudio===true?"Enabled":"Disabled",...(!frame?{aspect_ratio:input.aspectRatio}:{})}},...(input.mode==="single_image"?{image:first}:input.mode==="reference"?{images:input.references.map(ref=>ref.url)}:{})};
  }
  const body:Record<string,unknown>={model,prompt:input.prompt,duration:input.durationSeconds};
  if(["kling-v2-6","kling-v3","kling-v3-omni","kling-video-o1"].includes(model))body.mode=({"720p":"std","1080p":"pro","4k":"4k"} as Record<string,string>)[input.resolution.toLowerCase()];
  else body.resolution=model.startsWith("wan3.")||model==="wan2.7-r2v"||model.startsWith("MiniMax-")?input.resolution.toUpperCase():input.resolution.toLowerCase();
  const audio:Record<string,boolean>={"seedance-1-5-pro":false,"kling-v2-6":false,"kling-v3":false,"kling-v3-omni":false,"wan2.5-preview":true,"wan2.6-i2v-flash":false};
  if(Object.hasOwn(audio,model))body.audio=input.generateAudio??audio[model];
  if(!frame||model.startsWith("seedance-1-")){
    const field=model.startsWith("seedance-2.")||["wan2.5-preview","wan2.7-r2v","wan3.0-video","wan3.0-video-prime"].includes(model)?"size":"aspect_ratio";
    body[field]=model==="kling-v4"&&input.aspectRatio==="adaptive"?"auto":input.aspectRatio;
  }else if(model.startsWith("seedance-2.")||model.startsWith("wan3."))body.size="adaptive";
  if(frame){
    if(model==="kling-3.0-turbo")body.first_frame_image=first;
    else if(model.startsWith("MiniMax-")){if(first)body.first_frame_image=first;if(last)body.last_frame_image=last;}
    // Raw Kling3 Omni docs classify image_urls as ordinary references, not
    // keyframes. Explicit roles take precedence over the research summary.
    else if(model.startsWith("seedance-1-0")||model.startsWith("seedance-2.")||model==="kling-v3-omni"||model==="wan2.7-r2v"||model.startsWith("wan3."))body.image_with_roles=input.references.map(ref=>({url:ref.url,role:ref.role}));
    else body.image_urls=[first,last].filter(Boolean);
  }else if(input.mode==="reference"){
    if(["kling-v4","wan2.7-r2v","wan3.0-video","wan3.0-video-prime"].includes(model))body.image_with_roles=input.references.map(ref=>({url:ref.url,role:"reference_image"}));
    else body.image_urls=input.references.map(ref=>ref.url);
  }
  return body;
}
function exercise(item:Item,mode:VideoMode,duration:number,resolution:string,ratio:string,extra:Record<string,unknown>={}){
  const cap=resolveVideoCapability({manual:item.definition});
  const raw=baseInput(item,mode,{durationSeconds:duration,resolution,aspectRatio:ratio,...extra});
  const before=json(raw),capBefore=json(cap);
  const reconciled=reconcileVideoSettings(raw as VideoNodeConfig,cap);
  eq([reconciled.config.mode,reconciled.config.durationSeconds,reconciled.config.resolution,reconciled.config.aspectRatio],[mode,duration,resolution,ratio],"legal explicit UI selections remain unchanged");
  eq(reconciled.changes,[],"legal explicit options produce no adjustment notices");
  eq(validateVideoSettings(reconciled.config,[],cap),null,"real client validation accepts scoped options");
  const normalized=normalizeVideoInput(reconciled.config as Record<string,unknown>,cap),ctx=context(item,normalized);
  const actual=buildVideoCreate(ctx);
  eq(json(actual),{path:item.providerId==="apib-video"?"/v1/videos/generations":"/v1/videos",method:"POST",encoding:"json",body:json(expectedBody(item,normalized))},"exact documented wire and endpoint");
  eq(json(raw),before,"caller config is immutable");eq(json(cap),capBefore,"capability is immutable");
  coverage.push({provider:item.providerId,model:item.model,mode,duration,resolution,ratio});
}

test("32-model identity and independent research coverage",()=>{
  eq(items.length,32,"32 active documented models");eq(new Set(items.map(row=>row.publicId)).size,32,"unique public identities");
  const research=JSON.parse(fs.readFileSync("scripts/fixtures/video-node-research.json","utf8")) as {apib:{proposals:Proposal[]};geek:{proposals:Proposal[]}};
  const {apib,geek}=research;
  eq(sorted(items.map(row=>`${row.providerId}/${row.model}`)),sorted([...apib.proposals.filter(row=>row.model!=="wan2.7-videoedit").map(row=>`apib-video/${row.model}`),...geek.proposals.map(row=>`${row.model==="MiniMax-H3"?"geeknow-video-h3":"geeknow-video"}/${row.model}`)]),"exact research model set minus disabled edit SKU");
  for(const item of items){const research=(item.providerId==="apib-video"?apib:geek).proposals.find(row=>row.model===item.model)!;
    eq(item.definition.durationResolutionMap,research.definition.durationResolutionMap,`${item.model}: full documented map, not smoke-only values`);
    eq(sorted(item.definition.modes!),sorted(research.definition.modes!),`${item.model}: exact researched mode set`);
  }
});

for(const item of items){
  test(`${item.providerId}/${item.model}: definition and deferred media`,()=>{
    videoDefinitionSchema.parse(item.definition);assertions++;
    eq(item.definition.supportsAutoDuration,false,"auto -1 deliberately deferred");
    eq([item.definition.limits?.videos,item.definition.limits?.audios],[0,0],"unmapped reference kinds remain disabled");
    const mode=item.definition.modes![0],base=baseInput(item,mode);
    for(const kind of ["video","audio"] as const)rejected(()=>normalizeVideoInput({...base,references:[...refsFor(mode),{id:kind,kind,role:"reference",url:`https://media.example.test/${kind}.mp4`,durationSeconds:2}]},item.definition),`${kind} rejected before wire`);
    rejected(()=>normalizeVideoInput({...base,durationSeconds:-1},item.definition),"-1 rejected",["AUTO_DURATION_UNSUPPORTED"]);
    rejected(()=>buildVideoCreate(context(item,{...normalizeVideoInput(base,item.definition),durationSeconds:-1})),"direct codec -1 rejected",["AUTO_DURATION_UNSUPPORTED"]);
    rejected(()=>normalizeVideoInput({...base,references:[{...image(1),inlineData:{mimeType:"image/png",data:"eA=="}}]},item.definition),"undeclared inlineData rejected",["INVALID_VIDEO_INPUT"]);
  });
  for(const mode of unique(item.definition.modes!)){
    const cap=resolveVideoCapability({manual:item.definition}),scope=videoParameterScope(item.definition,mode),maps=scope.durationResolutionMap!;
    const durations=unique(maps.flatMap(row=>row.durations)),seen=new Set<string>();
    test(`${item.model}/${mode}: real option helpers`,()=>{
      eq(videoDurations(cap,mode),durations,"duration choices preserve sparse rows");
      for(const duration of durations)eq(videoResolutions(cap,duration,mode),unique(maps.filter(row=>row.durations.includes(duration)).flatMap(row=>row.resolutions)),"resolution choices match this mode and duration");
      const raw=baseInput(item,mode,{durationSeconds:3600,resolution:"not-a-resolution",aspectRatio:"99:1",generateAudio:true,providerOptions:{obsolete:1}});
      const updated=reconcileVideoSettings(raw as VideoNodeConfig,cap);
      ok(durations.includes(updated.config.durationSeconds!),"invalid duration reconciled into current mode");
      ok(videoResolutions(cap,updated.config.durationSeconds,mode).includes(updated.config.resolution!),"resolution reconciled after duration");
      ok(videoAspectRatios(cap,mode,updated.config.resolution).includes(updated.config.aspectRatio!),"ratio reconciled after resolution");
      eq(updated.config.providerOptions,{},"obsolete options removed");
      if(cap.audio==null)eq("generateAudio" in updated.config,false,"unknown audio is not resurrected");
      eq(validateVideoSettings(updated.config,[],cap),null,"reconciled real config is valid");
      rejected(()=>normalizeVideoInput(baseInput(item,mode,{durationSeconds:Math.max(...durations)+1}),cap),"above maximum rejected",["UNSUPPORTED_DURATION"]);
      if(Math.min(...durations)>1)rejected(()=>normalizeVideoInput(baseInput(item,mode,{durationSeconds:Math.min(...durations)-1}),cap),"below minimum rejected",["UNSUPPORTED_DURATION"]);
      if(durations.includes(5)&&durations.includes(10)&&!durations.includes(6))rejected(()=>normalizeVideoInput(baseInput(item,mode,{durationSeconds:6}),cap),"sparse5/10 must not interpolate6",["UNSUPPORTED_DURATION"]);
    });
    for(const row of maps)for(const resolution of row.resolutions){
      const ratios=videoParameterScope(item.definition,mode,resolution).aspectRatios!;
      test(`${item.model}/${mode}/${resolution}: scoped ratios`,()=>eq(videoAspectRatios(cap,mode,resolution),ratios,"options use exact mode+resolution ratio scope"));
      const witnesses=[...unique([Math.min(...row.durations),Math.max(...row.durations)])].map(duration=>({duration,ratio:ratios[0]}));
      for(const ratio of ratios)witnesses.push({duration:row.durations[0],ratio});
      for(const {duration,ratio} of witnesses){const key=`${duration}/${resolution}/${ratio}`;if(seen.has(key))continue;seen.add(key);
        test(`${item.providerId}/${item.model}/${mode}/${key}`,()=>exercise(item,mode,duration,resolution,ratio));
      }
    }
    if(mode==="reference"){
      const map=maps[0],ratio=videoParameterScope(item.definition,mode,map.resolutions[0]).aspectRatios![0],maximum=item.definition.limits!.images!;
      test(`${item.model}: image-reference maximum and overflow`,()=>{
        exercise(item,mode,map.durations[0],map.resolutions[0],ratio,{references:refsFor(mode,maximum)});
        rejected(()=>normalizeVideoInput(baseInput(item,mode,{references:refsFor(mode,maximum+1)}),item.definition),"reference max+1 rejected",["REFERENCE_LIMIT_EXCEEDED"]);
      });
    }
    if(mode==="first_optional")test(`${item.model}: optional first single-tail and pair`,()=>{
      const map=maps[0],ratio=videoParameterScope(item.definition,mode,map.resolutions[0]).aspectRatios![0];
      exercise(item,mode,map.durations[0],map.resolutions[0],ratio,{references:refsFor(mode,2)});
    });
  }
}

test("4K exact three-model whitelist; no alias broadening",()=>{
  const supported=items.filter(item=>item.definition.durationResolutionMap!.some(row=>row.resolutions.some(value=>value.toLowerCase()==="4k")));
  eq(sorted(supported.map(row=>`${row.providerId}/${row.model}`)),["apib-video/kling-v3","apib-video/kling-v3-omni","apib-video/seedance-2.0"],"only documented exact IDs offer 4K");
  for(const item of items){const mode=item.definition.modes![0],base=baseInput(item,mode);if(!supported.includes(item))rejected(()=>normalizeVideoInput({...base,resolution:"4k"},item.definition),`${item.model} no borrowed 4K`,["UNSUPPORTED_RESOLUTION"]);}
});
test("Kling2.6 std/pro audio and frame1080 UI linkage",()=>{
  const item=find("apib-video","kling-v2-6"),cap=resolveVideoCapability({manual:item.definition});
  const std=wire(item,"text",{resolution:"720p"}).body as Record<string,unknown>,pro=wire(item,"text",{resolution:"1080p"}).body as Record<string,unknown>;
  eq([std.mode,pro.mode,pro.audio],["std","pro",false],"wire quality and preserved disabled audio fields");eq("sound" in pro,false,"new APIB must not inherit legacy sound field");
  eq(item.definition.audio,"disabled","documented ratio/mode upgrade does not expose a new output-audio switch");
  rejected(()=>wire(item,"text",{resolution:"1080p",generateAudio:true}),"pro still preserves installed audio restriction",["AUDIO_SETTING_UNSUPPORTED"]);
  rejected(()=>wire(item,"text",{resolution:"720p",generateAudio:true}),"std rejects audio");
  rejected(()=>wire(item,"frames_required",{resolution:"1080p",generateAudio:true}),"pair rejects audio");
  rejected(()=>normalizeVideoInput(baseInput(item,"frames_required",{resolution:"720p"}),cap),"pair requires1080",["UNSUPPORTED_RESOLUTION"]);
  const changed=reconcileVideoSettings({...baseInput(item,"text"),mode:"frames_required",references:refsFor("frames_required")} as VideoNodeConfig,cap);
  eq([changed.config.durationSeconds,changed.config.resolution,changed.config.aspectRatio],[5,"1080p","adaptive"],"mode change repairs quality and ratio");
  ok(changed.changes.includes("分辨率")&&changed.changes.includes("画幅"),"dependent changes are reported");
  eq(validateVideoSettings(changed.config,[],cap),null,"actual client validation of mode transition");
  eq((buildVideoCreate(context(item,normalizeVideoInput(changed.config as Record<string,unknown>,cap))).body as Record<string,unknown>).mode,"pro","transition reaches pro wire");
});
test("Wan2.5 resolution→ratio and independent duration linkage",()=>{
  const item=find("apib-video","wan2.5-preview"),cap=resolveVideoCapability({manual:item.definition});
  eq(videoAspectRatios(cap,"text","480p"),["16:9","9:16","1:1"],"480p restricted ratios");
  for(const ratio of ["4:3","3:4"]){rejected(()=>wire(item,"text",{resolution:"480p",aspectRatio:ratio}),"480p non-native ratio rejected",["UNSUPPORTED_ASPECT_RATIO"]);wire(item,"text",{resolution:"720p",aspectRatio:ratio});assertions++;}
  const before=baseInput(item,"text",{durationSeconds:10,resolution:"720p",aspectRatio:"4:3"});
  const lowered=reconcileVideoSettings({...before,resolution:"480p"} as VideoNodeConfig,cap);
  eq([lowered.config.durationSeconds,lowered.config.resolution,lowered.config.aspectRatio],[10,"480p","16:9"],"quality change keeps independent10s while repairing ratio");
  eq(lowered.changes,["画幅"],"only changed dependency is reported");
  const duration=reconcileVideoSettings({...lowered.config,durationSeconds:5},cap);
  eq([duration.config.durationSeconds,duration.config.resolution,duration.config.aspectRatio],[5,"480p","16:9"],"independent duration change preserves legal quality and ratio");
  eq(validateVideoSettings(duration.config,[],cap),null,"changed duration is actually valid");
});
test("Kling3 Omni keyframes use explicit roles, never ordinary-reference image_urls",()=>{
  const item=find("apib-video","kling-v3-omni");
  for(const mode of ["single_image","frames_required"] as const){
    const body=wire(item,mode).body as Record<string,unknown>;
    eq(body.image_with_roles,refsFor(mode).map(ref=>({url:ref.url,role:ref.role})),`${mode}: explicit documented keyframe roles`);
    eq("image_urls" in body,false,`${mode}: no ordinary-reference shorthand`);
  }
});
test("Wan2.7 R2V reference rejects adaptive; single image inherits ratio without size",()=>{
  const item=find("apib-video","wan2.7-r2v"),cap=resolveVideoCapability({manual:item.definition});
  for(const resolution of ["720P","1080P"]){
    eq(videoAspectRatios(cap,"reference",resolution),["16:9","9:16","1:1","4:3","3:4"],`${resolution}: only five documented reference ratios`);
    const raw=baseInput(item,"reference",{resolution,aspectRatio:"adaptive"});
    rejected(()=>normalizeVideoInput(raw,cap),`${resolution}: reference adaptive rejected at normalization`,["UNSUPPORTED_ASPECT_RATIO"]);
    const valid=normalizeVideoInput(baseInput(item,"reference",{resolution}),cap);
    rejected(()=>buildVideoCreate(context(item,{...valid,aspectRatio:"adaptive"})),`${resolution}: direct codec cannot bypass reference ratio gate`,["UNSUPPORTED_ASPECT_RATIO"]);
    const body=wire(item,"single_image",{resolution,aspectRatio:"adaptive"}).body as Record<string,unknown>;
    eq(body.image_with_roles,[{url:image(1).url,role:"first_frame"}],`${resolution}: single image retains first_frame role`);
    eq(["size","aspect_ratio"].filter(key=>key in body),[],`${resolution}: single-image ratio follows source, no size is sent`);
  }
});
test("H3 references never become frames, tail removal roles, and fixed Geek ratio",()=>{
  for(const provider of ["apib-video","geeknow-video-h3"]){
    const item=find(provider,"MiniMax-H3"),cap=resolveVideoCapability({manual:item.definition});
    const input:OrderedInput[]=[1,2].map(i=>({id:`image-${i}`,nodeId:`art-${i}`,kind:"image",role:"reference",value:image(i).url!}));
    const pair=videoModeRoles(input,"first_optional");eq(pair.map(ref=>ref.role),["first_frame","last_frame"],"optional pair roles");
    const remaining=videoModeRoles(pair.filter(ref=>ref.id!=="image-2"),"first_optional");eq(remaining.map(ref=>ref.role),["last_frame"],"delete tail reassigns remaining image as tail");
    const refs=videoModeRoles(pair,"reference");eq(refs.map(ref=>ref.role),["reference","reference"],"reference mode clears frame roles");
    const config=reconcileVideoSettings(baseInput(item,"reference",{references:refsFor("reference",2)}) as VideoNodeConfig,cap).config;
    eq(validateVideoSettings(config,refs,cap),null,"actual ordered-input client validation");
    const body=wire(item,"reference",{references:refsFor("reference",2)}).body as Record<string,unknown>;
    if(provider==="apib-video"){eq(body.image_urls,[image(1).url,image(2).url],"H3 ordinary reference array");eq(["first_frame_image","last_frame_image","image_with_roles"].filter(key=>key in body),[],"two references are not frame shorthand");}
    else{eq((body.content as {role?:string}[]).slice(1).map(ref=>ref.role),["reference_image","reference_image"],"Geek explicit reference roles");rejected(()=>wire(item,"frames_required",{aspectRatio:"adaptive"}),"Geek H3 adaptive rejected",["UNSUPPORTED_ASPECT_RATIO"]);}
  }
});

test("authority: vendor/adapter conditional data never resurrect admin null/[]",()=>{
  const map=[{durations:[5,10],resolutions:["720p"]}],conditional={single_image:{durationResolutionMap:[{durations:[6],resolutions:["1080p"]}],aspectRatios:["adaptive"]}};
  for(const empty of [null,[]] as const){
    const cap=resolveVideoCapability({manual:{modes:["single_image"],aspectRatios:empty as null|[],durationResolutionMap:empty as null|[]},vendor:{modeParameters:conditional,resolutionAspectRatios:{"1080p":["adaptive"]}}});
    eq(videoParameterScope(cap,"single_image","1080p").aspectRatios,empty,"admin empty ratio retained");
    eq(videoParameterScope(cap,"single_image").durationResolutionMap,empty,"admin empty spec retained");
    eq(videoDurations(cap,"single_image"),[],"lower-ranked mode map does not revive duration options");
    rejected(()=>normalizeVideoInput({prompt,mode:"single_image",durationSeconds:6,resolution:"1080p",aspectRatio:"adaptive",references:refsFor("single_image")},cap),"null/empty blocks submission",["UNSUPPORTED_DURATION"]);
  }
  const cap=resolveVideoCapability({manual:{modes:["single_image"],durationResolutionMap:map,aspectRatios:["16:9"],limits:{images:1}},vendor:{modeParameters:conditional,resolutionAspectRatios:{"720p":["adaptive"]}}});
  eq(videoDurations(cap,"single_image"),[5,10],"admin concrete spec defeats vendor mode6");eq(videoAspectRatios(cap,"single_image","720p"),["16:9"],"vendor resolution restrictions cannot erase admin ratio");
  const selected=reconcileVideoSettings({prompt,mode:"single_image",durationSeconds:10,resolution:"720p",aspectRatio:"16:9",references:refsFor("single_image")},cap);
  eq([selected.config.durationSeconds,selected.config.resolution,selected.config.aspectRatio],[10,"720p","16:9"],"real client preserves admin selection");
  eq(validateVideoSettings({...selected.config,modelId:"admin-model"},[],cap),null,"admin contract validates");
  const vendorWins=resolveVideoCapability({vendor:{modes:["single_image"],modeParameters:conditional,resolutionAspectRatios:{"1080p":["adaptive"]}},adapter:{durationResolutionMap:map,aspectRatios:["16:9"]}});
  eq(videoDurations(vendorWins,"single_image"),[6],"vendor mode outranks adapter base");eq(videoAspectRatios(vendorWins,"single_image","1080p"),["adaptive"],"higher ranked mode and matching restriction");
  const same=resolveVideoCapability({manual:{durationResolutionMap:map,aspectRatios:["16:9"],modeParameters:conditional}});
  eq(videoDurations(same,"single_image"),[6],"same-authority mode overrides base");
  const blocked=resolveVideoCapability({manual:{modeParameters:null,resolutionAspectRatios:null},vendor:{modeParameters:conditional,resolutionAspectRatios:{"1080p":["adaptive"]}},adapter:{durationResolutionMap:map,aspectRatios:["16:9"]}});
  eq(videoDurations(blocked,"single_image"),[5,10],"explicit admin null mode map defeats vendor revival");eq(videoAspectRatios(blocked,"single_image","720p"),["16:9"],"explicit null restriction remains null");
});

// Frozen old profiles are checked from their original smoke rows, not upgraded
// definitions. These seven profiles include the existing MiniMax content grammar.
test("legacy seven-profile and 33-SKU exact wire regression",()=>{
  const profiles=new Set<string>();
  for(const old of legacy.items){
    const item=old as unknown as Item,cap=item.definition,input=normalizeVideoInput({prompt,mode:cap.modes![0],durationSeconds:cap.defaultDurationSeconds,resolution:cap.defaultResolution,aspectRatio:cap.defaultAspectRatio,references:old.model==="wan2.7-videoedit"?[{id:"source",kind:"video",role:"source_video",url:"https://media.example.test/source.mp4",durationSeconds:5}]:refsFor(cap.modes![0]),...(cap.audio==null?{}:{generateAudio:cap.audio==="required"})},cap);
    const ctx=context(item,input),actual=buildVideoCreate(ctx),model=item.model;profiles.add(item.profile);
    let body:Record<string,unknown>;
    if(item.profile==="minimax")body={model,content:[{type:"text",text:prompt}],resolution:"768P",duration:1,ratio:"16:9"};
    else if(item.profile==="geek-kling")body={model,prompt,seconds:"5",metadata:{output_config:{resolution:"720P",aspect_ratio:"16:9",audio_generation:"Disabled"}},...(input.mode==="reference"?{images:input.references.map(ref=>ref.url)}:{})};
    else if(item.profile==="geek-wan3")body={model,prompt,seconds:2,size:"480P",aspect_ratio:"16x9"};
    else{
      body={model,prompt,duration:input.durationSeconds};
      if(["kling-v2-6","kling-v3","kling-v3-omni","kling-video-o1"].includes(model))body.mode="std";else body.resolution=input.resolution;
      const audio:Record<string,boolean>={"seedance-1-5-pro":false,"kling-v2-6":false,"kling-v3":false,"kling-v3-omni":false,"wan2.5-preview":true,"wan2.6-i2v-flash":false};if(Object.hasOwn(audio,model))body.audio=audio[model];
      if(model==="wan2.6-i2v-flash")body.image_urls=input.references.map(ref=>ref.url);
      if(model==="wan2.7-r2v")body.image_with_roles=input.references.map(ref=>({url:ref.url,role:"reference_image"}));
      if(model==="wan2.7-videoedit")body.video_urls=input.references.map(ref=>ref.url);
    }
    eq(json(actual),{path:item.providerId==="apib-video"?"/v1/videos/generations":"/v1/videos",method:"POST",encoding:"json",body},`${item.profile}/${model}: legacy exact body`);
    if(item.profile==="apimart-apib-seedance")rejected(()=>buildVideoCreate({...ctx,request:{...ctx.request,mode:"single_image",references:[image(1,"first_frame")]}}),"legacy smoke text-only remains text-only");
  }
  eq(sorted([...profiles]),["apimart-apib-h3","apimart-apib-kling","apimart-apib-seedance","apimart-apib-wan","geek-kling","geek-wan3","minimax"],"seven legacy profiles remain distinct");
  const old=legacy.items.find(row=>row.profile==="minimax") as unknown as Item,ctx=context(old,normalizeVideoInput({prompt,durationSeconds:1,resolution:"768P",aspectRatio:"16:9",references:[]},old.definition));
  eq(buildVideoPoll(ctx,"task/unsafe ?").path,"/v1/videos/task%2Funsafe%20%3F","existing H3 endpoint override retained");
  for(const profile of ["minimax","metaso"] as const){const legacyFrame=buildVideoCreate({...ctx,profile,provider:{...ctx.provider,createPath:undefined},request:{...ctx.request,mode:"single_image",references:[image(1,"first_frame")],aspectRatio:"9:16"}});eq((legacyFrame.body as Record<string,unknown>).ratio,"adaptive",`${profile}: historic frame ratio rewrite unchanged`);}
  const oldKling=buildVideoCreate({...ctx,profile:"apimart-kling-v26",provider:{...ctx.provider,createPath:undefined},request:{...ctx.request,modelId:"legacy-kling",durationSeconds:5,resolution:"720p",generateAudio:false}}).body as Record<string,unknown>;
  eq(oldKling.sound,false,"older APIMart uses sound");eq("audio" in oldKling,false,"new audio mapping never rewrites old profile");
});
test("legacy default rejection semantics preserved",()=>{
  const cap:VideoModelDefinition={modes:["text"],durationResolutionMap:[{durations:[5],resolutions:["720p"]}],aspectRatios:["16:9"],defaultDurationSeconds:5,defaultResolution:"1080p",defaultAspectRatio:"9:16",limits:{images:0,videos:0,audios:0}};
  rejected(()=>normalizeVideoInput({prompt,references:[]},cap),"legacy invalid default quality is rejected, not silently corrected",["UNSUPPORTED_RESOLUTION"]);
  rejected(()=>normalizeVideoInput({prompt,references:[],resolution:"720p"},cap),"legacy invalid default ratio is rejected, not silently corrected",["UNSUPPORTED_ASPECT_RATIO"]);
});

globalThis.fetch=originalFetch;
test("offline and every active mode reached wire",()=>{
  eq(httpCalls,0,"zero HTTP requests");
  for(const item of items)for(const mode of unique(item.definition.modes!))ok(coverage.some(row=>row.provider===item.providerId&&row.model===item.model&&row.mode===mode),`${item.providerId}/${item.model}/${mode} reached normalize and exact codec assertion`);
});
const fingerprints=Object.fromEntries(["src/lib/model-config/video-family-capabilities.json","src/lib/video/contract.ts","src/lib/video/parameter-options.ts","src/lib/video/legacy-client-settings.ts","src/lib/video/providers/protocols/apib-documented.ts","src/lib/video/providers/protocols/geek-documented.ts","src/lib/video/providers/protocols/geek-h3-documented.ts", "scripts/verify-video-node-capability-options.ts"].map(file=>[file,createHash("sha256").update(fs.readFileSync(file)).digest("hex")]));
const summary=`VIDEO_NODE_CAPABILITY_OPTIONS=${failures.length?"FAIL":"PASS"} models=${items.length} modes=${items.reduce((n,item)=>n+unique(item.definition.modes!).length,0)} wire_cases=${coverage.length} cases=${cases} passed=${passed} failed=${failures.length} assertions=${assertions} http_calls=${httpCalls} paid_calls=0 legacy_profiles=7 legacy_skus=33`;
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,"ui-options-results.json"),JSON.stringify({summary,status:failures.length?"FAIL":"PASS",evidence:"offline real client-settings + normalization + codec; no GUI or real supplier acceptance",fingerprints,coverage,failures},null,2)+"\n");
console.log(summary);
if(failures.length)process.exitCode=1;
