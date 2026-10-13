import { imagegenUseCase, type ImagegenUseCase } from "./catalog";
import type { ImagegenRequest, Intent } from "./types";

// Only the user's current request is parsed. Quoted artwork text is not an instruction.
function instructions(prompt:string) {
  return prompt.replace(/```[\s\S]*?```/g," ").replace(/`[^`]*`|“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』|"[^"\n]*"|'[^'\n]*'/g," ")
    .split(/[，,。.;；!！?？\n]+/).map(s=>s.trim()).filter(Boolean)
    .filter(s=>!/(是什么意思|是什么|区别|如何理解|解释一下|能不能|能否|是否支持|(?:支持|可以).{0,30}(?:吗|么)$|what\s+(?:does|is)|difference\s+between|explain\b|(?:can|do|does)\s+(?:you|it|this|the\s+model)\s+(?:support|produce|output))/i.test(s));
}
const aliases:readonly [ImagegenUseCase,RegExp][]=[
  ["photorealistic-natural",/写实摄影|真实摄影|photorealistic/i],
  ["product-mockup",/商品样机|包装样机|product mockup/i],
  ["ui-mockup",/界面样机|界面视觉|ui mockup/i],
  ["infographic-diagram",/信息图|流程图|infographic/i],
  ["scientific-educational",/科学图解|教育图解|scientific diagram/i],
  ["ads-marketing",/广告图|营销海报|广告视觉|marketing visual/i],
  ["productivity-visual",/演示视觉|业务图解|presentation visual/i],
  ["logo-brand",/品牌视觉|logo设计|设计logo|brand visual/i],
  ["illustration-story",/故事插画|漫画分镜|story illustration/i],
  ["stylized-concept",/概念图|概念设计|concept art/i],
  ["historical-scene",/历史场景|古代场景|historical scene/i],
  ["text-localization",/替换(?:图片|图中)?文字|文字本地化|翻译图中文字|localize.*text/i],
  ["identity-preserve",/保持身份|保持人脸|人物试穿|preserve identity/i],
  ["precise-object-edit",/局部修改|局部编辑|精确编辑|商品换色|给商品换色|precise.*edit/i],
  ["lighting-weather",/调整光照|更改天气|改变天气|change lighting/i],
  ["background-extraction",/抠图|(?:移除|去掉|去除|删除).{0,10}背景|remove.{0,10}background/i],
  ["style-transfer",/换成.{0,12}风格|风格迁移|style transfer/i],
  ["compositing",/多图合成|合成这些图|composite.*images/i],
  ["sketch-to-render",/草图转渲染|渲染草图|sketch.to.render/i],
];
const negative=/不要|无需|别|不需要|禁止|\b(?:don't|do not|no need|without)\b/i;
function clauseBackground(clause:string):Intent["background"] {
  if(/不要不透明|非不透明/i.test(clause))return "transparent";
  if(/(?:不要|别|无需|不需要|禁止).{0,8}(?:透明|无背景|没有背景|抠图|(?:去掉|移除|去除).{0,8}背景)/i.test(clause))return "opaque";
  if(/不要不透明|非不透明|无背景|没有背景|\bno background\b/i.test(clause))return "transparent";
  if(/(?:不要|别|无需|不需要).{0,8}(?:透明|抠图|(?:去掉|移除|去除).{0,8}背景)|非透明|不透明|保留背景|白底|(?:纯)?白色背景|opaque|white background|(?:don't|do not).{0,12}(?:remove|transparent)/i.test(clause))return "opaque";
  if(/透明(?:底|背景)|背景(?:为|是|要)?透明|transparent\s+(?:background|png)|抠图|(?:移除|去掉|去除|删除).{0,10}背景|remove.{0,10}background/i.test(clause))return "transparent";
  return null;
}
export function resolveImagegenIntent(request:ImagegenRequest):Intent {
  const clauses=instructions(request.prompt), backgrounds=new Set(clauses.map(clauseBackground).filter((v):v is "transparent"|"opaque"=>v!==null));
  const conflicts:string[]=[];
  if(backgrounds.size>1)conflicts.push("提示词同时要求透明和不透明背景，请明确保留哪一种");
  const promptBackground=backgrounds.size===1?[...backgrounds][0]:null;
  const uiBackground=request.output.background??null;
  if(promptBackground&&uiBackground&&promptBackground!==uiBackground&&request.output.backgroundOrigin==="current-ui")conflicts.push("提示词背景要求与本次选择的背景选项冲突");
  const background=promptBackground??uiBackground;
  const positiveClauses=clauses.filter(s=>!negative.test(s));
  const candidates=aliases.filter(([,pattern])=>positiveClauses.some(s=>pattern.test(s)));
  // Multiple stylistic categories are valid; useCase is a workflow hint, never a permission.
  const useCase=request.useCase??candidates[0]?.[0];
  const target=request.inputs.some(i=>i.role==="edit-target");
  let operation:Intent["operation"]=request.mode==="batch"?"generate":request.mode;
  const cutout=positiveClauses.some(s=>/抠图|(?:移除|去掉|去除|删除).{0,10}背景|remove.{0,10}background/i.test(s));
  if(cutout&&request.mode!=="postprocess")operation="cutout";
  else if(imagegenUseCase(useCase)?.mode==="edit"&&target&&request.mode!=="postprocess")operation="edit";
  if((operation==="cutout"||imagegenUseCase(useCase)?.mode==="edit")&&!target)conflicts.push("该编辑要求需要一个编辑目标，请选择要修改的图片");
  const requirements:Intent["requirements"]=[];
  if(background)requirements.push({name:"background",value:background,source:promptBackground?"prompt":request.output.backgroundOrigin==="skill"?"skill":"ui"});
  if(useCase)requirements.push({name:"useCase",value:useCase,source:request.useCase?"ui":"prompt"});
  if(request.inputs.some(i=>i.role==="mask"))requirements.push({name:"mask",value:"required",source:"ui"});
  for(const [name,value] of Object.entries(request.parameters))if(value!==undefined)requirements.push({name,value:String(value),source:"ui"});
  return {background,operation,useCase,conflicts,requirements};
}
