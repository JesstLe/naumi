import assert from "node:assert/strict";
import {inspectContinuity,continuityPrompt,type ContinuityBinding} from "../src/lib/storyboard/continuity";
import {storyboardDocumentSchema,type StoryboardDocument} from "../src/lib/storyboard/plan";
import {createRoughcut,replaceRoughcutTakes,spokenDuration} from "../src/lib/storyboard/production";
import type {TimelineMaterial} from "../src/lib/canvas/timeline-node-schema";
const character:ContinuityBinding={identity:"character:girl#base",kind:"character",nodeId:"girl",variantId:"base",revision:1,title:"女孩 · 默认",text:"湿外套",artworkIds:[]};
const state=(value:string)=>({subject:"女孩",attribute:"持手机的手",value});
const doc:StoryboardDocument=storyboardDocumentSchema.parse({title:"车站",assemble:true,shots:[
  {nodeId:"a",number:"01",scene:"station",adoptedArtworkId:"old-a",takes:[{artworkId:"old-a",taskId:"ta",status:"approved",note:""}],cut:{inPoint:.5,duration:2},continuity:{bindings:[character],before:[state("左手")],after:[state("左手")]}},
  {nodeId:"b",number:"02",scene:"station",adoptedArtworkId:"old-b",takes:[{artworkId:"old-b",taskId:"tb",status:"approved",note:""}],continuity:{transition:"match",bindings:[character],before:[state("右手")],after:[]}},
],audio:[{id:"music",artworkId:"music",position:0,inPoint:1,duration:5,gain:.5}]});
const media=(artworkId:string,durationSeconds=4,kind:"video"|"audio"="video"):TimelineMaterial=>({artworkId,durationSeconds,kind,hasAudio:true,url:`/media/${artworkId}.mp4`,key:artworkId,sha256:"a".repeat(64)});
let checks=0;const pass=()=>checks++;
assert.equal(inspectContinuity(doc,[character],{b:["a"]}).filter(issue=>issue.kind==="state").length,1);pass();
assert.equal(inspectContinuity(doc,[{...character,revision:2}],{b:["a"]}).filter(issue=>issue.kind==="changed").length,2);assert.equal(doc.shots[0].continuity!.bindings[0].revision,1);pass();
assert.equal(inspectContinuity(doc,[character]).filter(issue=>issue.kind==="dependency").length,1);pass();
const independent=structuredClone(doc);independent.shots[1].continuity!.transition="independent";assert.equal(inspectContinuity(independent,[character]).length,0);pass();
assert.equal(inspectContinuity(doc,[],{b:["a"]}).filter(issue=>issue.kind==="missing").length,2);pass();
assert.match(continuityPrompt(doc.shots[0].continuity),/开始状态：女孩 · 持手机的手：左手/);pass();
assert.equal(spokenDuration("一二三四五六"),2);assert.equal(spokenDuration("one two three four five"),2);pass();
const materials=[media("old-a"),media("old-b"),media("music",10,"audio")],cut=createRoughcut(doc,materials,id=>`shot-${id}`);
assert.deepEqual(cut.project.tracks[0].clips.map(clip=>[clip.artworkId,clip.position,clip.inPoint,clip.duration]),[["old-a",0,.5,2],["old-b",2,0,4]]);pass();
assert.equal(cut.project.tracks[1].clips[0].position,0);assert.equal(cut.project.tracks[1].clips[0].inPoint,1);assert.equal(cut.project.tracks[1].clips[0].gain,.5);pass();
const current=structuredClone(cut.project);current.tracks[0].clips[0].duration=1.5;current.tracks[0].clips[0].gain=.3;current.tracks[0].clips[1].position=3;current.tracks[1].clips[0].position=.7;
const next=structuredClone(doc);next.shots[0].adoptedArtworkId="new-a";const link={timelineId:"cut",revision:1,title:"cut",clips:cut.clips};
const updated=replaceRoughcutTakes(current,link,next,[media("new-a",3)],["a"]);
assert.equal(updated.project.tracks[0].clips[0].artworkId,"new-a");assert.equal(updated.project.tracks[0].clips[0].duration,1.5);assert.equal(updated.project.tracks[0].clips[0].gain,.3);pass();
assert.deepEqual(updated.project.tracks[0].clips[1],current.tracks[0].clips[1]);assert.deepEqual(updated.project.tracks[1],current.tracks[1]);assert.equal(current.tracks[0].clips[0].artworkId,"old-a");pass();
assert.throws(()=>replaceRoughcutTakes(current,link,next,[media("new-a",1)],["a"]),/新版较短/);pass();
const edited=structuredClone(current);edited.tracks[0].clips[0].artworkId="manual";assert.throws(()=>replaceRoughcutTakes(edited,link,next,[media("new-a")],["a"]),/多轨中修改/);pass();
edited.tracks[0].clips=[];assert.throws(()=>replaceRoughcutTakes(edited,link,next,[media("new-a")],["a"]),/已从粗剪移除/);pass();
const tooLong=structuredClone(doc);tooLong.shots[0].cut!.duration=8;assert.throws(()=>createRoughcut(tooLong,materials,id=>id),/裁剪超出/);pass();
assert.throws(()=>createRoughcut(doc,[media("old-a"),media("old-b"),{...media("music",10,"audio"),hasAudio:false}],id=>id),/没有可用音轨/);pass();
assert.equal(storyboardDocumentSchema.parse({title:"旧方案",shots:[{nodeId:"legacy",number:"01"}]}).shots[0].continuity,undefined);pass();
console.log(`STORYBOARD_PRODUCTION=PASS CHECKS=${checks} CONTINUITY=ADVISORY ROUGHCUT_EDITS=PRESERVED NETWORK=0`);
