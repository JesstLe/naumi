import assert from "node:assert/strict";
import {settings,WorkbenchError,type Asset} from "../src/lib/reference-workbench/contract";
import {chatPlanInstruction,parseChatPlan,textFailureState} from "../src/lib/reference-workbench/chat-plan";

// Case 47: pure-text "生成小猫" chat send had inputs=[] while the model returned a valid plan
// with image_indices=[0]; parse rejection outside the billing wrapper was then mislabeled
// maybe_submitted. These checks stay offline: no DB, no model calls, billing untouched.
const cfg=settings({ratio:"1:1"}),assets:Asset[]=[{artworkId:"a1",url:"/api/reference-workbench/image?path=a1",width:800,height:800,relative:"产品图/a.png"},{artworkId:"a2",url:"/api/reference-workbench/image?path=a2",width:1200,height:900,relative:"主图/b.png"}];
const wire47='{"action":"generate","reply":"好的！我将为您生成一张可爱的小猫图片","tasks":[{"name":"可爱小猫","prompt":"一只毛茸茸的橘色小猫","ratio":"1:1","image_indices":[0]}]}';

// No images: non-negative integer references normalize to [] (text-to-image needs no input).
assert.deepEqual(parseChatPlan(wire47,[],cfg).tasks,[{name:"可爱小猫",prompt:"一只毛茸茸的橘色小猫",ratio:"1:1",image_indices:[]}]);
assert.deepEqual(parseChatPlan(wire47.replace("[0]","[]"),[],cfg).tasks[0].image_indices,[]);
assert.deepEqual(parseChatPlan(wire47.replace("[0]","[1,1,0]"),[],cfg).tasks[0].image_indices,[]);
// Negative or non-integer references stay invalid even without images.
for(const bad of ["[-1]",'["0"]',"[0.5]"])assert.throws(()=>parseChatPlan(wire47.replace("[0]",bad),[],cfg),WorkbenchError);

// With images: existing strict validation is unchanged.
assert.deepEqual(parseChatPlan(wire47,assets,cfg).tasks[0].image_indices,[0]);
assert.deepEqual(parseChatPlan(wire47.replace("[0]","[1,0,1]"),assets,cfg).tasks[0].image_indices,[1,0]);
assert.throws(()=>parseChatPlan(wire47.replace("[0]","[2]"),assets,cfg),WorkbenchError);
assert.throws(()=>parseChatPlan(wire47.replace("[0]","[-1]"),assets,cfg),WorkbenchError);

// Malformed model output fails locally before any image submission.
for(const bad of ["好的！我将为您生成小猫",'{"action":"generate","reply":"x","tasks":[{"name":"n","prompt":"p","ratio":"1:1"}]}','{"action":"delete","reply":"x"}'])assert.throws(()=>parseChatPlan(bad,assets,cfg),WorkbenchError);
assert.equal(parseChatPlan('```json\n{"action":"reply","reply":"光影问题","tasks":[]}\n```',assets,cfg).tasks.length,0);

// Failure classification: only an in-flight request is maybe_submitted; before submit and
// after a settled response are local failures that must never resubmit or ask to re-check.
assert.deepEqual(textFailureState("upstream",new Error("network broken")),{state:"maybe_submitted",error:"文字任务结果需要核查，请查询原任务；未重复调用"});
assert.equal(textFailureState("prepare",new Error("signing failed")).state,"failed");
assert.match(textFailureState("prepare",new Error("signing failed")).error,/未调用模型/);
const settled=textFailureState("settled",new WorkbenchError("生成计划提示词或引用无效",502));
assert.equal(settled.state,"failed");assert.equal(settled.error,"生成计划提示词或引用无效");
assert.match(textFailureState("settled",new Error("body unreadable")).error,/结果解析失败/);

// System prompt reflects the actual image count instead of a fixed [0] example.
const noImage=chatPlanInstruction([],0);
assert.match(noImage,/image_indices":\[\]\}/);assert.doesNotMatch(noImage,/image_indices":\[0\]/);assert.match(noImage,/image_indices必须为\[\]/);
const withImages=chatPlanInstruction([{role:"user",text:"换个背景"}],2);
assert.match(withImages,/image_indices":\[0\]/);assert.match(withImages,/必须小于2（当前输入2张图片）/);assert.match(withImages,/换个背景/);

console.log("PASS chat-plan parse/classification: no-image [0]/[] normalization, strict image index validation, malformed JSON rejection, prepare/upstream/settled failure states, dynamic image-count prompt; offline, model calls=0");
