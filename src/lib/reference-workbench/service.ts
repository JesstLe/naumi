import { withBackgroundActivity, detachBackgroundActivity, bindBackgroundClaim } from "@/lib/release-runtime/background-activity";
import { releaseRuntimeEnabled } from "@/lib/release-runtime/identity";
import "server-only";
import {excludeImportedHistory,isImportedHistory} from '../staging-history';
import {randomUUID} from "node:crypto";
import {getPool} from "@/platform/db/pool";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {isBanned} from "@/lib/accounts/repository";
import {saveImagegenInput,readImagegenInputAsset} from "../imagegen/input-assets";
import {readCanvasImage} from "../canvas-image-input";
import {planImagegen,imagegenFingerprint} from "../imagegen/plan";
import {submitAcceptedImagegenBatch,readImagegenBatch,runImagegenBatchTick} from "../imagegen/batch";
import {deferApplicationTask} from "../application/task-execution";
import type {ImagegenPlan,ImagegenRequest} from "../imagegen/types";
import {getModelAdministration} from "../model-config/server";
import {workbenchModelOptions} from "./model-options";
import {modelAllowedForFeature,featureDefaultModel} from "../model-config/tool-scope";
import {quoteForRequest} from "../billing/server";
import {withBillingRequest} from "../billing/synchronous";
import {configuredToolCost} from "@/lib/billing/synchronous-operation";
import {signUserSession,USER_COOKIE} from "../native-auth";
import {signAcceptedModelContext} from "../model-config/accepted-context";
import {observeOpenAI} from "@/lib/bi/model-calls";
import {withBiRequest} from "@/lib/bi/request";
import {modelAwareOpenAI} from "../model-config/clients";
import {requestedTextModel} from "../text-models";
import {toVisionDataUrl} from "../vision-image";
import {getOpenAISettings} from "../settings";
import {dataUrlToBytes} from "../storage";
import {DEFAULT_PROMPT,DEFAULT_INSTRUCTION,MODES,LABELS,settings,relativePath,classify,imageUrl,ratio,geometryMatches,stableId,requestId,digest,WorkbenchError,type Asset,type Project,type Settings} from "./contract";
import {chatPlanInstruction,parseChatPlan,textFailureState,type TextFailureStage} from "./chat-plan";
export {parseChatPlan} from "./chat-plan";
import {document,putDocument,documents,transaction,operation,operations,type Operation} from "./repository";
import {ensureWorkbench} from "@/lib/reference-workbench/schema";


