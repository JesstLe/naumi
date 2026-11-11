import type {Pricing} from "@/lib/billing/types";
import {QUALITY_IDS,RESOLUTION_IDS} from "@/lib/billing/rules/registry";
export const BUSINESS_PRICE_MODES:{value:string;label:string}[]=[
  {value:"inherit",label:"沿用通用计费"},{value:"fixed",label:"固定积分"},{value:"matrix",label:"质量 × 分辨率积分"},
  {value:"quality-resolution",label:"质量与分辨率加价"},{value:"tiers",label:"分档积分"},{value:"cost-plus",label:"成本加成积分"},
  {value:"cny-fixed",label:"人民币固定收费"},{value:"usage",label:"人民币实际用量"},{value:"api-cost-plus",label:"完整 API 成本加成"},
];
/** Called only after an explicit administrator mode selection. Reading never migrates a price. */
export function newBusinessPricing(mode:string,current?:Pricing,costKey=""):Pricing|undefined{
  if(mode==="inherit")return undefined;
  if(current?.mode===mode)return structuredClone(current);
  const money={creditsPerCnyMicros:current&&"creditsPerCnyMicros"in current?current.creditsPerCnyMicros:"100000000",rounding:"ceil" as const};
  switch(mode){
    case "fixed":return{mode,credits:0};
    case "matrix":return{mode,prices:Object.fromEntries(QUALITY_IDS.map(q=>[q,Object.fromEntries(RESOLUTION_IDS.map(r=>[r,0]))]))};
    case "quality-resolution":return{mode,quality:Object.fromEntries(QUALITY_IDS.map(q=>[q,0])),resolutionExtra:Object.fromEntries(RESOLUTION_IDS.map(r=>[r,0]))};
    case "tiers":return{mode,dimension:"quantity",prices:{default:0}};
    case "cost-plus":return{mode,...money,costKey,factorBps:10000,minimum:0,maximum:2147483647};
    case "cny-fixed":return{mode,...money,amountMicros:"1000000"};
    case "usage":return{mode,...money,inputMicrosPerMillion:"1000000",outputMicrosPerMillion:"2000000",authorizationCnyMicros:"1000000"};
    case "api-cost-plus":return{mode,...money,estimateCnyMicros:"0",factorBps:10000,authorizationCnyMicros:"1000000"};
    default:throw Error("未知计费模式");
  }
}
export function businessPricingLabel(pricing?:Pricing){return BUSINESS_PRICE_MODES.find(mode=>mode.value===(pricing?.mode||"inherit"))?.label||"未知计费模式";}
