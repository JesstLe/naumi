import assert from "node:assert/strict";
import { imageParameterOptions, imageModelParameterOptions, imageCombinationSupported } from "../src/lib/imagegen/parameter-options";
import { canvasModelParameters, canvasCombinationSupported } from "../src/lib/canvas/generation-parameters";
import { freezeCreationSettings, creationToolArguments } from "../src/lib/agent/creation-settings";
import { videoParameterChoices, videoResolutions } from "../src/lib/video/parameter-options";
import { reconcileVideoSettings } from "../src/lib/video/client-settings";
import type { ResolvedVideoCapability } from "../src/lib/video/capability-schema";

let checks=0;
assert.equal(canvasModelParameters,imageParameterOptions);assert.equal(canvasCombinationSupported,imageCombinationSupported);checks++;
const defaults=imageModelParameterOptions({});
assert.deepEqual(defaults.ratios,["auto","1:1","2:3","3:2","3:4","4:3","9:16","16:9"]);checks++;
assert.deepEqual(imageModelParameterOptions({nativeResolutions:["2K"]}).resolutions,["2K"]);checks++;
assert.deepEqual(imageModelParameterOptions({nativeResolutions:["2K"],generationParameters:{resolutions:["4K"]}}).resolutions,["4K"]);checks++;
assert.deepEqual(imageModelParameterOptions({nativeResolutions:["2K"],generationParameters:{resolutions:[]}}).resolutions,[]);checks++;
assert.deepEqual(imageParameterOptions({ratios:[]}).ratios,["auto"]);checks++;
assert.deepEqual(imageParameterOptions({ratios:["21:9","4:5","4:5","bad","0:3"]}).ratios,["auto","21:9","4:5"]);checks++;
const parameters={ratios:["1:1","16:9"],resolutions:["1K","2K"],combinations:["1K:1:1","2K:16:9"]};
const frozen=structuredClone(parameters);
for(const [ratio,resolution,want] of [["1:1","1K",true],["16:9","1K",false],["16:9","2K",true],["auto","2K",true],[undefined,"2K",true],["16:9",undefined,true],["4:3",undefined,false],[undefined,undefined,true]] as const){
  assert.equal(imageCombinationSupported(parameters,ratio,resolution),want);checks++;
}
assert.equal(imageCombinationSupported({combinations:[]},undefined,undefined),false);checks++;
assert.deepEqual(parameters,frozen);checks++;
const snapshot=freezeCreationSettings({image:{modelId:"public-image",ratio:"16:9",resolution:"2K"}});
assert.deepEqual(creationToolArguments("generate_image",{prompt:"保持产品",ratio:"1:1"},snapshot),{prompt:"保持产品",model:"public-image",ratio:"16:9",resolution:"2K"});checks++;
assert.equal(creationToolArguments("generate_image",{ratio:"4:3"},freezeCreationSettings({image:{}})).ratio,"4:3");checks++;
assert.deepEqual(imageParameterOptions({ratios:["1:1"]}).ratios,["auto","1:1"]);
assert.deepEqual(imageParameterOptions({ratios:["16:9"]}).ratios,["auto","16:9"]);checks++;
console.log(`CREATION_IMAGE_PARAMETERS=PASS checks=${checks} shared_owner=true missing_ratios=8 explicit_empty=preserved combinations=honored historical_settings=unchanged`);

const cap:ResolvedVideoCapability={sources:{},modes:["text","single_image"],defaultDurationSeconds:4,aspectRatios:["16:9","9:16","1:1"],
  durationResolutionMap:[{durations:[4,5,6,7,8],resolutions:["480p","720p"]},{durations:[9,10,11,12],resolutions:["1080p","4k"]}],
  resolutionAspectRatios:{"4k":["16:9"],"1080p":["16:9","9:16"],"480p":["16:9"],"720p":["16:9","1:1"]},
  modeParameters:{single_image:{durationResolutionMap:[{durations:[5,10],resolutions:["1080p"]}],aspectRatios:["16:9","9:16"]}}};
let videoChecks=0;
assert.deepEqual(videoParameterChoices(cap,"text").resolutions,["480p","720p","1080p","4k"]);videoChecks++;
assert.deepEqual(videoResolutions(cap,undefined,"text"),[],"strict execution lookup remains strict");videoChecks++;
assert.deepEqual(videoParameterChoices(cap,"text",{durationSeconds:4}).resolutions,["480p","720p"]);videoChecks++;
assert.deepEqual(videoParameterChoices(cap,"text",{durationSeconds:9}).aspectRatios,["16:9","9:16"]);videoChecks++;
assert.deepEqual(videoParameterChoices(cap,"text",{durationSeconds:9,resolution:"4k"}).aspectRatios,["16:9"]);videoChecks++;
assert.deepEqual(videoParameterChoices(cap,"single_image").durations,[5,10]);videoChecks++;
const partial={modelId:"fixture",mode:"text" as const,resolution:"4k"};const before=structuredClone(partial);
const picked=reconcileVideoSettings(partial,cap).config;assert.equal(picked.durationSeconds,9);assert.equal(picked.resolution,"4k");assert.deepEqual(partial,before);videoChecks++;
assert.deepEqual(videoParameterChoices({durationResolutionMap:[],aspectRatios:[]},undefined),{durations:[],resolutions:[],aspectRatios:[]});videoChecks++;
const autoOnly={durationResolutionMap:[{durations:[-1],resolutions:["1080p"]}],supportsAutoDuration:false};assert.deepEqual(videoParameterChoices(autoOnly,undefined).resolutions,[]);videoChecks++;
assert.deepEqual(videoParameterChoices({...autoOnly,supportsAutoDuration:true},undefined).resolutions,["1080p"]);videoChecks++;
console.log(`CREATION_VIDEO_PARAMETERS=PASS checks=${videoChecks} partial_choices=visible mode_scope=preserved resolution_first=honored strict_execution=unchanged`);
