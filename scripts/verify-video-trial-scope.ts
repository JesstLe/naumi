import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {createHash} from "node:crypto";
async function main(){
 if(!existsSync("scripts/video-trials/scope.ts")){console.log("VIDEO_TRIAL_SCOPE=FAIL SCOPE_AND_LIVE_ADMISSION_MISSING");process.exitCode=1;return;}
 const {inspectTrialScope}=await import("./video-trials/scope");const root="docs/acceptance/canvas-video-vv01-20261110/",scope=JSON.parse(readFileSync(root+"trial-scope.json","utf8")),catalog=JSON.parse(readFileSync(root+"live-catalog.json","utf8")),script=readFileSync(root+"original-script.txt");let checks=0;const pass=()=>checks++;
 assert.equal(createHash("sha256").update(script).digest("hex"),scope.source.sha256);pass();
 const report=inspectTrialScope(scope,catalog,script.toString("utf8"));assert.equal(report.totalCreditCeiling,120);assert.equal(report.admittedShots.length,3);assert.equal(report.videoTaskUpperBound,5);pass();
 assert.equal(report.configurationConflict,"FRAME_UNSUPPORTED");assert.equal(report.nativeMultiShotModels,0);assert.equal(report.realPaidCalls,0);pass();
 const bad=structuredClone(scope);bad.budget.totalCeiling=119;assert.throws(()=>inspectTrialScope(bad,catalog,script.toString("utf8")));pass();
 const retry=structuredClone(scope);retry.budget.automaticRetries=1;assert.throws(()=>inspectTrialScope(retry,catalog,script.toString("utf8")));pass();
 const ids=structuredClone(scope);ids.clientOperationIds.frame=ids.clientOperationIds.plan;assert.throws(()=>inspectTrialScope(ids,catalog,script.toString("utf8")));pass();
 const guessed=structuredClone(scope);guessed.execution.modelId="not-in-published-catalog";assert.throws(()=>inspectTrialScope(guessed,catalog,script.toString("utf8")));pass();
 const moved=structuredClone(scope);moved.shots[0].mapping.ranges=[];assert.throws(()=>inspectTrialScope(moved,catalog,script.toString("utf8")));pass();
 const dialogue=structuredClone(scope);dialogue.shots[1].mapping.dialogue=structuredClone(dialogue.shots[2].mapping.dialogue);assert.throws(()=>inspectTrialScope(dialogue,catalog,script.toString("utf8")));pass();
 for(const [key,value]of [["maxVideoTasks",-1],["maxMediaJobs",0.5],["perVideoCeiling",null],["perMediaCeiling",-10],["totalCeiling",Number.MAX_SAFE_INTEGER+1]]as const){const invalid=structuredClone(scope);invalid.budget[key]=value;assert.throws(()=>inspectTrialScope(invalid,catalog,script.toString("utf8")));pass();}
 console.log(JSON.stringify(report));console.log(`VIDEO_TRIAL_SCOPE=PASS checks=${checks} REAL_PAID_CALLS=0 BUDGET_CREDITS=120 CONFIG_CONFLICT=FRAME_UNSUPPORTED`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
