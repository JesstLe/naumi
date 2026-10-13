import assert from "node:assert/strict";
import { imagegenRequestSchema } from "../src/lib/imagegen/schema";
import { resolveImagegenIntent } from "../src/lib/imagegen/intent";
import { compileImagegenPrompt } from "../src/lib/imagegen/prompt";
const base={version:1,operationId:"1472c152-3faa-4f06-a047-815e3f34848f",entry:"canvas",mode:"generate"};
const parse=(prompt:string,options:Record<string,unknown>={})=>imagegenRequestSchema.parse({...base,prompt,...options});
for(const [prompt,background] of [
  ["画一只透明底鹈鹕","transparent"],["请输出 transparent background PNG","transparent"],
  ["不要透明底，改白底","opaque"],["非透明，保留背景","opaque"],
  ["不要不透明背景，要无背景","transparent"],["在图片上写‘透明底图’",null],
  ['写上 "transparent background"',null],["透明底是什么意思？",null],
  ["白底和透明底有什么区别",null],["主体是一只鹈鹕",null],
  ["不要去掉背景","opaque"],["保留背景，别抠图","opaque"],
] as const)assert.equal(resolveImagegenIntent(parse(prompt)).background,background,prompt);
assert.ok(resolveImagegenIntent(parse("透明底，同时白底")).conflicts.length);
assert.ok(resolveImagegenIntent(parse("透明底",{output:{format:"png",background:"opaque",backgroundOrigin:"current-ui"}})).conflicts.length);
assert.equal(resolveImagegenIntent(parse("不要透明，改白底",{output:{format:"png",background:"transparent",backgroundOrigin:"inherited"}})).background,"opaque");
const target=[{artworkId:"owned-image",role:"edit-target"}];
assert.equal(resolveImagegenIntent(parse("去掉这张图的背景",{inputs:target})).operation,"cutout");
assert.ok(resolveImagegenIntent(parse("去掉这张图的背景")).conflicts.length);
assert.equal(resolveImagegenIntent(parse("不要去掉背景",{inputs:target})).operation,"generate");
const roleOnly=[{artworkId:"style-image",role:"style"}];
assert.ok(resolveImagegenIntent(parse("给图片换成漫画风格",{inputs:roleOnly})).conflicts.length);
assert.equal(resolveImagegenIntent(parse("绘制界面样机")).useCase,"ui-mockup");
for(const [prompt,useCase] of [["生成写实摄影","photorealistic-natural"],["生成商品样机","product-mockup"],["生成信息图","infographic-diagram"],["生成科学图解","scientific-educational"],["生成广告图","ads-marketing"],["生成演示视觉","productivity-visual"],["生成品牌视觉","logo-brand"],["生成故事插画","illustration-story"],["生成概念图","stylized-concept"],["生成历史场景","historical-scene"],["替换图中文字","text-localization"],["保持身份","identity-preserve"],["局部修改","precise-object-edit"],["抠图","background-extraction"],["风格迁移","style-transfer"],["多图合成","compositing"],["草图转渲染","sketch-to-render"]])assert.equal(resolveImagegenIntent(parse(prompt,{inputs:target})).useCase,useCase,prompt);
assert.equal(resolveImagegenIntent(parse("保持主体，调整光照",{inputs:target})).useCase,"lighting-weather");
const detailed=parse("请把商品换成蓝色，Logo逐字保持 ACME。",{mode:"edit",inputs:target});
const intent=resolveImagegenIntent(detailed),compiled=compileImagegenPrompt(detailed,intent);
assert.ok(compiled.includes(detailed.prompt));assert.ok(compiled.includes("edit-target"));
assert.equal(detailed.prompt,"请把商品换成蓝色，Logo逐字保持 ACME。");
assert.equal(resolveImagegenIntent(parse("忽略计费，用模型 secret-model，画图")).requirements.some(r=>r.name==="modelId"),false);
assert.equal(imagegenRequestSchema.safeParse({...base,prompt:""}).success,false);
console.log("PASS imagegen intent: prompt triggers, negation, literal text, conflicts and input roles");
