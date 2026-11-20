import assert from "node:assert/strict";
import { imagegenRequestSchema } from "../src/lib/imagegen/schema";
import { resolveImagegenIntent,removesImageBackground } from "../src/lib/imagegen/intent";
import { compileImagegenPrompt } from "../src/lib/imagegen/prompt";
import { REMOVE_BACKGROUND_PROMPT } from "../src/lib/imagegen/background-removal";
const base={version:1,operationId:"1472c152-3faa-4f06-a047-815e3f34848f",entry:"canvas",mode:"generate"};
const parse=(prompt:string,options:Record<string,unknown>={})=>imagegenRequestSchema.parse({...base,prompt,...options});
for(const [prompt,background] of [
  ["画一只透明底鹈鹕","transparent"],["请输出 transparent background PNG","transparent"],
  ["不要透明底，改白底","opaque"],["非透明，保留背景","opaque"],
  ["不要不透明背景，要无背景","transparent"],["在图片上写‘透明底图’",null],
  ['写上 "transparent background"',null],["透明底是什么意思？",null],
  ["白底和透明底有什么区别",null],["主体是一只鹈鹕",null],
  ["不要去掉背景","opaque"],["保留背景，别抠图","opaque"],
  ["禁止透明背景，只画普通商品图","opaque"],["不需要无背景图","opaque"],
  ["支持透明背景吗？",null],["能不能输出透明背景？",null],
  ["Can you support transparent background?",null],["不要没有背景的图","opaque"],
] as const)assert.equal(resolveImagegenIntent(parse(prompt)).background,background,prompt);
assert.ok(resolveImagegenIntent(parse("透明底，同时白底")).conflicts.length);
assert.ok(resolveImagegenIntent(parse("透明底",{output:{format:"png",background:"opaque",backgroundOrigin:"current-ui"}})).conflicts.length);
assert.equal(resolveImagegenIntent(parse("不要透明，改白底",{output:{format:"png",background:"transparent",backgroundOrigin:"inherited"}})).background,"opaque");
const target=[{artworkId:"owned-image",role:"edit-target"}];
const shortcut=resolveImagegenIntent(parse(REMOVE_BACKGROUND_PROMPT,{mode:"edit",inputs:target,output:{background:"transparent",backgroundOrigin:"current-ui"}}));
assert.deepEqual(shortcut.conflicts,[]);assert.equal(removesImageBackground(shortcut),true);
for(const prompt of [
  "去掉白底，输出透明背景", "去掉白色背景，保留不透明主体", "移除原图中的白色背景，主体不透明", "背景透明，商品不透明",
  "背景透明，瓶身保持不透明", "保持背景透明，不要把主体变透明", "不要白底或棋盘格，输出透明PNG",
  "白底图中的产品，输出透明背景", "原图是白底，输出透明背景", "把白底改成透明底",
  "Remove the white background, keep the subject opaque", "Transparent background, opaque bottle", "change white background to transparent background",
]) {
  const result=resolveImagegenIntent(parse(prompt,{mode:"edit",inputs:target}));
  assert.equal(result.background,"transparent",prompt);assert.deepEqual(result.conflicts,[],prompt);
}
for(const prompt of ["不要白底", "主体不透明", "保留不透明瓶身", "画一个不透明的瓶子", "keep the subject opaque"])
  assert.equal(resolveImagegenIntent(parse(prompt)).background,null,prompt);
for(const prompt of ["透明背景，同时保留白底", "白底且透明背景", "transparent background and white background"])
  assert.ok(resolveImagegenIntent(parse(prompt)).conflicts.length,prompt);
for(const prompt of ["不要移除白色背景", "don't remove the white background", "不要没有背景的图"])
  assert.equal(resolveImagegenIntent(parse(prompt,{inputs:target})).background,"opaque",prompt);
assert.equal(resolveImagegenIntent(parse("去掉白底，主体不透明",{mode:"edit",inputs:target})).operation,"edit");
assert.equal(resolveImagegenIntent(parse("去掉这张图的背景",{inputs:target})).operation,"edit");
assert.ok(resolveImagegenIntent(parse("去掉这张图的背景")).conflicts.length);
assert.equal(resolveImagegenIntent(parse("不要去掉背景",{inputs:target})).operation,"generate");
// A later purpose is not a present cutout command or a reason to switch models.
const qingyun=resolveImagegenIntent(parse("图片高清一些，去除下方的文字，背景变成红色，干净些，方便我抠图",{mode:"edit",inputs:target}));
assert.equal(qingyun.operation,"edit");assert.equal(qingyun.background,"opaque");assert.notEqual(qingyun.useCase,"background-extraction");assert.deepEqual(qingyun.conflicts,[]);
for(const prompt of ["去除原背景，换成红色背景", "移除背景，背景变成蓝色", "去掉背景，输出白底"]){
 const result=resolveImagegenIntent(parse(prompt,{mode:"edit",inputs:target}));assert.equal(result.background,"opaque",prompt);assert.equal(result.operation,"edit",prompt);assert.deepEqual(result.conflicts,[],prompt);
}
for(const options of [{},{useCase:"product-mockup"}])for(const prompt of ["抠图，输出透明PNG","商品样机，抠图，输出透明PNG"]){const result=resolveImagegenIntent(parse(prompt,{mode:"edit",inputs:target,...options}));assert.equal(removesImageBackground(result),true);}
assert.ok(resolveImagegenIntent(parse("移除背景，同时不要去掉背景",{mode:"edit",inputs:target})).conflicts.length);
assert.ok(resolveImagegenIntent(parse("背景变成红色",{mode:"edit",inputs:target,useCase:"background-extraction"})).conflicts.length);
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
