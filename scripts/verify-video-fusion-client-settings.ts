// Historical capability-era fixture only; current product UI gate exit is verified by verify-video-ui-gate-exit.ts.
import assert from "node:assert/strict";
import {catalogCapability,reconcileVideoSettings,videoDurations,videoResolutions,videoModeRoles,validateVideoSettings} from "../src/lib/video/legacy-client-settings";
import {resolveVideoCapability} from "../src/lib/video/contract";
import {compileVideoCamera} from "../src/lib/video/camera";
import {compileVideoPrompt} from "../src/lib/video/prompt";
import {numberVideoInputs,type OrderedInput} from "../src/lib/video/references";
import {prepareVideoReceipt,readVideoReceipt,clearVideoReceipt,saveVideoReceipt} from "../src/lib/video/canvas-receipts";
import type {CanvasVideoNode} from "../src/lib/canvas/video-node-schema";

const cap=resolveVideoCapability({manual:{modes:["text","single_image","first_optional","last_optional","reference"],durationResolutionMap:[{durations:[4],resolutions:["720p"]},{durations:[8],resolutions:["1080p"]}],aspectRatios:["16:9","9:16"],audio:"optional",supportsCamera:true,limits:{images:2,videos:1,audios:1},providerOptions:{enabled:{type:"boolean"},seed:{type:"integer",minimum:0},hidden:{type:"string",send:"omit"}}}});
assert.deepEqual(videoDurations(catalogCapability()),[],"未知模型不能被前端补成4/8/12秒");
assert.deepEqual(videoResolutions(cap,8),["1080p"]);
const first=reconcileVideoSettings({modelId:"public-video",providerId:"managed-video",mode:"text",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",prompt:"完整对白",generateAudio:false,providerOptions:{enabled:false,seed:0,hidden:"remove"}},cap);
assert.equal(first.config.generateAudio,false);assert.deepEqual(first.config.providerOptions,{enabled:false,seed:0});
const next=reconcileVideoSettings({...first.config,durationSeconds:8},cap);assert.equal(next.config.resolution,"1080p");assert.ok(next.changes.includes("分辨率"));
const image:OrderedInput={id:"image-a",nodeId:"art-image-a",kind:"image",role:"reference",value:"/media/image-a.png"};
assert.equal(videoModeRoles([image],"first_optional")[0].role,"last_frame");assert.equal(videoModeRoles([image],"last_optional")[0].role,"first_frame");
const pair=videoModeRoles([image,{...image,id:"image-b",nodeId:"art-image-b"}],"first_optional");assert.deepEqual(pair.map(item=>item.role),["first_frame","last_frame"]);
assert.equal(videoModeRoles([...pair].reverse(),"first_optional")[0].id,"image-b");
assert.equal(videoModeRoles([{...image,role:"element"}],"reference")[0].role,"element");
const mixed:OrderedInput[]=[{id:"text-a",nodeId:"inline:a",kind:"text",role:"context",value:"对白：你好，明天见。"},image,{id:"video-a",nodeId:"art-video-a",kind:"video",role:"source_video",value:"/media/video-a.mp4"},{...image,id:"image-b",nodeId:"art-image-b"}];
assert.deepEqual(numberVideoInputs(mixed).all.map(item=>[item.index,item.kindIndex]),[[1,1],[2,1],[3,1],[4,2]]);
const prompt=compileVideoPrompt("使用 {{ref 4}}，匹配视频1",mixed,compileVideoCamera({camera:"camera",lens:"lens",movement:"横移"}));
assert.ok(prompt.prompt.includes("图片2"));assert.ok(prompt.prompt.includes("对白：你好，明天见。"));assert.ok(prompt.prompt.includes("movement: 横移"));
assert.equal(compileVideoCamera(undefined),"");assert.ok(!compileVideoPrompt("继续",mixed,compileVideoCamera(undefined)).prompt.includes("movement:"));
assert.equal(validateVideoSettings({...first.config,mode:"reference"},mixed,cap),null);
assert.match(validateVideoSettings({...first.config,mode:"reference"},[...mixed,{...image,id:"image-c",nodeId:"art-image-c"}],cap)||"",/数量/);
assert.equal(videoModeRoles([...mixed,{...image,id:"image-c",nodeId:"art-image-c"}],"reference").length,5,"前端不能截取超额参考");
assert.match(validateVideoSettings({...first.config,mode:"reference"},mixed,cap,[{id:"video-a",nodeId:"art-video-a",kind:"video",title:"前序",value:"/media/video-a.mp4",available:false}])||"",/尚未完成/);
// Explicitly changing to a model that disables camera/shots/elements clears those fields visibly.
const disabled=resolveVideoCapability({manual:{modes:["text"],durationResolutionMap:[{durations:[4],resolutions:["720p"]}],aspectRatios:["16:9"],audio:"disabled",supportsCamera:false,supportsMultiShot:false,supportsElements:false}});
const cleared=reconcileVideoSettings({...first.config,camera:{movement:"横移"},shots:[{prompt:"镜头",durationSeconds:4}],elements:[{name:"角色",references:[{id:"ref",kind:"image",role:"element",artworkId:"art-image-a"}]}]},disabled);
assert.equal(cleared.config.camera,undefined);assert.equal(cleared.config.shots,undefined);assert.equal(cleared.config.elements,undefined);assert.equal(cleared.config.generateAudio,false);assert.ok(cleared.changes.includes("摄影设置"));

const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
const node={id:"vnode-a",projectKey:"tree:vnode-a",revision:7} as CanvasVideoNode;
const receipt=prepareVideoReceipt(storage,"actor-a",node);assert.equal(prepareVideoReceipt(storage,"actor-a",node).idempotencyKey,receipt.idempotencyKey);assert.equal(receipt.expectedRevision,7);
assert.equal(readVideoReceipt(storage,"actor-b",node.id),null);
saveVideoReceipt(storage,"actor-a",{...receipt,taskId:"task-a"});assert.equal(readVideoReceipt(storage,"actor-a",node.id)?.taskId,"task-a");
clearVideoReceipt(storage,"actor-a",node.id,"older-operation");assert.ok(readVideoReceipt(storage,"actor-a",node.id));clearVideoReceipt(storage,"actor-a",node.id,receipt.idempotencyKey);assert.equal(readVideoReceipt(storage,"actor-a",node.id),null);
console.log("VIDEO_CLIENT_SETTINGS=PASS unknown_no_fallback=true ordered_roles=true complete_prompt=true explicit_spec_changes=true receipt_identity=true");
