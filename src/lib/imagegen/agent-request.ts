import "server-only";
import {randomUUID} from "node:crypto";
import {getPool,ensureSchema} from "../db";
import {imagegenRequestSchema} from "./schema";
import type {CanvasAgentContext} from "../agent/canvas-context";
import type {ImagegenRequest} from "./types";
export const SHARED_IMAGEGEN_TOOLS=new Set(["generate_image","generate_variations","fuse_images","inpaint_image","cutout_image","transfer_style"]);
export async function agentImagegenRequest(name:string,args:Record<string,any>,owner:string,canvas?:CanvasAgentContext,quality="medium",skill?:ImagegenRequest["skill"]){
 await ensureSchema();
 const refs:Array<{url:string;role:ImagegenRequest["inputs"][number]["role"]}>=(Array.isArray(args.image_urls)?args.image_urls:args.image_url?[args.image_url]:canvas?.imageUrls||[]).map((url:string,i:number)=>({url,role:args.input_roles?.[i]||(i===0?"edit-target":"reference")}));
 if(args.mask_url)refs.push({url:args.mask_url,role:"mask"});
 const inputs:ImagegenRequest["inputs"]=[];
 for(const ref of refs){let path=ref.url;try{const parsed=new URL(ref.url,"http://internal");if(parsed.pathname.startsWith("/media/"))path=parsed.pathname;}catch{throw new Error("参考图地址无效");}
  const work=(await getPool().query("SELECT id FROM app_artworks WHERE email=$1 AND (image_url=$2 OR source_url=$2) AND video_url IS NULL LIMIT 1",[owner.toLowerCase(),path])).rows[0];
  if(work){inputs.push({artworkId:work.id,role:ref.role});continue;}
  const asset=/^\/media\/imagegen-inputs\/([a-f0-9-]{36})\.(?:png|jpg|webp)$/i.exec(path);
  if(asset)inputs.push({artworkId:`asset-${asset[1]}`,role:ref.role});else throw new Error("请先将参考图或蒙版上传到本站作品库，再执行高级图像流程");
 }
 const prompt=name==="recolor_product"?`将当前参考图的商品颜色替换为 ${String(args.color||"目标颜色")}，强度 ${Number(args.strength)||100}。保持商品形态、纹理、文字、光影及背景不变。`:name==="retouch_product"?`精修当前参考图：${Array.isArray(args.options)?args.options.join("、"):"增强质感、修复瑕疵"}。${String(args.text||"")}。保留商品主体和原有构图。`:name==="replicate_hot"?`参考当前图和上游参考图，复刻构图风格，保留当前商品身份。${String(args.text||"")}`:name==="cutout_image"?`移除背景，保留主体。${args.prompt||""}`:name==="transfer_style"?`将目标图调整为${args.style||"指定"}风格，保持主体身份。${args.prompt||""}`:args.prompt||(args.local_process===true||args.chroma?"处理图片输出":name==="fuse_images"?"多图合成，保留各主体身份。":"保留主体，生成独立构图变体。");
 return imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:canvas?"canvas":"agent",sourceNodeId:canvas?.anchorId||undefined,mode:args.batch_prompts?"batch":args.local_process===true||args.chroma?"postprocess":inputs.length?"edit":"generate",prompt,skill,batch:args.batch_prompts?{items:args.batch_prompts.map((item:any,i:number)=>({key:item.key||`item-${i+1}`,name:item.name||`图像-${i+1}`,prompt:item.prompt})),concurrency:args.batch_concurrency||5,maxAttempts:args.batch_attempts||1,failFast:args.batch_fail_fast===true}:undefined,useCase:args.use_case,augment:args.augment===true,modelId:args.model||canvas?.imageModelId||undefined,inputs,variants:args.count||1,parameters:{quality:args.quality||canvas?.quality||quality,resolution:args.resolution||canvas?.resolution||"1K",ratio:args.ratio||canvas?.ratio||"1:1",inputFidelity:args.input_fidelity,moderation:args.moderation,width:args.width,height:args.height},chroma:args.chroma,output:{format:args.output_format||"png",background:args.background,backgroundOrigin:args.background?"current-ui":undefined,compression:args.compression,compressionMode:args.compression_mode,flattenColor:args.flatten_color,downscaleMaxDim:args.downscale_max_dim}});
}