export async function ownedAsset(owner:string,id:string):Promise<Asset>{
 if(id.startsWith("asset-")){const a=await readImagegenInputAsset(id,owner).catch(()=>{throw new WorkbenchError("素材不存在或无权访问",404);});const saved=await document<Asset>(owner,"asset",id).catch(()=>null);if(saved)return saved;const sharp=(await import("sharp")).default,m=await sharp(a.buffer).metadata();return {artworkId:id,url:a.url,width:m.width!,height:m.height!,relative:id};}
 const work=(await listArtworksByIds(owner,[id]))[0];if(!work?.image||work.videoUrl)throw new WorkbenchError("素材不存在或无权访问",404);
 const original=await readCanvasImage(work.image,"http://internal",owner),sharp=(await import("sharp")).default,m=await sharp(original.buffer).metadata();return {artworkId:id,url:work.image,width:m.width!,height:m.height!,relative:work.title||id};
}
export async function imageBytes(owner:string,id:string){const a=await ownedAsset(owner,id);return readCanvasImage(a.url,"http://internal",owner);}
async function saveAsset(owner:string,bytes:Buffer,relative:string){if(bytes.length>12*1024*1024)throw new WorkbenchError("单张原图需小于12MiB",413);const saved={...await saveImagegenInput(bytes,owner),relative};await putDocument(owner,"asset",saved.artworkId,saved);return saved;}
async function inlineAssets(owner:string,raw:unknown){
 if(!Array.isArray(raw)||raw.length>8)throw new WorkbenchError("最多选择8张参考图");let total=0;const assets=[];
 for(const value of raw){if(typeof value!=="string")throw new WorkbenchError("图片格式无效");const parsed=dataUrlToBytes(value);if(!parsed||!parsed.contentType.startsWith("image/"))throw new WorkbenchError("请上传原始图片，不使用外部素材地址");total+=parsed.bytes.length;if(total>64*1024*1024)throw new WorkbenchError("参考图合计需小于64MiB",413);assets.push(await saveAsset(owner,Buffer.from(parsed.bytes),"参考图"));}return assets;
}
export async function uploadFolder(owner:string,request:Request){
 const form=await request.formData();let manifest:{path:string}[];try{manifest=JSON.parse(String(form.get("manifest")));}catch{throw new WorkbenchError("文件清单无效");}const files=form.getAll("files");
 if(!Array.isArray(manifest)||!manifest.length||files.length!==manifest.length||files.length>500)throw new WorkbenchError("文件清单与上传数量不匹配");
 const paths=manifest.map(x=>relativePath(x.path));if(new Set(paths).size!==paths.length)throw new WorkbenchError("图片路径重复");
 let total=0;for(const f of files){if(typeof f==="string"||f.size>12*1024*1024)throw new WorkbenchError("单张原图需小于12MiB",413);total+=f.size;}if(total>300*1024*1024)throw new WorkbenchError("产品文件夹超过300MiB",413);
 const assets:Asset[]=[];for(let i=0;i<files.length;i++)assets.push(await saveAsset(owner,Buffer.from(await(files[i] as File).arrayBuffer()),paths[i]));
 const name=manifest[0].path.replace(/\\/g,"/").split("/")[0],id=randomUUID()+"/"+name;await putDocument(owner,"project",id,{name,assets} satisfies Project);return {ok:true,product_dir:id,saved:assets.length,skipped:0};
}
type TaskPlan={key:string;ref:string;root?:string;kind:string;prompt:string;settings:Settings;inputs:Asset[];geometry?:{width:number;height:number};plan?:ImagegenPlan;quote?:any;state?:string;startedAt?:number;text?:string;error?:string;source?:string;annotated?:string;messageId?:string;sessionId?:string;taskName?:string;promptIndex?:number;variantIndex?:number;autoAuthorization?:{modelVersion:number;billingVersion:number}};
export async function projectItems(owner:string,root:string,cfg:Settings,refresh=true){
 if(!root)return {items:[],products:[] as Asset[]};const p=await document<Project>(owner,"project",root),products=p.assets.filter(x=>classify(x.relative,cfg.sku_refs_dir_name)==="product");
 if(!products.length)throw new WorkbenchError("根目录或产品图文件夹中需要至少一张产品图");const ops=await operations(owner,undefined,root);
 if(refresh)for(const op of ops)await synchronize(op);
 const currentOps=refresh?await operations(owner,undefined,root):ops;
 const items=p.assets.filter(a=>MODES[cfg.mode].includes(classify(a.relative,cfg.sku_refs_dir_name))).map(a=>{
  const histories=currentOps.flatMap(o=>(o.plans as TaskPlan[]).filter(t=>t.ref===a.artworkId).map(t=>({o,t}))),gens=histories.filter(x=>x.t.kind!=="infer"),latest=gens[0],inf=histories.find(x=>x.t.kind==="infer");
  const versions=gens.slice().reverse().flatMap(({o,t})=>(o.result.items||[]).filter((i:any)=>i.key===t.key).flatMap((i:any)=>(i.result?.artifacts||[]).map((r:any)=>({path:r.artworkId,url:imageUrl(r.artworkId),mtime:new Date(o.updated_at).getTime(),label:"",meta:{kind:t.kind,prompt:t.prompt,status:i.state,source_path:t.source||"",annotated_path:t.annotated||"",annotated_url:t.annotated?imageUrl(t.annotated):"",created_at:new Date(o.created_at).toISOString(),geometry:t.geometry,charged_credits:i.result?.chargedCredits||0,dimensions:{width:r.width,height:r.height}}}))));versions.forEach((v:any,i:number)=>v.label=`V${i+1}`);
  const last=latest&&((latest.o.result.items||[]).find((i:any)=>i.key===latest.t.key)),state=last?legacyState(last.state):latest?"waiting":"idle",it=inf?.t;
  return {ref_path:a.artworkId,ref_name:a.relative,ref_url:imageUrl(a.artworkId),product:p.name,product_images:products.map(a=>a.relative),product_urls:products.map(a=>imageUrl(a.artworkId)),product_url:imageUrl(products[0].artworkId),product_image:products[0].relative,task_label:LABELS[classify(a.relative,cfg.sku_refs_dir_name)],kind:classify(a.relative,cfg.sku_refs_dir_name),size:`${a.width}×${a.height}`,dimensions:{width:a.width,height:a.height},status:it?.state==="running"||it?.state==="queued"?"inferring":state,error:last?.result?.error?.message||latest?.t.error||"",prompt:it?.state==="done"?it.text:a.prompt||cfg.prompt,versions,infer:{status:it?.state==="queued"||it?.state==="running"?"inferring":it?.state||"idle",prompt:it?.text||"",error:it?.error||""}};
 });return {items,products};
}
const legacyState=(s:string)=>({succeeded:"done",partial:"done",queued:"waiting",submitted:"running",pending:"running",needs_attention:"maybe_submitted",cancelled:"failed"}[s]||s);
async function imagePlan(owner:string,t:TaskPlan,id:string,versions?:{modelVersion:number;billingVersion:number}){
 if(!t.geometry){const mode=t.settings.ratio_mode;if(t.inputs.length&&["reference","product"].includes(mode)){const a=mode==="reference"?t.inputs.at(-1)!:t.inputs[0];t.geometry={width:a.width,height:a.height};}else{const [width,height]=(t.settings.ratio==="auto"?"1:1":t.settings.ratio).split(":").map(Number);t.geometry={width,height};}}
 const ratioValue=t.geometry?ratio(t.geometry.width,t.geometry.height):t.settings.ratio==="auto"&&t.inputs.length?ratio(t.inputs[0].width,t.inputs[0].height):t.settings.ratio==="auto"?"1:1":t.settings.ratio;
 const req:ImagegenRequest={version:1,augment:false,operationId:stableId(id,t.key),entry:"workbench",mode:t.source?"edit":"generate",prompt:t.prompt,modelId:t.settings.modelId,inputs:t.inputs.map((a,i)=>({artworkId:a.artworkId,role:t.source&&i===0?"edit-target":"reference"})),parameters:{quality:t.settings.quality as any,resolution:t.settings.resolution.toUpperCase() as any,ratio:ratioValue},output:{format:"png"},variants:1};
 return planImagegen(req,owner,versions);
}
async function textRequest(owner:string,t:TaskPlan,id:string,quoted=false){
 const headers=new Headers({"content-type":"application/json",cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,"x-naumi-billing-operation-id":stableId(id,t.key),"x-naumi-client-entry":"workbench"});
 if(t.settings.textModelId)headers.set("x-naumi-feature-model",String(t.settings.textModelId));
 if(quoted&&t.quote){headers.set("x-naumi-billing-version",String(t.quote.configVersion));headers.set("x-naumi-billing-credits",String(t.quote.tariff.pricing.mode==="api-cost-plus"?t.quote.authorizedCredits:t.quote.requestedCredits));if(t.quote.modelVersion)headers.set("x-naumi-accepted-model-context",await signAcceptedModelContext(owner,{modelVersion:t.quote.modelVersion,billingVersion:t.quote.configVersion}));}
 return new Request("http://internal/api/canvas/text-generate",{method:"POST",headers,body:JSON.stringify({prompt:t.prompt,images:t.inputs.map(a=>a.url),referenceTask:t.kind})});
}
const creditOf=(t:TaskPlan)=>t.plan?.totalCredits??(t.quote?.tariff.pricing.mode==="api-cost-plus"?t.quote.authorizedCredits:t.quote?.requestedCredits)??0;
export async function publicModels(){const snapshot=await(await getModelAdministration()).repo.current();return workbenchModelOptions(snapshot.config.publicModels.filter(m=>m.enabled&&m.visible&&m.modality==="image"&&modelAllowedForFeature(m,"image.generate")).map(m=>({id:m.id,label:m.label})));}
export async function preview(owner:string,path:string,raw:Record<string,any>){
 await ensureWorkbench();if(await isBanned(owner,""))throw new WorkbenchError("账号已被封禁",403);
 const body={...raw};delete body.native_quote;const rid=requestId(body.request_id||randomUUID()),fingerprint=digest({path,body:{...body,request_id:rid}});
 const previous=(await getPool().query<Operation>("SELECT * FROM app_reference_operations WHERE owner=$1 AND kind=$2 AND request_id=$3",[owner,path,rid])).rows[0];
 // An operation owns its original quote. expires_at is maintenance metadata, not consent to reprice.
 if(previous){if(previous.fingerprint!==fingerprint)throw new WorkbenchError("请求编号已经用于其他内容",409);return quoteData(owner,previous);}
 const id=randomUUID(),tasks:TaskPlan[]=[],cfg=settings(body.config||body.settings||body,path.startsWith("chat")?8:20);
 if(path.startsWith("workbench/")){
  const {items,products}=await projectItems(owner,body.workbench_root,cfg),selected=path==="workbench/edit"?[body]:body.items;
  if(!Array.isArray(selected)||!selected.length||selected.length>500)throw new WorkbenchError("请先选择参考图");
  for(const s of selected){const it=items.find(a=>a.ref_path===s.ref_path);if(!it)throw new WorkbenchError("参考图不属于当前产品文件夹");const a=await ownedAsset(owner,it.ref_path);let prompt=String(s.prompt||cfg.prompt).trim(),inputs=[...products,a],source="",annotated="";
   if(["waiting","running","editing","inferring","maybe_submitted"].includes(it.status))throw new WorkbenchError("这张参考图仍有进行中任务，请先查询原任务",409);
   if(path.endsWith("infer-prompts"))prompt=cfg.prompt_infer_instruction||DEFAULT_INSTRUCTION;
   if(path.endsWith("edit")){if(!it.versions.some((v:any)=>v.path===body.result_path))throw new WorkbenchError("编辑目标不属于这张参考图");source=body.result_path;annotated=(await inlineAssets(owner,[body.annotated_data_url]))[0]?.artworkId||"";inputs=[await ownedAsset(owner,source),...products,a,...(annotated?[await ownedAsset(owner,annotated)]:[])];prompt=String(body.instruction||body.prompt||"").trim();}
   if(!prompt||prompt.length>6000)throw new WorkbenchError("提示词需在6000字符内");
   tasks.push({key:a.artworkId,ref:a.artworkId,root:body.workbench_root,kind:path.endsWith("infer-prompts")?"infer":path.endsWith("edit")?"edit":"generate",prompt,settings:cfg,inputs,geometry:{width:a.width,height:a.height},source,annotated,state:"queued"});
  }
 }else if(path==="single/start"){
  const prompt=String(body.prompt||"").trim();if(!prompt||prompt.length>6000)throw new WorkbenchError("提示词需在6000字符内");const inputs=await inlineAssets(owner,body.images||[]);
  for(let i=1;i<=cfg.count;i++)tasks.push({key:String(i),ref:"",kind:"generate",prompt,settings:{...cfg,ratio_mode:"manual"},inputs,variantIndex:i});
 }else if(path==="chat-image/send"){
  let sid=String(body.session_id||"");if(sid)await document(owner,"chat",sid);else sid=randomUUID();body.session_id=sid;
  const chat=sid===raw.session_id?await document<any>(owner,"chat",sid):{title:"新对话",messages:[]};
  if(chat.messages.some((m:any)=>["thinking","plan_pending"].includes(m.status)))throw new WorkbenchError("请先确认或取消当前计划",409);
  let inputs=await inlineAssets(owner,body.images||[]);if(!inputs.length){const last=chat.messages.slice().reverse().find((m:any)=>m.results?.length||m.inputs?.length);if(last)inputs=last.results?.length?[await ownedAsset(owner,last.results.at(-1).output_path)]:await Promise.all(last.inputs.map((id:string)=>ownedAsset(owner,id)));}
  const prompt=String(body.message||"请根据参考图片生成").trim();if(prompt.length>6000)throw new WorkbenchError("消息需在6000字符内");
  tasks.push({key:"plan",ref:"",kind:"chat-plan",prompt,settings:cfg,inputs,sessionId:sid,messageId:randomUUID(),state:"queued"});body.context=(chat.messages||[]).slice(-12).map((m:any)=>({role:m.role,text:String(m.text||"").slice(0,2000)}));
 }else if(path==="chat-image/confirm"){
  const chat=await document<any>(owner,"chat",String(body.session_id)),m=chat.messages.find((m:any)=>m.id===body.message_id);if(!m||m.status!=="plan_pending")throw new WorkbenchError("计划不存在或已经确认",409);
  const frozen=settings(m.settings,8),inputs=await Promise.all((m.inputs||[]).map((id:string)=>ownedAsset(owner,id)));
  for(const [index,t] of m.plan.tasks.entries()){const selected=t.image_indices.length?t.image_indices.map((i:number)=>inputs[i]):inputs;
   for(let n=1;n<=frozen.count;n++)tasks.push({key:`${index+1}-${n}`,ref:"",kind:"generate",prompt:t.prompt,settings:{...frozen,ratio:frozen.ratio_mode==="smart"?t.ratio:frozen.ratio},inputs:selected,messageId:m.id,sessionId:body.session_id,taskName:t.name,promptIndex:index+1,variantIndex:n});}
 }else throw new WorkbenchError("未知操作",404);
 let versions:{modelVersion:number;billingVersion:number}|undefined;
 for(const t of tasks){if(t.kind==="infer"||t.kind==="chat-plan"){t.quote=await quoteForRequest(await textRequest(owner,t,id),{feature:"canvas.text-generate",quantity:1});if(t.kind==="chat-plan"&&t.settings.task_mode==="auto"){const image=await imagePlan(owner,{...t,kind:"generate",geometry:undefined},id);t.autoAuthorization={modelVersion:image.modelVersion,billingVersion:image.billingVersion};}}else{t.plan=await imagePlan(owner,t,id,versions);versions={modelVersion:t.plan.modelVersion,billingVersion:t.plan.billingVersion};}}
 await getPool().query(`INSERT INTO app_reference_operations(id,owner,kind,request_id,fingerprint,body,plans) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) ON CONFLICT(owner,kind,request_id) DO NOTHING`,[id,owner,path,rid,fingerprint,JSON.stringify({...body,request_id:rid}),JSON.stringify(tasks)]);
 const saved=(await getPool().query<Operation>("SELECT * FROM app_reference_operations WHERE owner=$1 AND kind=$2 AND request_id=$3",[owner,path,rid])).rows[0];if(saved.fingerprint!==fingerprint)throw new WorkbenchError("请求编号已经用于其他内容",409);return quoteData(owner,saved);
}
async function quoteData(owner:string,op:Operation){const row=(await getPool().query("SELECT GREATEST(0,(SELECT COALESCE(sum(remaining),0) FROM app_credit_batches WHERE email=$1 AND NOT expired AND expires_at>now())-credits_used)::int AS available FROM app_users WHERE email=$1",[owner])).rows[0];return {...publicQuote(op),availableCredits:row?.available||0};}
function publicQuote(op:Operation){const plans=op.plans as TaskPlan[],total=plans.reduce((n,t)=>n+creditOf(t),0);return {ok:true,id:op.id,request_id:op.request_id,state:op.state,totalCredits:total,items:plans.map(t=>({key:t.key,credits:creditOf(t),ratio:t.plan?.request.parameters.ratio,modelId:t.plan?.request.modelId||t.quote?.facts?.modelId})),warnings:Array.from(new Set(plans.flatMap(t=>t.plan?.warnings||[])))};}
export async function accept(owner:string,path:string,body:Record<string,any>){
 const q=body.native_quote;if(!q?.id)throw new WorkbenchError("缺少原始任务报价",409);
 const op=await operation(owner,String(q.id));const actual:Record<string,any>={...body,request_id:op.request_id};delete actual.native_quote;
 // Chat new-session/context are server-generated and not supplied by the browser.
 const original={...op.body};delete original.context;if(path==="chat-image/send"&&!actual.session_id)original.session_id=actual.session_id;
 if(op.kind!==path||digest({path,body:actual})!==digest({path,body:original}))throw new WorkbenchError("报价与提交内容不一致",409);
 await transaction(`reference-owner:${owner}`,async tx=>{
  const current=await operation(owner,op.id,tx);if(current.state!=="preview")return;
  if(q.confirmed===false)throw new WorkbenchError("已取消提交",400);
  if(await isBanned(owner,""))throw new WorkbenchError("账号已被封禁",403);
  if(!current.plans.length||(current.plans as TaskPlan[]).some(t=>t.kind==="infer"||t.kind==="chat-plan"?!t.quote:!t.plan))throw new WorkbenchError("任务缺少原始执行报价",409);
  if(path.startsWith("workbench/")){
   const competing=(await tx.query<Operation>("SELECT * FROM app_reference_operations WHERE owner=$1 AND state='accepted' AND id<>$2",[owner,op.id])).rows;
   if(competing.some(o=>o.plans.some(t=>(current.plans as TaskPlan[]).some(c=>c.ref===t.ref))))throw new WorkbenchError("这张参考图仍有进行中任务",409);
  }
  if(path.startsWith("chat-image/")){const t=current.plans[0] as TaskPlan,sid=t.sessionId!;let chat=await document<any>(owner,"chat",sid,tx).catch(()=>({title:"新对话",messages:[]}));
   if(path.endsWith("send")){if(chat.messages.some((m:any)=>["thinking","plan_pending"].includes(m.status)))throw new WorkbenchError("请先确认或取消当前计划",409);chat.messages.push({id:randomUUID(),role:"user",text:t.prompt,status:"done",inputs:t.inputs.map(a=>a.artworkId),created_at:Date.now()/1000},{id:t.messageId,role:"assistant",text:"正在理解需求…",status:"thinking",inputs:t.inputs.map(a=>a.artworkId),settings:t.settings,created_at:Date.now()/1000,operationId:op.id});if(chat.title==="新对话")chat.title=t.prompt.slice(0,60);}
   else{const m=chat.messages.find((m:any)=>m.id===t.messageId);if(!m||m.status!=="plan_pending")throw new WorkbenchError("计划已经处理",409);m.status="queued";m.operationId=op.id;}
   await putDocument(owner,"chat",sid,chat,tx);
  }
  await tx.query("UPDATE app_reference_operations SET state='accepted',updated_at=now() WHERE id=$1",[op.id]);
 });
 await synchronize(await operation(owner,op.id));return path.startsWith("chat-image")?chatState(owner,(await operation(owner,op.id)).plans[0].sessionId):path==="single/start"?singleState(owner,op.id):{ok:true,accepted:op.plans.length,id:op.id,message:`已提交 ${op.plans.length} 条原生任务`};
}
async function submitImages(op:Operation,tasks:TaskPlan[],batchId:string){
 const first=tasks[0].plan!,batchRequest:ImagegenRequest={...first.request,operationId:batchId,mode:"batch",batch:{items:tasks.map(t=>({key:t.key,name:t.taskName||t.ref||t.key,prompt:t.prompt})),concurrency:2,maxAttempts:1,failFast:false}};
 const plan:ImagegenPlan={...first,request:batchRequest,fingerprint:imagegenFingerprint(batchRequest),children:tasks.map(t=>({key:t.key,plan:t.plan!})),totalCredits:tasks.reduce((n,t)=>n+t.plan!.totalCredits,0)};
 await submitAcceptedImagegenBatch(plan,op.owner);
}
const active=new Set<string>();
async function synchronizeLocal(op:Operation){
 if(await isImportedHistory(getPool(),'app_reference_operations',op.id))return;
 if(op.state==="preview"||op.state==="done"||active.has(op.id))return;active.add(op.id);
 try{
  const tasks=op.plans as TaskPlan[];
  if(tasks[0]?.plan){
   const chunks=[];for(let n=0;n<tasks.length;n+=100){const id=n===0?op.id:stableId(op.id,`chunk:${n}`);await submitImages(op,tasks.slice(n,n+100),id);await runImagegenBatchTick(id);const chunk=await readImagegenBatch(id,op.owner);if(chunk)chunks.push(chunk);}
   const result={id:op.id,items:chunks.flatMap(c=>c.items),chargedCredits:chunks.reduce((n,c)=>n+c.chargedCredits,0)};if(!result.items.length)return;
   // Original bytes remain in native works/media, including mismatched outputs.
   for(const item of result.items){const t=tasks.find(t=>t.key===item.key)!;if(item.state==="succeeded"&&t.geometry&&item.result.artifacts.some(a=>!geometryMatches(a,t.geometry!))){item.state="failed";item.result={...item.result,status:"failed",error:{code:"REFERENCE_RATIO_MISMATCH",message:"结果与参考图比例不一致；原图已保留到作品库，未拉伸、裁切或自动重新收费"}};}}
   await getPool().query("UPDATE app_reference_operations SET result=$2::jsonb,state=$3,updated_at=now() WHERE id=$1",[op.id,JSON.stringify(result),result.items.every(i=>!["queued","submitted"].includes(i.state))?"done":"accepted"]);
   if(tasks[0].sessionId)await updateChatResults(op.owner,tasks[0].sessionId!,tasks[0].messageId!,result);
  }else{
   // Only accepted records from this module, never copied historical supplier jobs.
   for(let i=0;i<tasks.length;i++){const t=tasks[i];if(["done","failed","maybe_submitted"].includes(t.state||""))continue;
    if(!releaseRuntimeEnabled()) {
      const claimed=await transaction(`reference-text:${op.id}:${i}`,async tx=>{const row=await operation(op.owner,op.id,tx),item=row.plans[i] as TaskPlan;if(item.state!=="queued"&&!(item.state==="running"&&(item.startedAt||0)<Date.now()-180000))return false;row.plans[i]={...item,state:"running",startedAt:Date.now()};await tx.query("UPDATE app_reference_operations SET plans=$2::jsonb,updated_at=now() WHERE id=$1",[op.id,JSON.stringify(row.plans)]);return true;});
      if(claimed){void executeText(op,i).catch(()=>{});break;}continue;
    }
    const admitted=await detachBackgroundActivity("reference-text", `${op.id}:${i}`, "claim", async () => {
      const claimed=await transaction(`reference-text:${op.id}:${i}`,async tx=>{const row=await operation(op.owner,op.id,tx),item=row.plans[i] as TaskPlan;if(item.state!=="queued"&&!(item.state==="running"&&(item.startedAt||0)<Date.now()-180000))return false;row.plans[i]={...item,state:"running",startedAt:Date.now()};await tx.query("UPDATE app_reference_operations SET plans=$2::jsonb,updated_at=now() WHERE id=$1",[op.id,JSON.stringify(row.plans)]);return true;});
      if(claimed){await bindBackgroundClaim(`${op.id}:${i}`);await executeText(op,i);}
    });
    if(admitted)break;
   }
  }
 }finally{active.delete(op.id);}
}
async function executeText(op:Operation,index:number){
 const t=op.plans[index] as TaskPlan;let result:any,stage:TextFailureStage="prepare";
 try{
  const req=await textRequest(op.owner,t,op.id,true);
  stage="upstream";
  const response=await withBillingRequest(req,"canvas.text-generate",()=>withBiRequest(req,async()=>{
   const settings=await getOpenAISettings(),model=requestedTextModel(req,process.env.OPENAI_TEXT_MODEL||process.env.AGENT_MODEL||"gpt-5.6-luna"),client=observeOpenAI(modelAwareOpenAI({apiKey:process.env.AGENT_API_KEY||settings.apiKey||"managed",baseURL:process.env.AGENT_BASE_URL,maxRetries:0}));
   const images=await Promise.all(t.inputs.map(async a=>{const input=await imageBytes(op.owner,a.artworkId);return toVisionDataUrl(input.buffer,input.mimeType);}));
   const instruction=t.kind==="chat-plan"?chatPlanInstruction(op.body.context,t.inputs.length):"你是电商参考图提示词助手。按用户要求结合产品图与参考图输出完整中文生图提示词，只输出提示词。保留产品特征、构图、布局、光影、色彩、清晰度，不杜撰商标。";
   await configuredToolCost();const completion=await client.chat.completions.create({model,messages:[{role:"system",content:instruction},{role:"user",content:[{type:"text",text:t.prompt},...images.map(url=>({type:"image_url" as const,image_url:{url,detail:"high" as const}}))]}],max_tokens:2000,modalities:["text"]});
   const text=completion.choices[0]?.message.content?.trim();if(!text)throw new WorkbenchError("模型未返回有效文字",502);return Response.json({text,model});
  }));
  stage="settled";
  result=await response.json();t.state=response.ok?"done":result.code==="OPERATION_PENDING"?"maybe_submitted":"failed";t.text=result.text||"";t.error=response.ok?"":result.error||"推理失败";
  if(t.kind==="chat-plan"&&t.state==="done")t.text=JSON.stringify(parseChatPlan(t.text!,t.inputs,t.settings));
 }catch(e){Object.assign(t,textFailureState(stage,e));}
 await transaction(`reference-text-result:${op.id}`,async tx=>{const current=await operation(op.owner,op.id,tx);current.plans[index]={...current.plans[index],...t};await tx.query("UPDATE app_reference_operations SET plans=$2::jsonb,state=$3,updated_at=now() WHERE id=$1",[op.id,JSON.stringify(current.plans),current.plans.every(p=>["done","failed","maybe_submitted"].includes(p.state))?"done":"accepted"]);});
 if(t.kind==="chat-plan")await transaction(`reference-chat:${t.sessionId}`,async tx=>{const chat=await document<any>(op.owner,"chat",t.sessionId!,tx),m=chat.messages.find((m:any)=>m.id===t.messageId);if(!m||m.status==="cancelled")return;const plan=t.state==="done"?JSON.parse(t.text!):null;Object.assign(m,{text:plan?.reply||t.error,plan,status:plan?.action==="generate"?"plan_pending":t.state==="done"?"done":"failed",chargedCredits:result?.chargedCredits,updated_at:Date.now()/1000});await putDocument(op.owner,"chat",t.sessionId!,chat,tx);});
 if(t.kind==="chat-plan"&&t.state==="done"&&t.autoAuthorization&&JSON.parse(t.text!).action==="generate")await executeAutoPlan(op,t).catch(async e=>{await transaction(`reference-chat:${t.sessionId}`,async tx=>{const chat=await document<any>(op.owner,"chat",t.sessionId!,tx),m=chat.messages.find((m:any)=>m.id===t.messageId);if(m?.status==="plan_pending"){m.text+="\n自动执行尚未提交："+(e instanceof WorkbenchError?e.message:"执行准备失败，请查询当前计划");await putDocument(op.owner,"chat",t.sessionId!,chat,tx);}});});
}
async function executeAutoPlan(op:Operation,t:TaskPlan){
 const generated=JSON.parse(t.text!),id=stableId(op.id,"auto-images"),plans:TaskPlan[]=[];
 for(const [i,task] of generated.tasks.entries()){const inputs=task.image_indices.length?task.image_indices.map((n:number)=>t.inputs[n]):t.inputs;
  for(let n=1;n<=t.settings.count;n++){const child:TaskPlan={key:`${i+1}-${n}`,ref:"",kind:"generate",prompt:task.prompt,inputs,settings:{...t.settings,ratio:t.settings.ratio_mode==="smart"?task.ratio:t.settings.ratio},messageId:t.messageId,sessionId:t.sessionId,taskName:task.name,promptIndex:i+1,variantIndex:n};child.plan=await imagePlan(op.owner,child,id,t.autoAuthorization);plans.push(child);}}
 // Actual frozen child quotes go through native wallet reservation; no synthetic credit cap.
 await transaction(`reference-chat:${t.sessionId}`,async tx=>{const chat=await document<any>(op.owner,"chat",t.sessionId!,tx),m=chat.messages.find((m:any)=>m.id===t.messageId);if(!m||m.status!=="plan_pending")return;
  await tx.query("INSERT INTO app_reference_operations(id,owner,kind,request_id,fingerprint,body,plans,state) VALUES($1,$2,'chat-image/auto',$3,$4,$5::jsonb,$6::jsonb,'accepted') ON CONFLICT(id) DO NOTHING",[id,op.owner,id,digest(plans),JSON.stringify({session_id:t.sessionId,message_id:t.messageId}),JSON.stringify(plans)]);m.status="queued";m.operationId=id;await putDocument(op.owner,"chat",t.sessionId!,chat,tx);
 });await synchronize(await operation(op.owner,id));
}
async function updateChatResults(owner:string,sid:string,mid:string,result:any){await transaction(`reference-chat:${sid}`,async tx=>{const chat=await document<any>(owner,"chat",sid,tx),m=chat.messages.find((m:any)=>m.id===mid);if(!m||m.status==="cancelled")return;const op=await operation(owner,m.operationId,tx);m.results=result.items.flatMap((i:any)=>(i.result?.artifacts||[]).map((a:any)=>({output_path:a.artworkId,output_url:imageUrl(a.artworkId),prompt_index:op.plans.find(t=>t.key===i.key)?.promptIndex,variant_index:op.plans.find(t=>t.key===i.key)?.variantIndex,task_name:op.plans.find(t=>t.key===i.key)?.taskName,updated_at:Date.now()/1000})));m.failures=result.items.filter((i:any)=>["failed","needs_attention"].includes(i.state)).map((i:any)=>({error:i.result?.error?.message,index:i.key}));m.status=result.items.some((i:any)=>["queued","submitted"].includes(i.state))?"generating":m.failures.length?m.results.length?"partial":"failed":"done";await putDocument(owner,"chat",sid,chat,tx);});}
export async function singleState(owner:string,id:string){const op=await operation(owner,id);if(op.kind!=="single/start")throw new WorkbenchError("任务不存在",404);await synchronize(op);const current=await operation(owner,id),r=current.result,items=r.items||[];
 return {ok:true,task_id:op.id,id:op.id,status:current.state!=="done"?"running":items.every((i:any)=>i.state==="succeeded")?"done":items.some((i:any)=>i.state==="succeeded")?"partial":"failed",prompt:op.body.prompt,count:op.plans.length,size:op.plans[0]?.plan?.request.parameters.ratio||"",used_images:op.plans[0]?.inputs.length||0,created_at:new Date(op.created_at).getTime()/1000,results:items.flatMap((i:any)=>(i.result?.artifacts||[]).map((a:any)=>({output_path:a.artworkId,output_url:imageUrl(a.artworkId),index:Number(i.key)}))),failures:items.filter((i:any)=>["failed","needs_attention"].includes(i.state)).map((i:any)=>({index:Number(i.key),error:i.result?.error?.message||"任务待核查"})),chargedCredits:r.chargedCredits||0};
}
export async function chatState(owner:string,sid:string){
 const sessions=await documents<any>(owner,"chat");if(!sid)sid=sessions[0]?.id||"";if(!sid)return {ok:true,session_id:"",sessions:[],messages:[]};let chat=await document<any>(owner,"chat",sid);
 for(const m of chat.messages)if(m.operationId){const op=await operation(owner,m.operationId);await synchronize(op);}chat=await document<any>(owner,"chat",sid);
 return {ok:true,session_id:sid,sessions:sessions.map(s=>({id:s.id,title:s.payload.title,active:s.id===sid,running:s.payload.messages.filter((m:any)=>["thinking","queued","generating","plan_pending"].includes(m.status)).length,updated_at:new Date(s.updated_at).getTime()/1000})),messages:chat.messages.map((m:any)=>({...m,images:m.role==="user"?(m.inputs||[]).map(imageUrl):[]})),running:chat.messages.some((m:any)=>["thinking","generating","queued"].includes(m.status))};
}
async function recoverReferenceWorkbenchLocal(){await ensureWorkbench();const ops=(await getPool().query<Operation>(`SELECT * FROM app_reference_operations WHERE state='accepted' ${excludeImportedHistory('app_reference_operations')} ORDER BY created_at LIMIT 10`)).rows;for(const op of ops)await synchronize(op);}

export async function synchronize(op:Operation) {
  if(op.state!=="accepted"||await deferApplicationTask())return;
  return withBackgroundActivity("reference-sync", op.id, "continuation", () => synchronizeLocal(op), () => undefined);
}
export async function recoverReferenceWorkbench() {
  if(await deferApplicationTask())return;
  return withBackgroundActivity("reference-sync", "reference-recovery-scan", "claim", () => recoverReferenceWorkbenchLocal(), () => undefined);
}
