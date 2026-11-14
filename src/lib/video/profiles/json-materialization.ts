import {readCompiledVideoPlan} from '../compile';
import {videoDiagnostic,type CompiledVideoPlan,type ResolvedVideoAsset,type VideoResult,type VideoWireTemplate} from '../execution-contract';

type JsonWireBody=VideoWireTemplate['body'];
/** Application adapter resolves each frozen owned asset into a fresh signed
 * URL. This module never chooses a model, compiles a request, or mutates the
 * persisted plan. Upload/multipart/DAG families have separate materializers. */
export async function materializeJsonVideoPlan(raw:unknown,ports:{
  url:(scope:CompiledVideoPlan['scope'],asset:ResolvedVideoAsset)=>Promise<VideoResult<{asset:ResolvedVideoAsset;url:string}>>;
}):Promise<VideoResult<VideoWireTemplate>> {
  const read=readCompiledVideoPlan(raw);if(!read.ok)return read;
  const plan=read.value;
  if(plan.wireTemplate.encoding!=='json')return {ok:false,diagnostics:[videoDiagnostic('mapping','WRONG_MATERIALIZER','plan','此计划不是JSON媒体地址协议','使用该协议对应的上传或工作流执行器')]};
  const assets=new Map(plan.inputManifest.flatMap(input=>input.kind==='text'?[]:[[input.id,input.asset] as const]));
  const cache=new Map<string,string>();
  async function visit(value:JsonWireBody):Promise<VideoResult<JsonWireBody>> {
    if(Array.isArray(value)){
      const out:JsonWireBody[]=[];for(const item of value){const result=await visit(item);if(!result.ok)return result;out.push(result.value);}return {ok:true,value:out};
    }
    if(!value||typeof value!=='object')return {ok:true,value};
    if(Object.hasOwn(value,'$videoAsset')){
      const inputId=value.$videoAsset;
      const asset=typeof inputId==='string'&&Object.keys(value).length===1?assets.get(inputId):undefined;
      if(!asset)return {ok:false,diagnostics:[videoDiagnostic('mapping','INVALID_MEDIA_SLOT','plan','冻结请求的媒体身份无效','检查冻结计划，不会按新配置重编译')]};
      const key=JSON.stringify([asset.storageKey,asset.sha256,asset.bytes]);
      let url=cache.get(key);
      if(!url){
        const result=await ports.url(plan.scope,structuredClone(asset));if(!result.ok)return result;
        const actual=result.value.asset;
        if(actual.storageKey!==asset.storageKey||actual.sha256!==asset.sha256||actual.bytes!==asset.bytes||actual.mimeType!==asset.mimeType
          ||actual.durationSeconds!==asset.durationSeconds||actual.width!==asset.width||actual.height!==asset.height)
          return {ok:false,diagnostics:[videoDiagnostic('input','FROZEN_MEDIA_CHANGED','inputs','冻结素材的身份或真实属性已变化','重新选择素材并显式创建新任务')]};
        try{
          const address=new URL(result.value.url);
          if(!['https:','http:'].includes(address.protocol)||address.username||address.password||result.value.url.length>16384||plan.wireTemplate.mediaUrlProtocol==='https'&&address.protocol!=='https:')throw Error();
          url=address.href;
        }catch{return {ok:false,diagnostics:[videoDiagnostic('mapping','INVALID_MEDIA_ADDRESS','inputs','执行器未返回有效的媒体访问地址','检查媒体签名或代理配置')]};}
        cache.set(key,url);
      }
      return {ok:true,value:url};
    }
    const out:Record<string,JsonWireBody>={};
    for(const [key,item] of Object.entries(value)){const result=await visit(item);if(!result.ok)return result;Object.defineProperty(out,key,{value:result.value,enumerable:true,writable:true,configurable:true});}
    return {ok:true,value:out};
  }
  try{
    const result=await visit(plan.wireTemplate.body);if(!result.ok)return result;
    return {ok:true,value:{...plan.wireTemplate,body:result.value}};
  }catch{return {ok:false,diagnostics:[videoDiagnostic('input','MEDIA_MATERIALIZATION_FAILED','inputs','冻结媒体访问地址暂时无法核对','核查原任务和素材，不会自动重新生成')]};}
}
