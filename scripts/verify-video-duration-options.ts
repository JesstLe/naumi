import assert from "node:assert/strict";
import { videoDurationOptions, videoDurations } from "../src/lib/video/parameter-options";
import { reconcileVideoSettings } from "../src/lib/video/client-settings";
import { freezeCreationSettings, creationToolArguments } from "../src/lib/agent/creation-settings";
import type { ResolvedVideoCapability } from "../src/lib/video/capability-schema";

const range=(start:number,end:number)=>Array.from({length:end-start+1},(_,i)=>start+i);
const capability=(durations:number[]):ResolvedVideoCapability=>({sources:{},modes:["text"],aspectRatios:["16:9"],durationResolutionMap:[{durations,resolutions:["720p"]}]});
let checks=0;
for(const [start,end] of [[4,15],[4,30],[2,60]]){
  const cap=capability(range(start,end));
  assert.deepEqual(videoDurationOptions(cap).seconds,range(start,end));
  for(const durationSeconds of videoDurationOptions(cap).seconds){
    const config=reconcileVideoSettings({modelId:"fixture",mode:"text",durationSeconds},cap).config;
    assert.equal(config.durationSeconds,durationSeconds);
  }
  checks++;
}
assert.deepEqual(videoDurationOptions(capability([15,5,10,5])).seconds,[5,10,15]);checks++;
assert.deepEqual(videoDurations(capability([15,5,10,5])),[15,5,10],"existing default order remains frozen");checks++;
assert.deepEqual(videoDurationOptions(capability([4])).seconds,[4]);checks++;
assert.deepEqual(videoDurationOptions({sources:{}}).seconds,[]);checks++;
assert.equal(videoDurationOptions({...capability([-1,4,5]),supportsAutoDuration:true}).automatic,true);checks++;
assert.equal(videoDurationOptions({...capability([-1,4,5]),supportsAutoDuration:false}).automatic,false);checks++;
const scoped:ResolvedVideoCapability={...capability(range(4,30)),sources:{durationResolutionMap:"vendor",modeParameters:"admin"},modeParameters:{single_image:{durationResolutionMap:[{durations:[5,10],resolutions:["1080p"]}]}}};
assert.deepEqual(videoDurationOptions(scoped,"single_image").seconds,[5,10]);checks++;
assert.deepEqual(videoDurationOptions({...scoped,sources:{durationResolutionMap:"admin",modeParameters:"vendor"}},"single_image").seconds,range(4,30));checks++;
assert.deepEqual(videoDurationOptions({...scoped,modeParameters:{single_image:{durationResolutionMap:[]}}},"single_image").seconds,[]);checks++;
const cap:ResolvedVideoCapability={...capability(range(4,15)),durationResolutionMap:[{durations:range(4,10),resolutions:["4k","720p"]},{durations:range(11,15),resolutions:["720p"]}]};
const changed=reconcileVideoSettings({modelId:"fixture",mode:"text",durationSeconds:13,resolution:"4k"},cap);
assert.equal(changed.config.durationSeconds,13);assert.equal(changed.config.resolution,"720p");checks++;
const draft={video:{modelId:"fixture",durationSeconds:7}},snapshot=freezeCreationSettings(draft);
draft.video.durationSeconds=13;assert.equal(snapshot.video?.durationSeconds,7);
assert.equal((creationToolArguments("generate_video",{},snapshot).config as any).durationSeconds,7);checks++;
assert.equal(freezeCreationSettings({video:{durationSeconds:undefined}}).video?.durationSeconds,undefined);checks++;
console.log(`VIDEO_DURATION_OPTIONS=PASS checks=${checks} continuous=4-15,4-30,2-60 sparse=5,10,15 smart=undefined auto=-1 frozen_history=unchanged`);
