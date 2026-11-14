import {z} from 'zod';
import {readCompiledVideoPlan} from '../compile';
import {workflowVideoRecipeSchema,type WorkflowVideoRecipe} from './workflow-profile';
import {videoDiagnostic,type CompiledVideoPlan,type ResolvedVideoAsset,type VideoResult,type VideoWireTemplate} from '../execution-contract';
type Json=VideoWireTemplate['body'];
type Delivery=NonNullable<WorkflowVideoRecipe['media']['image']>;
const fail=(code:string,reason:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic('input',code,'inputs',reason,'核对冻结输入，不会重新编译或重发任务')]});
/** Pure traversal; the executor supplies real ACL revalidation/signing/upload.
 * Context placeholders are created by the Profile, never stored credentials. */
export async function materializeWorkflowVideoPlan(raw:unknown,ports:{
 asset:(scope:CompiledVideoPlan['scope'],asset:ResolvedVideoAsset,delivery:Delivery,inputId:string)=>Promise<VideoResult<{asset:ResolvedVideoAsset;value:string}>>;
 context:(name:'credential'|'operationId')=>VideoResult<string>;
}):Promise<VideoResult<VideoWireTemplate>>{
 const read=readCompiledVideoPlan(raw);if(!read.ok)return read;const plan=read.value,recipe=workflowVideoRecipeSchema.safeParse(plan.binding.recipe);
 if(plan.binding.profileId!=='workflow-video'||plan.wireTemplate.encoding!=='workflow'||!recipe.success)return fail('WRONG_MATERIALIZER','计划不是工作流协议');
 const inputs=new Map(plan.inputManifest.flatMap(input=>input.kind==='text'?[]:[[input.id,input] as const])),cache=new Map<string,string>();
 async function visit(value:Json):Promise<VideoResult<Json>>{
  if(Array.isArray(value)){const result:Json[]=[];for(const item of value){const mapped=await visit(item);if(!mapped.ok)return mapped;result.push(mapped.value);}return {ok:true,value:result};}
  if(!value||typeof value!=='object')return {ok:true,value};
  if(Object.hasOwn(value,'$videoContext')){
   const key=value.$videoContext;
   if(Object.keys(value).length!==1||!['credential','operationId'].includes(String(key))||key==='credential'&&recipe.data!.manifest.kind!=='runninghub')return fail('INVALID_WORKFLOW_CONTEXT','工作流上下文槽无效');
   const result=ports.context(key as 'credential'|'operationId');if(!result.ok)return result;
   if(!result.value||result.value.length>16384)return fail('INVALID_WORKFLOW_CONTEXT','工作流执行上下文缺失');return result;
  }
  if(Object.hasOwn(value,'$videoAsset')){
   const id=value.$videoAsset,input=typeof id==='string'&&Object.keys(value).length===1?inputs.get(id):undefined;
   if(!input)return fail('INVALID_MEDIA_SLOT','工作流素材槽与冻结身份不一致');
   const delivery=recipe.data!.media[input.kind as 'image'|'video'|'audio'];if(!delivery)return fail('WORKFLOW_MEDIA_DELIVERY_MISSING','素材缺少物化协议');
   const cacheKey=JSON.stringify([input.asset,delivery]);let actual=cache.get(cacheKey);
   if(!actual){const result=await ports.asset(plan.scope,structuredClone(input.asset),structuredClone(delivery),input.id);if(!result.ok)return result;
    const a=result.value.asset,b=input.asset;
    if(['storageKey','sha256','bytes','mimeType','artworkId','width','height','durationSeconds'].some(key=>a[key as keyof typeof a]!==b[key as keyof typeof b]))return fail('FROZEN_MEDIA_CHANGED','工作流原始素材版本发生变化');
    actual=result.value.value;
    if(delivery.delivery==='url'){
     try{const url=new URL(actual);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||actual.length>16384)throw Error();actual=url.href;}catch{return fail('INVALID_MEDIA_ADDRESS','工作流素材地址无效');}
    }else if(!actual||actual.length>4096||/^[\\/]|[\\\x00-\x1f]|^[a-z]+:/i.test(actual)||actual.split('/').some(p=>!p||p==='.'||p==='..'))return fail('INVALID_WORKFLOW_UPLOAD_NAME','工作流上传名称无效');
    cache.set(cacheKey,actual);
   }
   return {ok:true,value:actual};
  }
  const result:Record<string,Json>={};for(const [key,item]of Object.entries(value)){const mapped=await visit(item);if(!mapped.ok)return mapped;Object.defineProperty(result,key,{value:mapped.value,enumerable:true,writable:true,configurable:true});}return {ok:true,value:result};
 }
 try{const mapped=await visit(plan.wireTemplate.body);return mapped.ok?{ok:true,value:{...plan.wireTemplate,encoding:'json',body:mapped.value}}:mapped;}
 catch{return fail('WORKFLOW_MATERIALIZATION_FAILED','工作流输入物化暂未完成');}
}
