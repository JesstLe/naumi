import {authHeader} from "../supabase";
import {workbenchModelOptions,workbenchModelSelection} from "./model-options";
import {workbenchErrorText} from "./http";
import {setLocalItem,trimWorkbenchPromptStores} from "../browser-storage/local";
import {boundedWorkbenchPrompts,WORKBENCH_PROMPTS_KEY} from "./local-prompts";

declare global {interface Window {NaumiWorkbenchStorage:Pick<Storage,"getItem"|"setItem"|"removeItem">;NaumiWorkbenchReady:Promise<void>;NaumiWorkbenchModels:(select:HTMLSelectElement)=>void;NaumiWorkbenchError:typeof workbenchErrorText;}}
window.NaumiWorkbenchError=workbenchErrorText;
const desktop=location.pathname.startsWith("/desktop/batchshot/native/"),canonicalBase="/api/reference-workbench/",base=(desktop?"/desktop":"")+canonicalBase,original=window.fetch.bind(window),blobUrls=new Map<string,string>(),blobLoading=new Map<string,Promise<string>>();
function scopedUrl(input:RequestInfo|URL){const target=new URL(typeof input==="string"?input:input instanceof Request?input.url:input.toString(),location.href);if(desktop&&target.origin===location.origin&&target.pathname.startsWith("/api/"))target.pathname="/desktop"+target.pathname;return target;}
let sessionIdentity="";
async function nativeFetch(input:RequestInfo|URL,init?:RequestInit){
 const target=scopedUrl(input);
 if(target.origin!==location.origin)return original(input,init);
 const headers=new Headers(input instanceof Request?input.headers:undefined);for(const [key,value] of new Headers(init?.headers))headers.set(key,value);
 for(const [key,value] of Object.entries(await authHeader()))headers.set(key,value);
 return original(input instanceof Request?new Request(target.href,input):target.href,{...init,headers,credentials:"same-origin"});
}
window.fetch=async(input,init)=>{
 const url=scopedUrl(input);
 if(url.origin!==location.origin||!url.pathname.startsWith(base))return nativeFetch(input,init);
 const action=url.pathname.slice(base.length),paid=["workbench/start","workbench/infer-prompts","workbench/edit","single/start","chat-image/send","chat-image/confirm"];
 if(init?.method==="POST"&&paid.includes(action)){
  const body=JSON.parse(String(init.body));body.request_id=body.request_id||crypto.randomUUID();
  const model=(document.getElementById("active_provider_template")||document.getElementById("template")) as HTMLSelectElement|null;
  if(model?.value){if(action.startsWith("workbench/"))body.config={...body.config,modelId:model.value};else if(action.startsWith("chat-image/"))body.settings={...body.settings,modelId:model.value};else body.modelId=model.value;}
  let q:any;
  try{
   const quoteResponse=await nativeFetch(base+"quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,body})});if(!quoteResponse.ok){
    let data:any;try{data=await quoteResponse.clone().json();}catch{}
    return Response.json({ok:false,error:typeof data?.error==="string"?data.error:"报价暂时不可用，本次未发起新的生成提交。请稍后重新报价",stage:"quote",code:typeof data?.code==="string"?data.code:"QUOTE_UNAVAILABLE",traceId:data?.traceId},{status:quoteResponse.status});
   }
   q=await quoteResponse.json();
   if(!q||typeof q.id!=="string"||!Array.isArray(q.items)||!Array.isArray(q.warnings)||!Number.isFinite(q.totalCredits))throw Error("invalid quote");
  }catch{return Response.json({ok:false,error:"报价暂时不可用，本次未发起新的生成提交。请稍后重新报价",stage:"quote",code:"QUOTE_UNAVAILABLE"},{status:503});}
  body.native_quote={id:q.id};

  try{
   const submitted=await nativeFetch(input,{...init,body:JSON.stringify(body)});
   if(submitted.status<500){
    // A framework HTML 200 is not a durable acceptance receipt either.
    if(!submitted.ok)return submitted;
    const data=await submitted.clone().json();if(data&&data.ok!==false&&(typeof data.id==="string"||typeof data.task_id==="string"||typeof data.session_id==="string"))return submitted;
   }
  }catch{ /* Lost or malformed acceptance response: lookup, never resubmit. */ }
  try{
   const receipt=await nativeFetch(base+"receipt?id="+encodeURIComponent(q.id));
   const data=await receipt.clone().json();
   if(receipt.ok&&data&&data.ok!==false&&(typeof data.id==="string"||typeof data.task_id==="string"||typeof data.session_id==="string"))return receipt;
   // A preview snapshot can race an in-flight accept transaction. It is not
   // evidence of terminal rejection and must not authorize a fresh submission.
  }catch{ /* A failed receipt lookup does not prove rejection. */ }
  return Response.json({ok:false,error:"提交结果待核查，请查询原任务，勿重复提交。原任务编号："+q.id,stage:"submit",code:"SUBMISSION_UNKNOWN",operationId:q.id},{status:409});
 }
 const response=await nativeFetch(input,init);if(response.status===401){blobUrls.forEach(v=>URL.revokeObjectURL(v));blobUrls.clear();location.assign("/sign-in");}
 if(response.ok&&["heartbeat","auth/status"].includes(action)){const identity=(await response.clone().json()).id;if(sessionIdentity&&identity&&identity!==sessionIdentity){blobUrls.forEach(v=>URL.revokeObjectURL(v));blobUrls.clear();location.reload();}}
 return response;
};
async function privateBlob(source:string){
 const target=scopedUrl(source);if(target.origin!==location.origin||target.pathname!==base+"image")return source;
 target.searchParams.delete("t");target.searchParams.delete("download");const key=target.toString();if(blobUrls.has(key))return blobUrls.get(key)!;
 if(blobLoading.has(key))return blobLoading.get(key)!;
 const job=(async()=>{const response=await nativeFetch(target);if(!response.ok)throw Error("图片读取失败");const url=URL.createObjectURL(await response.blob());blobUrls.set(key,url);return url;})().finally(()=>blobLoading.delete(key));blobLoading.set(key,job);return job;
}
window.NaumiWorkbenchReady=(async()=>{
 const response=await nativeFetch(base+"auth/status");if(!response.ok){location.assign("/sign-in");return;}
 const auth=await response.json();if(!auth.id)throw Error("账号标识缺失");
 sessionIdentity=auth.id;
 const prefix="naumi-reference:"+auth.id+":";// Native pages share the site's localStorage quota: prompt history stays bounded
 // and a full quota first releases rebuildable space (see browser-storage/local).
 window.NaumiWorkbenchStorage={getItem:k=>localStorage.getItem(prefix+k),setItem:(k,v)=>{try{setLocalItem(prefix+k,k===WORKBENCH_PROMPTS_KEY?boundedWorkbenchPrompts(v):v);}catch(error){/* Page settings only; startup must not abort on a full quota. */console.warn("workbench storage write skipped",k,error);window.dispatchEvent(new Event("naumi-workbench-storage-full"));}},removeItem:k=>localStorage.removeItem(prefix+k)};
 try{trimWorkbenchPromptStores();}catch{/* optional upkeep before the page reads its prompts */}
 const choices=await nativeFetch(base+"settings").then(r=>r.json());
 const modelChoices=workbenchModelOptions(choices.models||[]);
 window.NaumiWorkbenchModels=model=>{model.innerHTML="";model.add(new Option("服务器自动分配",""));for(const m of modelChoices)model.add(new Option(m.label,m.id));model.disabled=false;model.value=workbenchModelSelection(window.NaumiWorkbenchStorage.getItem("native-model")||"",modelChoices);if(!model.dataset.nativeModels){model.dataset.nativeModels="1";model.addEventListener("change",()=>window.NaumiWorkbenchStorage.setItem("native-model",model.value));}};
 const patchImage=(node:Element)=>{if(!(node instanceof HTMLImageElement))return;const src=node.getAttribute("src");if(!src||![base+"image",canonicalBase+"image"].some(prefix=>src.startsWith(prefix)))return;const history=(window as any).WorkbenchHistory;
  // The history cache downloads each image once and keeps it for later visits; other pages keep the session blob.
  (history?.localUrl?(history.localUrl(src) as Promise<string>).catch(()=>privateBlob(src)):privateBlob(src)).then(blob=>{if(node.getAttribute("src")===src)node.src=blob;}).catch(()=>{});};
 const observer=new MutationObserver(changes=>{for(const change of changes){if(change.type==="attributes")patchImage(change.target as Element);else for(const node of change.addedNodes)if(node instanceof Element){patchImage(node);node.querySelectorAll("img").forEach(patchImage);}}});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["src"]});
 for(const old of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="text/naumi-workbench"]'))){const script=document.createElement("script");if(old.src){script.src=old.src;await new Promise<void>((resolve,reject)=>{script.onload=()=>resolve();script.onerror=()=>reject(Error("工作台脚本读取失败"));document.body.append(script);});}else{script.textContent=old.textContent;document.body.append(script);}old.remove();}
 // Preserve original download controls while attaching native bearer auth.
 (window as any).downloadImageUrl=async(source:string)=>{try{const url=await privateBlob(source),a=document.createElement("a");a.href=url;a.download="原图.png";a.click();}catch(e){alert(String(e));}};
 document.getElementById("native-auth-gate")?.remove();
 const model=(document.getElementById("active_provider_template")||document.getElementById("template")) as HTMLSelectElement|null;
 if(model)window.NaumiWorkbenchModels(model);
 window.addEventListener("pagehide",()=>{observer.disconnect();blobUrls.forEach(v=>URL.revokeObjectURL(v));blobUrls.clear();});
})();
