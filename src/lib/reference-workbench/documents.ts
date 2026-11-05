import "server-only";
import {randomUUID} from "node:crypto";
import {settings,LABELS,imageUrl,WorkbenchError,type Project,type Settings} from "./contract";
import {document,documents,putDocument,operations,transaction,deleteChatDocumentTx} from "./repository";
import {chatState,projectItems,ownedAsset} from "./service";

/** Workbench-owned document use cases. HTTP adapters pass an authenticated owner
 * and parsed intent; no Request/cookie/Response or model re-planning lives here. */
export async function saveWorkbenchSettings(owner:string,patch:Record<string,unknown>){
 const old:Record<string,unknown>=await document<Record<string,unknown>>(owner,"settings","default").catch(()=>({}));
 for(const key of ["single_quality","single_resolution","single_ratio","single_count","chat_task_mode","chat_ratio_mode"])if(Object.hasOwn(patch,key))old[key]=patch[key];
 settings({quality:old.single_quality||"high",resolution:old.single_resolution||"2k",ratio:old.single_ratio||"1:1",count:old.single_count||1,task_mode:old.chat_task_mode||"confirm",ratio_mode:old.chat_ratio_mode||"smart"});
 await putDocument(owner,"settings","default",old);return {ok:true};
}
export async function createWorkbenchChat(owner:string){
 const id=randomUUID();await putDocument(owner,"chat",id,{title:"新对话",messages:[]});return chatState(owner,id);
}
type ChatDocument={title:string;messages:Array<{id:string;status:string;[key:string]:unknown}>;[key:string]:unknown};
export type WorkbenchChatCommand={kind:"clear"|"delete"|"cancel";sessionId:string;messageId?:unknown};
export async function changeWorkbenchChat(owner:string,command:WorkbenchChatCommand){
 const {kind,sessionId,messageId}=command;
 await transaction(`reference-chat:${sessionId}`,async tx=>{
  const chat=await document<ChatDocument>(owner,"chat",sessionId,tx);
  if(kind==="cancel"){
   const message=chat.messages.find(m=>m.id===messageId);
   if(!message||message.status!=="plan_pending")throw new WorkbenchError("计划已提交或不存在",409);
   message.status="cancelled";
  }else{
   if(chat.messages.some(m=>["thinking","queued","generating"].includes(m.status)))throw new WorkbenchError("请等待当前任务结束后再清理对话",409);
   chat.messages=[];
  }
  if(kind==="delete")await deleteChatDocumentTx(tx,owner,sessionId);else await putDocument(owner,"chat",sessionId,chat,tx);
 });
 return chatState(owner,kind==="delete"?"":sessionId);
}
export type WorkbenchTemplate={name:string;reference_path:string;result_path:string;reference_url:string;result_url:string;prompt:string;kind:string;source_version:string;parameters:Settings;created:number};
export async function listWorkbenchTemplates(owner:string){
 return {templates:(await documents<WorkbenchTemplate>(owner,"template")).map(d=>({id:d.id,...d.payload}))};
}
export async function createWorkbenchTemplate(owner:string,input:{root:string;config?:Record<string,unknown>;referenceId:unknown;versionId:unknown;name?:unknown}){
 const {items}=await projectItems(owner,input.root,settings(input.config)),item=items.find(i=>i.ref_path===input.referenceId),version=item?.versions.find((v:any)=>v.path===input.versionId);
 if(!item||!version)throw new WorkbenchError("历史版本不存在",404);
 const chosen=(await operations(owner)).flatMap(o=>o.plans.map(t=>({o,t}))).find(({o,t})=>t.ref===item.ref_path&&(o.result.items||[]).some((i:any)=>i.key===t.key&&(i.result?.artifacts||[]).some((a:any)=>a.artworkId===version.path)));
 if(!chosen)throw new WorkbenchError("历史版本缺少冻结参数",409);
 const ref=await ownedAsset(owner,item.ref_path),result=await ownedAsset(owner,version.path),id=randomUUID();
 const template:WorkbenchTemplate={name:String(input.name||item.product+" "+version.label).slice(0,100),reference_path:ref.artworkId,result_path:result.artworkId,reference_url:imageUrl(ref.artworkId),result_url:imageUrl(result.artworkId),prompt:chosen.t.prompt,kind:item.kind,source_version:version.label,parameters:chosen.t.settings,created:Date.now()/1000};
 await putDocument(owner,"template",id,template);return {ok:true,template:{id,...template}};
}
export async function applyWorkbenchTemplate(owner:string,templateId:string,root:string){
 const template=await document<WorkbenchTemplate>(owner,"template",templateId),ref=await ownedAsset(owner,template.reference_path);
 const cloned={...ref,relative:`${LABELS[template.kind]}/模板-${templateId}.png`,prompt:template.prompt};
 await transaction(`reference-project:${root}`,async tx=>{
  const project=await document<Project>(owner,"project",root,tx);
  if(!project.assets.some(a=>a.artworkId===cloned.artworkId))project.assets.push(cloned);
  await putDocument(owner,"project",root,project,tx);
 });
 return {ok:true,ref_path:ref.artworkId,prompt:template.prompt,kind:template.kind,parameters:template.parameters};
}
