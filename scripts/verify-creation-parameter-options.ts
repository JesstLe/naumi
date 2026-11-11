import assert from "node:assert/strict";
import { imageParameterOptions, imageModelParameterOptions, imageCombinationSupported } from "../src/lib/imagegen/parameter-options";
import { canvasModelParameters, canvasCombinationSupported } from "../src/lib/canvas/generation-parameters";
import { freezeCreationSettings, creationToolArguments } from "../src/lib/agent/creation-settings";

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
