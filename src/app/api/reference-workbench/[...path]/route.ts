import {workbenchStatus} from "@/lib/reference-workbench/status";
import {ZodError} from "zod";
import {createHash} from "node:crypto";
import {resolveUserEmail} from "@/lib/admin-auth";
import {dbEnabled, getPool} from "@/platform/db/pool";
import {isBanned} from "@/lib/accounts/repository";
import {sameSiteBillingMutation,PRIVATE_HEADERS} from "@/lib/billing/access";
import {userFeaturePolicy} from "@/lib/feature-access/repository";
import {allows} from "@/lib/feature-access/catalog";
import { checkRateLimit } from "@/lib/rate-limit-http";
import {streamImagegenZip,imagegenFilename} from "@/lib/imagegen/zip";
import {defaults,settings,WorkbenchError} from "@/lib/reference-workbench/contract";
import {document,operations,operation} from "@/lib/reference-workbench/repository";
import {saveWorkbenchSettings,createWorkbenchChat,changeWorkbenchChat,listWorkbenchTemplates,createWorkbenchTemplate,applyWorkbenchTemplate} from "@/lib/reference-workbench/documents";

import {ownedAsset,imageBytes,uploadFolder,projectItems,preview,accept,singleState,chatState,synchronize,publicModels} from "@/lib/reference-workbench/service";

