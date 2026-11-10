import {frameRatio} from "../imagegen/frame-ratio";
import {createHash} from "node:crypto";

export const DEFAULT_PROMPT="根据图一产品，参考图二的风格与设计理念，用你的专业知识去排版规划，生成类似风格的图片";
export const DEFAULT_INSTRUCTION="图一是我们的产品图，图二是同行参考图。请分析图二的构图、排版、配色、场景、光影、卖点和视觉风格，保留图一产品主体特征，输出中文图生图提示词。不要复用商标、水印和联系方式。";
export const MODES:Record<string,string[]>={all_sku:["main","detail","sku"],all:["main","detail"],main_detail:["main","detail"],main:["main"],detail:["detail"],sku:["sku"]};
export const LABELS:Record<string,string>={main:"主图",detail:"详情图",sku:"SKU"};
export class WorkbenchError extends Error {constructor(message:string,readonly status=400){super(message);}}
export type Asset={artworkId:string;url:string;width:number;height:number;relative:string;prompt?:string};
export type Project={name:string;assets:Asset[]};
export type Settings={mode:string;quality:string;resolution:string;ratio:string;count:number;sku_refs_dir_name:string;prompt:string;prompt_infer_instruction:string;task_mode:string;ratio_mode:string;modelId?:string;[key:string]:unknown};
export const defaults:Settings={mode:"all",quality:"high",resolution:"2k",ratio:"1:1",count:1,timeout:900,card_height:640,sku_refs_dir_name:"SKU",prompt:DEFAULT_PROMPT,prompt_infer_instruction:DEFAULT_INSTRUCTION,task_mode:"confirm",ratio_mode:"smart"};
export function settings(raw:Record<string,unknown>={},max=20):Settings {
 const s={...defaults,...raw};s.quality=String(s.quality);s.resolution=String(s.resolution).toLowerCase();s.count=Number(s.count);
 if(!["low","medium","high","auto"].includes(s.quality)||!["1k","2k","4k"].includes(s.resolution)||!MODES[s.mode]||!Number.isInteger(s.count)||s.count<1||s.count>max||!["confirm","auto"].includes(s.task_mode)||!["smart","manual","reference","product"].includes(s.ratio_mode)||!/^auto$|^[1-9]\d{0,5}:[1-9]\d{0,5}$/.test(s.ratio))throw new WorkbenchError("生图参数无效");
 for(const k of ["prompt","prompt_infer_instruction"] as const)if(typeof s[k]!=="string"||s[k].length>6000)throw new WorkbenchError("提示词需在6000字符内");
 return s;
}
export function relativePath(value:unknown){
 if(typeof value!=="string")throw new WorkbenchError("文件路径无效");
 const p=value.replace(/\\/g,"/").split("/");
 if(!p.length||p.some(x=>!x||x==="."||x===".."||x.length>160||/[\x00-\x1f:]/.test(x))||! /\.(png|jpe?g|jfif|webp|bmp)$/i.test(p.at(-1)!))throw new WorkbenchError("文件路径无效");
 return p.length>1?p.slice(1).join("/"):p[0];
}
export function classify(relative:string,sku="SKU"){
 const dirs=relative.toLowerCase().split("/").slice(0,-1);
 if(dirs.some(x=>[sku.toLowerCase(),"sku"].includes(x)))return "sku";
 if(dirs.some(x=>["详情图","详情","detail","details"].includes(x)))return "detail";
 if(dirs.some(x=>["主图","main","主图参考","参考图","refs","references"].includes(x)))return "main";
 if(!dirs.length||dirs.some(x=>["产品图","产品","原图","product","products","source"].includes(x)))return "product";
 return "main";
}
export const imageUrl=(id:string)=>`/api/reference-workbench/image?path=${encodeURIComponent(id)}`;
export function ratio(width:number,height:number){
 const value=frameRatio({width,height});
 if(!value||!/^[1-9]\d{0,5}:[1-9]\d{0,5}$/.test(value))throw new WorkbenchError("参考图片尺寸无效，请重新读取图片");
 return value;
}
export function geometryMatches(a:{width:number;height:number},b:{width:number;height:number}){return Math.abs((a.width/a.height)/(b.width/b.height)-1)<=0.035;}
export function stableId(requestId:string,key:string){const h=createHash("sha256").update(`${requestId}:${key}`).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
export function requestId(value:unknown){if(typeof value!=="string"||!/^[a-zA-Z0-9_-]{8,120}$/.test(value))throw new WorkbenchError("请求标识无效");return value;}
export function canonical(value:unknown):string{const sorted=(v:any):any=>v&&typeof v==="object"?Array.isArray(v)?v.map(sorted):Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,sorted(x)])):v;return JSON.stringify(sorted(value));}
export const digest=(value:unknown)=>createHash("sha256").update(canonical(value)).digest("hex");
