import {ZodError} from "zod";
import {randomUUID,createHash} from "node:crypto";
import {resolveUserEmail,requireAdmin} from "@/lib/admin-auth";
import {dbEnabled, getPool} from "@/platform/db/pool";
import {isBanned} from "@/lib/accounts/repository";
import {sameSiteBillingMutation,PRIVATE_HEADERS} from "@/lib/billing/access";
import {userFeaturePolicy} from "@/lib/feature-access/repository";
import {allows} from "@/lib/feature-access/catalog";
import {rateLimit} from "@/lib/rate-limit";
import {streamImagegenZip,imagegenFilename} from "@/lib/imagegen/zip";
import {cancelImagegenBatch} from "@/lib/imagegen/batch";
import {defaults,settings,classify,LABELS,imageUrl,WorkbenchError,type Asset,type Project} from "@/lib/reference-workbench/contract";
import {document,documents,putDocument,operations,operation,transaction} from "@/lib/reference-workbench/repository";
import {ensureWorkbench} from "@/lib/reference-workbench/schema";

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
  if(get&&action==="workbench/items")return json(await projectItems(owner,url.searchParams.get("root")||"",settings(Object.fromEntries(url.searchParams))));
  if(get&&action==="single/status")return json(await singleState(owner,url.searchParams.get("id")||""));
  if(get&&action==="receipt"){const op=await operation(owner,url.searchParams.get("id")||"");if(op.state==="preview")return json({error:"尚未查到受理回执，请稍后查询原任务",state:"preview",operationId:op.id},409);return json(op.kind==="single/start"?await singleState(owner,op.id):op.kind.startsWith("chat-image")?await chatState(owner,op.plans[0].sessionId):{ok:true,id:op.id,accepted:op.plans.length});}
  if(get&&action==="single/tasks")return json({ok:true,tasks:await Promise.all((await operations(owner,"single/start")).map(o=>singleState(owner,o.id)))});
  if(get&&action==="chat-image/state")return json(await chatState(owner,url.searchParams.get("session_id")||""));
  if(get&&action==="status"){
   const ops=await operations(owner);for(const o of ops.slice(0,10))await synchronize(o);const fresh=await operations(owner),running=fresh.filter(o=>o.state!=="done"),latest=fresh[0],items=fresh.flatMap(o=>o.result.items||[]);
   return json({running:!!running.length,progress:{current:running.length?"运行中":"等待",product:latest?.body.workbench_root||"",size:latest?.plans[0]?.settings.resolution||"",ref:latest?.plans[0]?.ref||"",done:items.filter(i=>i.state==="succeeded").length,failed:items.filter(i=>["failed","needs_attention"].includes(i.state)).length,last_error:items.find(i=>i.result?.error)?.result?.error?.message||""},queue:{running:items.filter(i=>i.state==="submitted").length,waiting:items.filter(i=>i.state==="queued").length,global_limit:2,user_limit:2}});
  }
  if(get&&action==="workbench/templates")return json({templates:(await documents<any>(owner,"template")).map(d=>({id:d.id,...d.payload}))});
  if(get)return json({error:"接口不存在"},404);
  // Limit before JSON parsing; original native media limits are enforced again.
  if(Number(request.headers.get("content-length"))>90*1024*1024)return json({error:"请求内容过大"},413);
  let body:any;try{body=await request.json();}catch{const failure=workbenchFailure(new ZodError([]),stage,action);return json(failure.body,400);}if(!body||typeof body!=="object"||Array.isArray(body))throw new WorkbenchError("请求格式无效");
  if(action==="quote"){if(typeof body.action!=="string"||!body.body||typeof body.body!=="object"||Array.isArray(body.body))throw new WorkbenchError("报价请求格式无效");if(["workbench/infer-prompts","chat-image/send"].includes(body.action)&&!rateLimit(`ref-quote:${owner}`,40,600000))return json({error:"请求过于频繁"},429);return json(await preview(owner,String(body.action||""),body.body||{}));}
  if(["workbench/start","workbench/infer-prompts","workbench/edit","single/start","chat-image/send","chat-image/confirm"].includes(action))return json(await accept(owner,action,body));
  if(action==="settings"){const keys=["single_quality","single_resolution","single_ratio","single_count","chat_task_mode","chat_ratio_mode"];const old=await document<any>(owner,"settings","default").catch(()=>({}));for(const k of keys)if(Object.hasOwn(body,k))old[k]=body[k];settings({quality:old.single_quality||"high",resolution:old.single_resolution||"2k",ratio:old.single_ratio||"1:1",count:old.single_count||1,task_mode:old.chat_task_mode||"confirm",ratio_mode:old.chat_ratio_mode||"smart"});await putDocument(owner,"settings","default",old);return json({ok:true});}
  if(action==="chat-image/new"){const id=randomUUID();await putDocument(owner,"chat",id,{title:"新对话",messages:[]});return json(await chatState(owner,id));}
  if(["chat-image/delete","chat-image/clear","chat-image/cancel"].includes(action)){
   const sid=String(body.session_id||"");await transaction(`reference-chat:${sid}`,async tx=>{const chat=await document<any>(owner,"chat",sid,tx);
    if(action.endsWith("cancel")){const m=chat.messages.find((m:any)=>m.id===body.message_id);if(!m||m.status!=="plan_pending")throw new WorkbenchError("计划已提交或不存在",409);m.status="cancelled";}
    else{if(chat.messages.some((m:any)=>["thinking","queued","generating"].includes(m.status)))throw new WorkbenchError("请等待当前任务结束后再清理对话",409);chat.messages=[];}
    if(action.endsWith("delete"))await tx.query("UPDATE app_reference_documents SET deleted=true,updated_at=now() WHERE owner=$1 AND kind='chat' AND id=$2",[owner,sid]);else await putDocument(owner,"chat",sid,chat,tx);
   });return json(await chatState(owner,action.endsWith("delete")?"":sid));
  }
  if(action==="workbench/templates"){
   const {items}=await projectItems(owner,String(body.workbench_root),settings(body.config)),it=items.find(i=>i.ref_path===body.ref_path),version=it?.versions.find((v:any)=>v.path===body.version_path);if(!it||!version)throw new WorkbenchError("历史版本不存在",404);
   const chosen=(await operations(owner)).flatMap(o=>o.plans.map(t=>({o,t}))).find(({o,t})=>t.ref===it.ref_path&&(o.result.items||[]).some((i:any)=>i.key===t.key&&(i.result?.artifacts||[]).some((a:any)=>a.artworkId===version.path)));if(!chosen)throw new WorkbenchError("历史版本缺少冻结参数",409);
   const ref=await ownedAsset(owner,it.ref_path),result=await ownedAsset(owner,version.path),id=randomUUID(),template={name:String(body.name||it.product+" "+version.label).slice(0,100),reference_path:ref.artworkId,result_path:result.artworkId,reference_url:imageUrl(ref.artworkId),result_url:imageUrl(result.artworkId),prompt:chosen.t.prompt,kind:it.kind,source_version:version.label,parameters:chosen.t.settings,created:Date.now()/1000};await putDocument(owner,"template",id,template);return json({ok:true,template:{id,...template}});
  }
  if(/^workbench\/templates\/[^/]+\/apply$/.test(action)){
   const template=await document<any>(owner,"template",action.split("/")[2]),root=String(body.workbench_root),ref=await ownedAsset(owner,template.reference_path);const cloned={...ref,relative:`${LABELS[template.kind]}/模板-${action.split("/")[2]}.png`,prompt:template.prompt};
   await transaction(`reference-project:${root}`,async tx=>{const p=await document<Project>(owner,"project",root,tx);if(!p.assets.some(a=>a.artworkId===cloned.artworkId))p.assets.push(cloned);await putDocument(owner,"project",root,p,tx);});return json({ok:true,ref_path:ref.artworkId,prompt:template.prompt,kind:template.kind,parameters:template.parameters});
  }
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
