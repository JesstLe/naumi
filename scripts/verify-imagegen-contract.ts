import assert from "node:assert/strict";
import { IMAGEGEN_USE_CASES } from "../src/lib/imagegen/catalog";
import { imagegenRequestSchema } from "../src/lib/imagegen/schema";
import { OFFICIAL_IMAGE_SKILLS, validateSkillDraft, validateSkillSelection } from "../src/lib/image-skills/catalog";

const expected=["photorealistic-natural","product-mockup","ui-mockup","infographic-diagram","scientific-educational","ads-marketing","productivity-visual","logo-brand","illustration-story","stylized-concept","historical-scene","text-localization","identity-preserve","precise-object-edit","lighting-weather","background-extraction","style-transfer","compositing","sketch-to-render"];
assert.deepEqual(IMAGEGEN_USE_CASES.map(x=>x.id),expected);
const original=["product-white","product-scene","product-suite","product-retouch","product-angle","product-color","campaign-poster","ad-creative","brand-visual","packaging","social-cover","social-series"];
for(const id of original){const skill=OFFICIAL_IMAGE_SKILLS.find(x=>x.id===`official:${id}`);assert.ok(skill);assert.equal(skill.revision,1);assert.equal(validateSkillSelection(skill)?.id,skill.id);}
assert.equal(new Set(OFFICIAL_IMAGE_SKILLS.map(x=>x.id)).size,OFFICIAL_IMAGE_SKILLS.length);
for(const useCase of IMAGEGEN_USE_CASES)assert.ok(OFFICIAL_IMAGE_SKILLS.some(s=>s.useCase===useCase.id));
assert.ok(validateSkillDraft({name:"我的流程",description:"历史个人技能",category:"电商",instructions:"保留商品外形和颜色，使用站内生成工具"}));
const base={version:1,operationId:"1472c152-3faa-4f06-a047-815e3f34848f",entry:"canvas",mode:"generate",prompt:"鹈鹕"};
const parsed=imagegenRequestSchema.parse(base);
assert.equal(parsed.variants,1);assert.deepEqual(parsed.inputs,[]);assert.equal(parsed.output.format,"png");
for(const mutation of [{mode:"exec-python"},{apiKey:"secret"},{inputs:[{artworkId:"x",role:"execute"}]},{output:{format:"png",compression:101}},{variants:5},{useCase:"unregistered"},{parameters:{width:100000,height:100000}},{batch:{items:Array.from({length:101},(_,i)=>({key:`k${i}`,name:"n",prompt:"p"})),concurrency:5,maxAttempts:3,failFast:false}}])assert.equal(imagegenRequestSchema.safeParse({...base,...mutation}).success,false);
assert.equal(imagegenRequestSchema.parse({...base,output:{format:"webp",compression:0}}).output.compression,0);
assert.equal(imagegenRequestSchema.safeParse({...base,inputs:[{artworkId:"owned",role:"mask"}]}).success,false);
assert.equal(imagegenRequestSchema.safeParse({...base,mode:"edit",inputs:[{artworkId:"owned",role:"style"}]}).success,false);
assert.equal(imagegenRequestSchema.safeParse({...base,mode:"edit",inputs:[{artworkId:"owned",role:"edit-target"},{artworkId:"mask",role:"mask"}]}).success,true);
console.log("PASS imagegen contract: 19 workflows, legacy IDs, role and resource boundaries");
