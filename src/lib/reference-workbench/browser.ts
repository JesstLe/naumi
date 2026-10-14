import {authHeader} from "../supabase";

declare global {interface Window {NaumiWorkbenchStorage:Pick<Storage,"getItem"|"setItem"|"removeItem">;NaumiWorkbenchReady:Promise<void>;NaumiWorkbenchModels:(select:HTMLSelectElement)=>void;}}
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
  const quoteResponse=await nativeFetch(base+"quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,body})});if(!quoteResponse.ok)return quoteResponse;
  const q=await quoteResponse.json();
  if(q.state==="preview"&&!confirm(`本次 ${q.items.length} 项，共 ${q.totalCredits} 积分；当前可用 ${q.availableCredits} 积分。${q.items.map((i:{credits:number;ratio?:string},n:number)=>`\n${n+1}. ${i.credits} 积分${i.ratio?` / ${i.ratio}`:""}`).join("")}${q.warnings.length?"\n"+q.warnings.join("\n"):""}\n确认提交？`))return Response.json({ok:false,error:"已取消提交"},{status:409});
  body.native_quote={id:q.id,credits:q.totalCredits,confirmed:true};
  try{return await nativeFetch(input,{...init,body:JSON.stringify(body)});}catch{
   // Recover this exact receipt. Never create a new paid operation after a lost response.
   const receipt=await nativeFetch(base+"receipt?id="+encodeURIComponent(q.id));
   return receipt.ok?receipt:Response.json({ok:false,error:"提交结果待核查，请保留原任务编号："+q.id},{status:409});
  }
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
 const prefix="naumi-reference:"+auth.id+":";window.NaumiWorkbenchStorage={getItem:k=>localStorage.getItem(prefix+k),setItem:(k,v)=>localStorage.setItem(prefix+k,v),removeItem:k=>localStorage.removeItem(prefix+k)};
 const choices=await nativeFetch(base+"settings").then(r=>r.json());
 window.NaumiWorkbenchModels=model=>{model.innerHTML="";model.add(new Option("服务器自动分配",""));for(const m of choices.models||[])model.add(new Option(m.label,m.id));model.disabled=false;model.value=window.NaumiWorkbenchStorage.getItem("native-model")||"";if(!model.dataset.nativeModels){model.dataset.nativeModels="1";model.addEventListener("change",()=>window.NaumiWorkbenchStorage.setItem("native-model",model.value));}};
 const patchImage=(node:Element)=>{if(!(node instanceof HTMLImageElement))return;const src=node.getAttribute("src");if(!src||![base+"image",canonicalBase+"image"].some(prefix=>src.startsWith(prefix)))return;privateBlob(src).then(blob=>{if(node.getAttribute("src")===src)node.src=blob;}).catch(()=>{});};
 const observer=new MutationObserver(changes=>{for(const change of changes){if(change.type==="attributes")patchImage(change.target as Element);else for(const node of change.addedNodes)if(node instanceof Element){patchImage(node);node.querySelectorAll("img").forEach(patchImage);}}});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["src"]});
 const entryPath=desktop?"/desktop/batchshot":"/batchshot";
 document.querySelectorAll<HTMLAnchorElement>(".lanLinkBox button").forEach(button=>button.setAttribute("onclick",`copyLanLink(${JSON.stringify(location.origin+entryPath)})`));const link=document.querySelector(".lanLinkText");if(link)link.textContent="本站链接："+location.origin+entryPath;
 for(const old of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="text/naumi-workbench"]'))){const script=document.createElement("script");if(old.src){script.src=old.src;await new Promise<void>((resolve,reject)=>{script.onload=()=>resolve();script.onerror=()=>reject(Error("工作台脚本读取失败"));document.body.append(script);});}else{script.textContent=old.textContent;document.body.append(script);}old.remove();}
 // Preserve original download controls while attaching native bearer auth.
 (window as any).downloadImageUrl=async(source:string)=>{try{const url=await privateBlob(source),a=document.createElement("a");a.href=url;a.download="原图.png";a.click();}catch(e){alert(String(e));}};
 document.getElementById("native-auth-gate")?.remove();
 const model=(document.getElementById("active_provider_template")||document.getElementById("template")) as HTMLSelectElement|null;
 if(model)window.NaumiWorkbenchModels(model);
 window.addEventListener("pagehide",()=>{observer.disconnect();blobUrls.forEach(v=>URL.revokeObjectURL(v));blobUrls.clear();});
})();
