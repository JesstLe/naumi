import {createHash} from 'node:crypto';
import {readCompiledVideoPlan} from '../compile';
import {mediaExtension} from '../media-formats';
import {nativeVideoRecipeSchema} from './native-profile';
import {videoDiagnostic,type VideoResult,type ResolvedVideoAsset,type CompiledVideoPlan,type MaterializedVideoWireRequest,type VideoWireTemplate} from '../execution-contract';

const fail=(code:string,reason:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic('input',code,'inputs',reason,'核对原任务与原始素材，不会重新编译或重发')]});
/** Resolves frozen byte identities only. No recipe selection, parameter
 * mapping, model lookup, network, or task mutation belongs here. */
export async function materializeNativeVideoPlan(raw:unknown,ports:{bytes:(scope:CompiledVideoPlan['scope'],asset:ResolvedVideoAsset)=>Promise<VideoResult<{asset:ResolvedVideoAsset;bytes:Uint8Array}>>}):Promise<VideoResult<MaterializedVideoWireRequest>>{
 const read=readCompiledVideoPlan(raw);if(!read.ok)return read;const plan=read.value,recipe=nativeVideoRecipeSchema.safeParse(plan.binding.recipe);
 if(plan.schemaVersion!==4||plan.binding.profileId!=='native-video'||!recipe.success||!['inline-json','multipart','json'].includes(plan.wireTemplate.encoding))return fail('WRONG_MATERIALIZER','冻结计划不是原生字节协议');
 if(recipe.data.layout==='gemini'&&plan.wireTemplate.encoding!=='inline-json'||recipe.data.layout==='openai-videos'&&plan.wireTemplate.encoding!=='multipart')return fail('WRONG_MATERIALIZER','冻结传输格式与原协议不一致');
 const assets=new Map(plan.inputManifest.flatMap(i=>i.kind==='text'?[]:[[i.id,i.asset] as const])),cache=new Map<string,{asset:ResolvedVideoAsset;bytes:Uint8Array}>();
 const get=async(value:unknown):Promise<VideoResult<{asset:ResolvedVideoAsset;bytes:Uint8Array}>>=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!('$videoAsset' in value)||typeof value.$videoAsset!=='string')return fail('INVALID_MEDIA_SLOT','冻结媒体槽无效');
  const asset=assets.get(value.$videoAsset);if(!asset||!asset.mimeType.startsWith('image/')||asset.bytes>12*1024*1024)return fail('INVALID_MEDIA_SLOT','冻结图片身份或实际大小无效');
  const key=JSON.stringify(asset),existing=cache.get(key);if(existing)return {ok:true,value:existing};
  const got=await ports.bytes(plan.scope,structuredClone(asset));if(!got.ok)return got;
  const actual=got.value.asset;
  if(['storageKey','sha256','bytes','mimeType','artworkId','width','height','durationSeconds'].some(k=>asset[k as keyof typeof asset]!==actual[k as keyof typeof asset])||got.value.bytes.byteLength!==asset.bytes||createHash('sha256').update(got.value.bytes).digest('hex')!==asset.sha256)return fail('FROZEN_MEDIA_CHANGED','原始图片身份、属性或字节已经改变');
  const result={asset,bytes:Uint8Array.from(got.value.bytes)};cache.set(key,result);return {ok:true,value:result};
 };
 type Json=VideoWireTemplate['body'];
 async function inline(value:Json):Promise<VideoResult<Json>>{
  if(Array.isArray(value)){const out:Json[]=[];for(const item of value){const got=await inline(item);if(!got.ok)return got;out.push(got.value);}return {ok:true,value:out};}
  if(!value||typeof value!=='object')return {ok:true,value};
  if(Object.hasOwn(value,'$videoAsset')){const got=await get(value);return got.ok?{ok:true,value:recipe.data!.layout==='gemini'?{data:Buffer.from(got.value.bytes).toString('base64'),mimeType:got.value.asset.mimeType}:`data:${got.value.asset.mimeType};base64,${Buffer.from(got.value.bytes).toString('base64')}`}:got;}
  const out:Record<string,Json>={};for(const [key,item]of Object.entries(value)){const got=await inline(item);if(!got.ok)return got;Object.defineProperty(out,key,{value:got.value,enumerable:true,writable:true,configurable:true});}return {ok:true,value:out};
 }
 try{
  if(plan.wireTemplate.encoding==='inline-json'){
   if(!['gemini','grok2api','cogvideox3','agnes'].includes(recipe.data.layout))return fail('WRONG_MATERIALIZER','该布局没有图片内联协议');const got=await inline(plan.wireTemplate.body);return got.ok?{ok:true,value:{method:'POST',path:plan.wireTemplate.path,encoding:'json',body:got.value}}:got;}
  const body=plan.wireTemplate.body;
  if(!body||typeof body!=='object'||Array.isArray(body))return fail('INVALID_WIRE_BODY','原生请求体不是字段对象');
  if(plan.wireTemplate.encoding==='json'){
   if(assets.size)return fail('INVALID_MEDIA_SLOT','JSON请求存在未物化图片');
   return {ok:true,value:{method:'POST',path:plan.wireTemplate.path,encoding:'json',body}};
  }
  const form=new FormData();
  for(const [key,value]of Object.entries(body)){
   if(value&&typeof value==='object'){
    if(key!=='input_reference')return fail('INVALID_WIRE_BODY','multipart仅接受明确的图片文件字段');
    const got=await get(value);if(!got.ok)return got;
    form.set(key,new Blob([Uint8Array.from(got.value.bytes)],{type:got.value.asset.mimeType}),`reference.${mediaExtension(got.value.asset.mimeType)}`);
   }else if(value===null)return fail('INVALID_WIRE_BODY','multipart字段缺少有效值');
   else form.set(key,String(value));
  }
  return {ok:true,value:{method:'POST',path:plan.wireTemplate.path,encoding:'multipart',body:form}};
 }catch{return fail('MEDIA_MATERIALIZATION_FAILED','原始图片字节暂时未完成物化');}
}
