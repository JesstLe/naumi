import assert from "node:assert/strict";
import {workbenchModelOptions,workbenchModelSelection} from "../src/lib/reference-workbench/model-options";
import {routeImageModel} from "../src/lib/image-model-routing";
const suffixes=["three-four","landscape","four-three","square","portrait"];
const models=[{id:"gpt-image-2",label:"GPT-Image-2.5"},
 ...suffixes.map(s=>({id:`gemini-3.0-pro-image-${s}`,label:"Nano Banana Pro"})),
 ...suffixes.map(s=>({id:`gemini-3.1-flash-image-${s}`,label:"Nano Banana 2"})),
 ...["portrait","landscape"].map(s=>({id:`imagen-4.0-generate-preview-${s}`,label:"Imagen-4"})),
 {id:"gpt-image-2.5-flare",label:"GPT"},{id:"gpt-image-2.5-sunburst",label:"GPT"},
 {id:"custom-portrait",label:"Custom"},{id:"custom-landscape",label:"Custom"}];
const before=JSON.stringify(models),options=workbenchModelOptions(models);
assert.equal(options.length,7);assert.equal(options.filter(m=>m.label==="Nano Banana Pro").length,1);
assert.equal(options.filter(m=>m.label==="Nano Banana 2").length,1);assert.equal(options.filter(m=>m.label==="Imagen-4").length,0);
assert.equal(options.filter(m=>m.label==="GPT").length,2,"same label is not a routing identity");
assert.equal(options.filter(m=>m.label==="Custom").length,2,"unknown custom IDs must remain separate");
for(const [prefix,label] of [["gemini-3.0-pro-image","Nano Banana Pro"],["gemini-3.1-flash-image","Nano Banana 2"]]){
 const option=options.find(m=>m.label===label)!;
 for(const model of models.filter(m=>m.id.startsWith(prefix+"-")))assert.equal(workbenchModelSelection(model.id,options),option.id);
 for(const [ratio,suffix] of [["1:1","square"],["3:4","three-four"],["4:3","four-three"],["9:16","portrait"],["16:9","landscape"]]){
  const expected=`${prefix}-${suffix}`;
  assert.equal(routeImageModel(option.id,ratio,models),models.some(m=>m.id===expected)?expected:option.id);
 }
}
assert.equal(workbenchModelSelection("",options),"");assert.equal(workbenchModelSelection("deleted-model",options),"");
assert.equal(workbenchModelSelection("imagen-4.0-generate-preview-portrait",options),"");
assert.deepEqual(workbenchModelOptions([]),[]);assert.deepEqual(workbenchModelOptions(options),options,"server+browser compaction is idempotent");
assert.equal(JSON.stringify(models),before,"input config remains unchanged");
console.log("WORKBENCH_MODEL_OPTIONS=PASS INPUT17 OUTPUT7 FAMILY2 SAVED_IDS10 ROUTING10 IMAGEN4_HIDDEN=1 DISTINCT_SAME_LABEL=1 CONFIG_UNCHANGED=1");
