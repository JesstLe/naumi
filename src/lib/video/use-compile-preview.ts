'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {authHeader} from '../supabase';
import {useFeatureCatalogScope} from '../model-config/feature-client';
import {videoPreviewResponseSchema,type VideoPreviewValue} from './preview-contract';
import {videoUiDraft} from './ui-draft';
import type {VideoCatalogModel,VideoNodeConfig} from './client-settings';
import type {OrderedInput} from './references';
import {MODEL_CATALOG_REFRESH} from '../model-config/public-client';

type PrivateFetch=(url:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
async function authenticatedPreviewFetch(url:RequestInfo|URL,init?:RequestInit){
  const headers=new Headers(await authHeader());new Headers(init?.headers).forEach((value,key)=>headers.set(key,value));init?.signal?.throwIfAborted();return fetch(url,{...init,headers});
}
type State={key:string;status:'pending'|'ready'|'invalid'|'unavailable';value?:VideoPreviewValue;error?:string};
/** Revision and account/workspace are part of the request identity. Render-time
 * key invalidation prevents even a fetch ignoring AbortSignal from publishing
 * stale results. This hook never mutates drafts or persistent support status. */
export function useVideoCompilePreview(input:{email?:string;model?:VideoCatalogModel;config:VideoNodeConfig;inputs:readonly OrderedInput[];
  node?:{id:string;revision:number};enabled?:boolean;request?:PrivateFetch}){
  const scope=useFeatureCatalogScope(),[retry,setRetry]=useState(0),[state,setState]=useState<State>({key:'',status:'pending'}),latest=useRef({key:'',revision:0});
  let draft:ReturnType<typeof videoUiDraft>|undefined,localError='';
  const enabled=input.enabled!==false&&!!input.email&&!!input.model?.execution&&!input.config.comfyWorkflowId;
  if(enabled)try{draft=videoUiDraft(input.config,input.inputs);}catch(error){localError=error instanceof Error?error.message:'视频草稿无效';}
  const endpoint=input.node?`/api/canvas/video-nodes/${encodeURIComponent(input.node.id)}/compile-preview`:'/api/video/compile-preview';
  const key=JSON.stringify([enabled,input.email,scope,endpoint,input.node?.revision,input.model?.modelId,input.model?.execution?.modelVersion,input.model?.execution?.modelDigest,draft,localError,retry]);
  if(latest.current.key!==key)latest.current={key,revision:latest.current.revision+1};
  const revision=latest.current.revision,request=input.request??authenticatedPreviewFetch,serialized=JSON.stringify(draft);
  useEffect(()=>{
    if(!enabled||localError)return;
    const controller=new AbortController(),current=()=>!controller.signal.aborted&&latest.current.key===key;
    setState({key,status:'pending'});
    const timer=setTimeout(()=>{void(async()=>{
      try{
        const body=input.node?{expectedRevision:input.node.revision,draftRevision:revision,modelId:input.model!.modelId,draft:JSON.parse(serialized)}
          :{projectKey:null,draftRevision:revision,modelId:input.model!.modelId,draft:JSON.parse(serialized)};
        const response=await request(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
        const raw=await response.json();if(!current())return;
        const result=videoPreviewResponseSchema.safeParse(raw);
        if(!result.success)throw new Error(raw&&typeof raw.error==='string'?raw.error:'视频预览响应尚未核实');
        if(result.data.ok){
          const value=result.data.value;
          if(!response.ok||value.draftRevision!==revision||value.publicModelId!==input.model!.modelId)throw new Error('视频预览修订不一致');
          if(value.modelVersion!==input.model!.execution!.modelVersion||value.modelDigest!==input.model!.execution!.modelDigest){
            window.dispatchEvent(new Event(MODEL_CATALOG_REFRESH));throw new Error('视频配置已更新，正在刷新模型');
          }
          setState({key,status:'ready',value});
        }else setState({key,status:'invalid',error:result.data.diagnostics[0].reason});
      }catch(error){if(current())setState({key,status:'unavailable',error:error instanceof Error?error.message:'视频预览暂不可用'});}
    })();},250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[enabled,key,endpoint,serialized,localError,request,revision]);
  const current=!enabled?undefined:localError?{key,status:'invalid' as const,error:localError}:state.key===key?state:{key,status:'pending' as const};
  return {enabled,status:current?.status??'idle',value:current?.status==='ready'?current.value:undefined,error:current?.error??'',retry:useCallback(()=>setRetry(value=>value+1),[])};
}
