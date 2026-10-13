"use client";
import {browserRandomUUID} from "../browser-crypto";
import {imagegenRequestSchema} from "./schema";
import {previewImagegen,startImagegen,uploadImagegenInput} from "./client";
import type {ImagegenRequest} from "./types";
/** Ordinary node prompts use the same read-only plan; specialized old recipes retain their adapter. */
export async function submitCanvasImagegen(form:FormData,sourceNodeId?:string,onPlan?:(message:string)=>void){
 const inputs:ImagegenRequest["inputs"]=[];
 for(const file of form.getAll("image")){if(!(file instanceof File))continue;const asset=await uploadImagegenInput(file);inputs.push({artworkId:asset.artworkId,role:inputs.length?"reference":"edit-target"});}
 const value=(name:string)=>String(form.get(name)||"");
 const style=value("style"),raw=value("userPrompt")||value("prompt"),prompt=raw+(style&&!/默认|default/i.test(style)?`\n用户选择的视觉风格：${style}`:"");
 const request=imagegenRequestSchema.parse({version:1,operationId:browserRandomUUID(),entry:"canvas",mode:inputs.length?"edit":"generate",prompt,sourceNodeId:value("parentId")||sourceNodeId,inputs,modelId:value("model")||undefined,variants:Number(value("count")||1),parameters:{quality:value("quality")||"medium",resolution:value("resolution")||"1K",ratio:value("ratio")||"auto"},output:value("transparent")==="1"?{background:"transparent",backgroundOrigin:"current-ui"}:{format:"png"}});
 const plan=await previewImagegen(request),stages=plan.steps.map(s=>s.operation==="cutout"?"抠图":s.operation==="edit"?"编辑":"生成").join(" → ");
 if(plan.intent.background==="transparent")onPlan?.(`已识别：透明背景 · ${stages} · ${plan.totalCredits} 积分`);
 if(plan.confirmationRequired&&!window.confirm(`${stages}\n${plan.warnings.join("\n")}\n本次合计 ${plan.totalCredits} 积分，是否执行？`))throw new Error("已取消提交");
 const result=await startImagegen(plan.request,{billingVersion:plan.billingVersion,modelVersion:plan.modelVersion,credits:plan.totalCredits,confirmed:true});
 return Response.json({jobId:"jobId" in result?result.jobId:`imagegen-${request.operationId}`});
}
