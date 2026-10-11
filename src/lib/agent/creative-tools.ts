import { Type, type TSchema } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { CanvasAgentContext } from "./canvas-context";
import { actionSchema, currentImage } from "../competitor-types";

type Deps = {
  internal: (path:string, signal:AbortSignal|undefined, init?:RequestInit)=>Promise<any>;
  file: (url:string, signal?:AbortSignal)=>Promise<File>;
  timeout: <T>(fn:(signal:AbortSignal|undefined)=>Promise<T>,signal?:AbortSignal)=>Promise<T>;
  generation: AgentTool;
  canvas?: CanvasAgentContext;
};
const opt=(description:string)=>Type.Optional(Type.String({description}));
const flag=Type.Optional(Type.Boolean());
const quality=Type.Optional(Type.Union(["low","medium","high","xhigh","max"].map(value=>Type.Literal(value))));
const common={image_url:Type.String({description:"用户提供或作品库返回的原图URL；画布使用当前图"}),quality,
  resolution:Type.Optional(Type.Union(["1K","2K","4K"].map(value=>Type.Literal(value)))),ratio:opt("画幅比例"),
  prompt:opt("额外处理要求"),confirm:Type.Optional(Type.Boolean({description:"仅用户明确确认报价后设置"}))};
const specs: Array<{name:string;label:string;path:string;schema:Record<string,TSchema>;imageField?:string}> = [
  {name:"cutout_image",label:"AI抠图",path:"cutout",schema:{},imageField:"image"},
  {name:"cutout_avatar",label:"抠头像",path:"avatar",schema:{bg:opt("white/black/transparent背景")}},
  {name:"upscale_image",label:"变清晰",path:"upscale",schema:{scale:Type.Optional(Type.Union([Type.Literal(2),Type.Literal(4)])),faceEnhance:flag}},
  {name:"inpaint_image",label:"局部改图",path:"inpaint",schema:{mask_url:Type.String({description:"用户提供的选区遮罩URL，透明区域修改，禁止猜测选区"}),prompt:Type.String({minLength:1})}},
  {name:"transfer_style",label:"风格转换",path:"style",schema:{style:Type.String({description:"目标风格"}),styleLabel:opt("风格显示名")}},
  {name:"remove_watermark",label:"去水印",path:"dewatermark",schema:{}},
  {name:"try_on_clothing",label:"服装上身",path:"tryon",schema:{bottom_url:opt("下装图URL"),modelId:opt("站内模特库ID"),sceneId:opt("站内场景ID")},imageField:"top"},
  {name:"extract_garment",label:"服装提取",path:"garment",schema:{bg:opt("white/black/transparent背景")}},
  {name:"generate_garment_3d",label:"3D服装图",path:"garment3d",schema:{category:opt("服装类别")}},
  {name:"dewrinkle_clothing",label:"服装去皱",path:"dewrinkle",schema:{}},
  {name:"extract_print",label:"印花提取",path:"extract",schema:{bg:opt("white/transparent"),complete:flag,mode:opt("standard/advanced"),category:opt("服装类别")}},
  {name:"check_image_ip",label:"侵权检测",path:"ipcheck",schema:{}},
  {name:"prepare_print_file",label:"印刷图",path:"printfile",schema:{dpi:Type.Optional(Type.Number({minimum:72,maximum:1200})),wMm:Type.Optional(Type.Number({minimum:10,maximum:2000})),hMm:Type.Optional(Type.Number({minimum:10,maximum:2000})),fit:opt("contain/cover"),bg:opt("white/transparent")}},
];
export function createCreativeTools(d:Deps):AgentTool[] {
  const tools:AgentTool[]=specs.map(spec=>({
    name:spec.name,label:spec.label,description:`调用站内「${spec.label}」真实接口。计费、失败与模型条件由原工具处理；用户原图必填。`,
    parameters:Type.Object({...common,...spec.schema}),executionMode:"sequential",
    execute:async(_id,params,signal)=>d.timeout(async scoped=>{
      const p=params as Record<string,any>,fd=new FormData();
      fd.append(spec.imageField||"image",await d.file(p.image_url,scoped));
      for(const key of [...new Set(["prompt","quality","ratio","resolution",...Object.keys(spec.schema)])]){
        if(["mask_url","bottom_url","confirm"].includes(key)||p[key]===undefined)continue;
        fd.append(key,typeof p[key]==="boolean"?(p[key]?"1":"0"):String(p[key]));
      }
      if(spec.path==="cutout")fd.set("quality","fine");
      if(p.mask_url)fd.append("mask",await d.file(p.mask_url,scoped));
      if(p.bottom_url)fd.append("bottom",await d.file(p.bottom_url,scoped));
      if(d.canvas?.anchorId)fd.append("parentId",d.canvas.anchorId);
      fd.append("entry","agent");
      const result=await d.internal(`/api/${spec.path}`,scoped,{method:"POST",body:fd});
      if(spec.path==="ipcheck")return {content:[{type:"text",text:JSON.stringify(result.result)}],details:{report:result.result,publicSummary:"侵权风险筛查完成"}};
      if(typeof result.url!=="string"||!result.url)throw new Error("工具未返回有效产物，请检查作品库，勿重复提交");
      return {content:[{type:"text",text:`${spec.label}完成：\n![${spec.label}](${result.url})`}],details:{url:result.url,artworkId:result.id,publicSummary:`${spec.label}完成`}};
    },signal),
  }));
  for(const spec of [{name:"generate_variations",label:"图裂变",min:1},{name:"fuse_images",label:"AI融图",min:2}])tools.push({
    name:spec.name,label:spec.label,description:`${spec.label}，复用站内生成任务、轮询、原计费。保留商品身份。`,
    parameters:Type.Object({image_urls:Type.Array(Type.String(),{minItems:spec.min,maxItems:4}),prompt:opt("变体/融合要求"),count:Type.Optional(Type.Number({minimum:1,maximum:4})),quality,ratio:opt("画幅比例"),resolution:opt("1K/2K/4K"),confirm:flag}),
    execute:(_id,p,signal,update)=>d.generation.execute(_id,{...(p as Record<string,unknown>),prompt:(p as any).prompt|| (spec.min===2?"将参考图片自然融合成同一场景，保留各商品身份，统一光影和透视。":"保留原商品身份，生成独立的新构图和场景变体。"),count:(p as any).count||1,_category:spec.min===2?"fusion":"variation"},signal,update),
  });
  tools.push({name:"generate_titles",label:"标题生成",description:"调用站内标题/卖点接口，按产品描述或原图生成，不冒充图片工具。",
    parameters:Type.Object({idea:opt("产品描述和卖点"),image_url:opt("可选产品图"),platform:opt("平台"),style:opt("语气风格"),lang:opt("输出语言"),count:Type.Optional(Type.Number({minimum:1,maximum:12}))}),
    execute:async(_id,p,signal)=>d.timeout(async scoped=>{
      const fd=new FormData(),args=p as Record<string,any>;
      if(!args.idea&&!args.image_url)throw new Error("请提供产品描述或产品图");
      for(const key of ["idea","platform","style","lang","count"])if(args[key]!==undefined)fd.append(key,String(args[key]));
      if(args.image_url)fd.append("image",await d.file(args.image_url,scoped));
      const result=await d.internal("/api/title-gen",scoped,{method:"POST",body:fd});
      if(!Array.isArray(result.titles)||!result.titles.length)throw new Error("标题工具没有返回标题");
      return {content:[{type:"text",text:JSON.stringify({titles:result.titles,sellingPoints:result.sellingPoints})}],details:{...result,publicSummary:"商品标题与卖点生成完成"}};
    },signal)});
  tools.push({name:"list_competitor_items",label:"竞品参考列表",description:"只读列出当前用户竞品工作台的图片、版本和修改序号。",
    parameters:Type.Object({}),execute:async(_id,_p,signal)=>{
      const result=await d.internal("/api/competitors",signal);
      return {content:[{type:"text",text:JSON.stringify(result.items||[])}],details:{publicSummary:"竞品列表读取完成"}};
    }});
  tools.push({name:"import_competitor_image",label:"导入竞品参考",description:"将用户指定的参考图导入本人竞品工作台；batch_id需保持同批次，不重复导入。",
    parameters:Type.Object({image_url:Type.String(),batch_id:Type.String({format:"uuid"}),path:Type.String({minLength:1})}),
    execute:async(_id,p,signal)=>{
      const fd=new FormData();fd.append("image",await d.file((p as any).image_url,signal));fd.append("batchId",(p as any).batch_id);fd.append("path",(p as any).path);
      const result=await d.internal("/api/competitors",signal,{method:"POST",body:fd});
      return {content:[{type:"text",text:JSON.stringify(result.item)}],details:{publicSummary:"竞品参考导入完成"}};
    }});
  for(const action of ["analyze","replicate","edit"] as const)tools.push({
    name:action==="analyze"?"analyze_competitor":action==="replicate"?"replicate_competitor":"edit_competitor",
    label:action==="analyze"?"竞品反推提示词":action==="replicate"?"竞品参考生成":"竞品选区编辑",
    description:"复用竞品工作台真实操作，revision/active_version取自当前列表。选区由用户给定，版本冲突不重试。",
    parameters:Type.Object({item_id:Type.String({format:"uuid"}),revision:Type.Number({minimum:0}),active_version:Type.String(),prompt:opt("提示词"),regions:Type.Optional(Type.Array(Type.Object({id:Type.String(),label:Type.String(),kind:Type.Union(["color","text","product","component","background"].map(value=>Type.Literal(value))),x:Type.Number(),y:Type.Number(),width:Type.Number(),height:Type.Number(),instruction:Type.String(),color:Type.String(),enabled:Type.Boolean()}))),product_id:opt("本人的产品参考项ID"),degree:opt("layout/style"),quality,confirm:flag}),
    execute:async(_id,p,signal)=>d.timeout(async scoped=>{
      const args=p as any;
      if(!/^[0-9a-f-]{36}$/i.test(args.item_id))throw new Error("竞品图片ID格式不正确");
      if(action==="edit"&&(!Array.isArray(args.regions)||!args.regions.some((region:any)=>region.enabled)))throw new Error("请提供用户明确选择的编辑区域");
      const body=actionSchema.parse({action,revision:args.revision,activeVersion:args.active_version,prompt:args.prompt||"",regions:args.regions||[],productId:args.product_id,degree:args.degree});
      const result=await d.internal(`/api/competitors/${encodeURIComponent(args.item_id)}/action`,scoped,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,quality:args.quality})});
      if(action==="analyze")return {content:[{type:"text",text:JSON.stringify(result.item)}],details:{publicSummary:"竞品反推完成"}};
      const url=currentImage(result.item);
      // Competitor versions are not artworks; export a copy through the existing canvas API.
      let artworkId:string|undefined;
      if(d.canvas){const added=await d.internal("/api/artworks/add",scoped,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({entry:"competitor",src:{image:url,title:"Agent竞品结果",prompt:body.prompt,category:"main"}})});artworkId=added.artwork?.id||added.id;}
      return {content:[{type:"text",text:`![竞品结果](${url})`}],details:{url,artworkId,itemId:result.item.id,publicSummary:"竞品结果生成完成"}};
    },signal),
  });
  return tools;
}