import {workbenchFailure,type WorkbenchStage} from "@/lib/reference-workbench/errors";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:PRIVATE_HEADERS});
async function handler(request:Request){
 let stage:WorkbenchStage="request",action="";
 try{
  if(request.method!=="GET"&&!sameSiteBillingMutation(request))return json({error:"请求来源无效"},403);
  const owner=(await resolveUserEmail(request))?.toLowerCase();if(!owner)return json({error:"请先登录"},401);if(!dbEnabled)return json({error:"原生工作台需要持久数据库"},503);
  if(await isBanned(owner,""))return json({error:"账号已被封禁"},403);
  if(!allows(await userFeaturePolicy(owner),"batchshot"))return json({error:"此页面尚未授权"},403);
  const url=new URL(request.url),get=request.method==="GET";action=url.pathname.split("/api/reference-workbench/")[1]||"";
  stage=action==="quote"?"quote":["workbench/start","workbench/infer-prompts","workbench/edit","single/start","chat-image/send","chat-image/confirm"].includes(action)?"submit":"request";
  if(get&&action==="auth/status")return json({ok:true,id:"native-"+createHash("sha256").update(owner).digest("hex"),username:(await getPool().query("SELECT name FROM app_users WHERE email=$1",[owner])).rows[0]?.name||owner});
  if(get&&action==="heartbeat")return json({ok:true,id:"native-"+createHash("sha256").update(owner).digest("hex")});
  if(get&&action==="image"){
   const id=url.searchParams.get("path")||"",data=await imageBytes(owner,id);return new Response(new Uint8Array(data.buffer),{headers:{...PRIVATE_HEADERS,"Content-Type":data.mimeType,...(url.searchParams.get("download")==="1"?{"Content-Disposition":'attachment; filename="original.png"'}:{})}});
  }
  if(action==="workbench/upload-folder"&&!get){return json(await uploadFolder(owner,request));}
  if(get&&action==="settings")return json({...defaults,...await document<Record<string,any>>(owner,"settings","default").catch(()=>({})),provider_templates:[],models:await publicModels(),settings_editable:(await getPool().query("SELECT role FROM app_users WHERE email=$1",[owner])).rows[0]?.role==="admin",auth_id:"native-"+createHash("sha256").update(owner).digest("hex"),auth_username:owner});
  if(get&&action==="workbench/items")return json(await projectItems(owner,url.searchParams.get("root")||"",settings(Object.fromEntries(url.searchParams)),true,url.searchParams.get("operation_id")||undefined));
  if(get&&action==="single/status")return json(await singleState(owner,url.searchParams.get("id")||""));
  if(get&&action==="receipt"){const op=await operation(owner,url.searchParams.get("id")||"");if(op.state==="preview")return json({error:"尚未查到受理回执，请稍后查询原任务",state:"preview",operationId:op.id},409);return json(op.kind==="single/start"?await singleState(owner,op.id):op.kind.startsWith("chat-image")?await chatState(owner,op.plans[0].sessionId):{ok:true,id:op.id,accepted:op.plans.length});}
  if(get&&action==="single/tasks")return json({ok:true,tasks:await Promise.all((await operations(owner,"single/start")).map(o=>singleState(owner,o.id)))});
  if(get&&action==="chat-image/state")return json(await chatState(owner,url.searchParams.get("session_id")||""));
  if(get&&action==="status"){
   const root=url.searchParams.has("root")?url.searchParams.get("root")||"":undefined,operationId=url.searchParams.get("operation_id")||undefined;
   const ops=await operations(owner,undefined,root);const scoped=ops.filter(o=>root===undefined||o.body.workbench_root===root).filter(o=>!operationId||o.id===operationId);
   for(const o of scoped.slice(0,10))await synchronize(o);
   return json(workbenchStatus(await operations(owner,undefined,root),{root,operationId}));
  }
  if(get&&action==="workbench/templates")return json(await listWorkbenchTemplates(owner));
  if(get)return json({error:"接口不存在"},404);
  // Limit before JSON parsing; original native media limits are enforced again.
  if(Number(request.headers.get("content-length"))>90*1024*1024)return json({error:"请求内容过大"},413);
  let body:any;try{body=await request.json();}catch{const failure=workbenchFailure(new ZodError([]),stage,action);return json(failure.body,400);}if(!body||typeof body!=="object"||Array.isArray(body))throw new WorkbenchError("请求格式无效");
  if(action==="quote"){if(typeof body.action!=="string"||!body.body||typeof body.body!=="object"||Array.isArray(body.body))throw new WorkbenchError("报价请求格式无效");if (["workbench/infer-prompts","chat-image/send"].includes(body.action)) {
    const rateLimitResult = await checkRateLimit(`ref-quote:${owner}`,40,600000);
    if (rateLimitResult instanceof Response) return rateLimitResult;
    if (!rateLimitResult) return json({error:"请求过于频繁"},429);
  }return json(await preview(owner,String(body.action||""),body.body||{}));}
  if(["workbench/start","workbench/infer-prompts","workbench/edit","single/start","chat-image/send","chat-image/confirm"].includes(action))return json(await accept(owner,action,body));
  if(action==="settings")return json(await saveWorkbenchSettings(owner,body));
  if(action==="chat-image/new")return json(await createWorkbenchChat(owner));
  if(["chat-image/delete","chat-image/clear","chat-image/cancel"].includes(action))return json(await changeWorkbenchChat(owner,{kind:action.slice("chat-image/".length) as "delete"|"clear"|"cancel",sessionId:String(body.session_id||""),messageId:body.message_id}));
  if(action==="workbench/templates")return json(await createWorkbenchTemplate(owner,{root:String(body.workbench_root),config:body.config,referenceId:body.ref_path,versionId:body.version_path,name:body.name}));
  if(/^workbench\/templates\/[^/]+\/apply$/.test(action))return json(await applyWorkbenchTemplate(owner,action.split("/")[2],String(body.workbench_root)));
  if(["images-zip","workbench/download-zip"].includes(action)){
   let paths:string[]=[];if(action==="images-zip")paths=body.paths;else{
    const {items}=await projectItems(owner,String(body.workbench_root),settings(body.config));for(const entry of body.items||[]){const it=items.find(i=>i.ref_path===entry.ref_path);if(!it)throw new WorkbenchError("图片不属于当前项目");if(body.include_original)paths.push(it.ref_path);if(body.include_generated){if(entry.version_path){if(!it.versions.some((v:any)=>v.path===entry.version_path))throw new WorkbenchError("历史版本不存在");paths.push(entry.version_path);}else if(it.versions.length)paths.push(it.versions.at(-1)!.path);}}
   }
   if(!Array.isArray(paths)||!paths.length||paths.length>1000||paths.some(p=>typeof p!=="string"))throw new WorkbenchError("请选择要下载的图片");paths=Array.from(new Set(paths));for(const id of paths)await ownedAsset(owner,id);
   async function* files(){for(const [i,id] of paths.entries()){const a=await ownedAsset(owner!,id),b=await imageBytes(owner!,id);yield {name:imagegenFilename(a.relative,i+1,b.mimeType==="image/jpeg"?"jpg":b.mimeType==="image/webp"?"webp":"png"),bytes:b.buffer};}}
   const iterator=streamImagegenZip(files());return new Response(new ReadableStream({async pull(controller){try{const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(new Uint8Array(next.value));}catch(e){controller.error(e);}},async cancel(){await iterator.return(undefined);}}),{headers:{...PRIVATE_HEADERS,"Content-Type":"application/zip","Content-Disposition":'attachment; filename="workbench.zip"'}});
  }
  return json({error:"接口不存在"},404);
 }catch(error){const failure=workbenchFailure(error,stage,action);return json(failure.body,failure.status);}
}
export const GET=handler;
export const POST=handler;
