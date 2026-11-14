import assert from 'node:assert/strict';
import {videoRuntimeFormats as formats} from '../src/lib/video/runtime-formats';
import {compileVideoRequest,readCompiledVideoPlan} from '../src/lib/video/compile';
import {emptyVideoExecutionPolicy,type VideoModelProfile} from '../src/lib/video/execution-contract';
import {publishedVideoExecutionSchema} from '../src/lib/video/published-execution';
import {hasVersionedVideoSubmission} from '../src/lib/video/submission-state';

let checks=0;
for(const version of formats.compiledPlanVersions){
 const structured=version===2||version===5,workflow=version===3;
 const profileId=version>=4?'native-video':workflow?'workflow-video':'json-video';
 const profile:VideoModelProfile={profileId,version:1,
  describe:b=>({ok:true,value:{profileId:b.profileId,profileVersion:b.profileVersion,bindingRevision:b.revision,description:{}}}),
  compile:d=>({ok:true,value:{intent:workflow?'workflow':'text',effectiveParameters:{},consumedInputIds:[],
   ...(structured?{consumedStructure:{shots:['shot'],elements:[]}}:{}),
   wireTemplate:{method:'POST',path:'/fixture-only',encoding:workflow?'workflow':'json',body:{}},
   billingFacts:{durationSeconds:4,resolution:'720p',aspectRatio:'16:9'}}}),
 };
 const result=compileVideoRequest({profile,binding:{publicModelId:'public',wireModel:'wire',connectionId:'connection',revision:1,profileId,profileVersion:1,recipe:{}},
  policy:emptyVideoExecutionPolicy(),draft:{scope:{actorId:'actor',projectKey:null},prompt:'fixture',parameters:{},inputs:[],
   ...(structured?{structure:{shots:[{id:'shot',prompt:'fixture',durationSeconds:4}]}}:{})}});
 assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)throw Error('compile');
 assert.equal(result.value.schemaVersion,version);
 assert.equal(readCompiledVideoPlan(JSON.parse(JSON.stringify(result.value))).ok,true);checks+=3;
}
for(const option of publishedVideoExecutionSchema.options){
 assert.equal(formats.publishedProfileVersions[option.shape.profileId.value],option.shape.profileVersion.value);checks++;
}
for(const version of formats.taskParameterVersions){
 assert.equal(hasVersionedVideoSubmission({version}),version===2||version===3);checks++;
}
assert.equal(readCompiledVideoPlan({schemaVersion:6}).ok,false);checks++;
assert.equal(hasVersionedVideoSubmission({version:4}),false);checks++;
assert.equal(Object.isFrozen(formats),true);checks++;
assert.equal(Object.isFrozen(formats.compiledPlanVersions),true);checks++;
console.log('VIDEO_RUNTIME_FORMATS=PASS CHECKS='+checks+' PLAN_VERSIONS=1,2,3,4,5 MODEL_CAPABILITY_GATES=0 IO=0');
