import "server-only";
import {createHash} from "node:crypto";
import {NextResponse} from "next/server";
import {authenticatedEmail} from "../request-auth";
import {getPool,listArtworks,listArtworksByIds,listAgentSessions,getAgentSession,renameAgentSession,deleteAgentSession} from "../db";
import {getSession,removeRuntimeSession,renameRuntimeSession} from "./runtime";
import {continuationTurn} from "./stream-recovery";
import {AgentHarness} from "./harness";

export const canvasProjectSessionPrefix=(projectKey:string)=>canvasSessionPrefix("project:"+projectKey);
export const canvasSessionPrefix=(anchorId:string)=>"cv-"+createHash("sha256").update(anchorId).digest("hex").slice(0,12)+"-";
/** Server-scoped history, independent from the sidebar's mounting lifetime. */
export async function canvasAgentHistory(request:Request){
 const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
 const url=new URL(request.url),requestedAnchor=url.searchParams.get("anchorId")||"",id=url.searchParams.get("id")||"",projectKey=url.searchParams.get("projectKey")||"";
 const owned = projectKey ? await listArtworks(email) : requestedAnchor ? await listArtworksByIds(email,[requestedAnchor]) : [];
 const byId=new Map(owned.map(art=>[art.id,art]));
 const projectOf=(art:typeof owned[number])=>{
  let root=art;const seen=new Set<string>();
  while(root.parentId&&byId.has(root.parentId)&&!seen.has(root.id)){seen.add(root.id);root=byId.get(root.parentId)!;}
  return root.batchId?.startsWith("suite-") ? `batch:${root.batchId}` : `tree:${art.groupId||root.id}`;
 };
 const anchors=projectKey?owned.filter(art=>projectOf(art)===projectKey):owned;
 if(!projectKey&&!requestedAnchor)return NextResponse.json({error:"缺少画布项目"},{status:400});
 if(!anchors.length&&!projectKey)return NextResponse.json({error:"图片不存在或无权访问"},{status:404});
 const prefixes=[...anchors.map(art=>canvasSessionPrefix(art.id)),...(projectKey?[canvasProjectSessionPrefix(projectKey)]:[])];
 if(id&&(!prefixes.some(prefix=>id.startsWith(prefix))||id.length>64))return NextResponse.json({error:"该会话不属于当前项目"},{status:404});
 let anchorId=id?anchors.find(art=>id.startsWith(canvasSessionPrefix(art.id)))?.id||"":requestedAnchor;
 if(request.method==="GET"){
  if(!id){await listAgentSessions(email,1);const rows=await getPool().query("SELECT id,title,updated_at FROM app_agent_sessions WHERE email=$1 AND id LIKE ANY($2::text[]) ORDER BY updated_at DESC LIMIT 50",[email.toLowerCase(),prefixes.map(prefix=>prefix+"%")]);return NextResponse.json({sessions:rows.rows.map(row=>({id:row.id,title:row.title,updatedAt:row.updated_at,anchorId:anchors.find(art=>row.id.startsWith(canvasSessionPrefix(art.id)))?.id}))});}
  await getSession(email,id)?.persistPending?.catch(()=>undefined);
  const rawSaved=await getAgentSession(email,id);if(!rawSaved)return NextResponse.json({error:"会话不存在"},{status:404});
  const saved=(getSession(email,id)?.harness || new AgentHarness(email,id)).sanitize(rawSaved);
  const steps=Array.isArray(saved.steps)?saved.steps:[];
  const latest=(steps as any[]).findLast(step=>step.type==="canvas_turn");
  if(latest&&"anchorId" in latest)anchorId=anchors.some(art=>art.id===latest.anchorId)?latest.anchorId:"";
  // Older sessions have no contextIds and retain the original anchor fallback.
  const latestIds=Array.isArray((latest as any)?.contextIds)?Array.from(new Set<string>((latest as any).contextIds.filter((value:unknown):value is string=>typeof value==='string'))).slice(0,5):undefined;
  const referenceIds=latestIds?(await listArtworksByIds(email,latestIds)).map(art=>art.id).sort((a,b)=>latestIds.indexOf(a)-latestIds.indexOf(b)):undefined;
  const messages: {role:string;content:string}[]=Array.isArray(saved.messages)?saved.messages.filter((message:any)=>["user","assistant"].includes(message?.role)&&typeof message?.content==="string"):[];
  const artifactIds:string[]=Array.from(new Set<string>(steps.flatMap((step:any)=>step.type==="artifacts"?(step.artifacts||[]).map((art:any)=>String(art.id)):[])));
  const owned=await listArtworksByIds(email,artifactIds),byId=new Map(owned.map(art=>[art.id,art]));
  const turns=messages.map((message,index)=>({id:`${id}-${index}`,role:message.role,content:message.content,artifacts:[] as {id:string;image:string;title:string}[]}));
  // Match per-turn output to the user message, without trusting model-written URLs.
  for(const step of steps as any[])if(step.type==="artifacts"){
   const context=(steps as any[]).find(item=>item.type==="canvas_turn"&&item.turnId===step.turnId);
   const start=Number.isInteger(context?.messageIndex)?context.messageIndex:turns.findIndex(turn=>turn.role==="user"&&turn.content===context?.message);
   const subsequent=turns.slice(Math.max(0,start+1)),nextUser=subsequent.findIndex(turn=>turn.role==="user");
   const target=subsequent.slice(0,nextUser<0?undefined:nextUser).reverse().find(turn=>turn.role==="assistant");
   if(target)for(const reference of step.artifacts||[]){const art=byId.get(reference.id);if(art&&!target.artifacts.some(item=>item.id===art.id))target.artifacts.push({id:art.id,image:art.image,title:art.title});}
  }
  const currentTurn=steps.findLastIndex((step:any)=>step.type==="canvas_turn"),error=(steps.slice(Math.max(0,currentTurn)) as any[]).findLast(step=>step.type==="error"),running=!!(getSession(email,id)?.running || getSession(email,id)?.canvasExecuting);
  const interrupted=!running&&currentTurn>=0&&!steps.slice(currentTurn).some((step:any)=>step.type==="agent_end");
  const pending=(steps as any[])[currentTurn];if(pending&&pending.messageIndex>=turns.length)turns.push({id:id+"-pending",role:"user",content:String(pending.message),artifacts:[]});
  const terminal=steps.slice(Math.max(0,currentTurn)).findLast((step:any)=>step.type==="canvas_terminal") as any;
  const status=running?"running":terminal?.status||(error||interrupted?"failed":"completed");
  const attentionEvent=steps.slice(Math.max(0,currentTurn)).findLast((step:any)=>step.type==="attention") as any;
  const attention=["waiting","restricted"].includes(attentionEvent?.kind)?attentionEvent.kind:undefined;
  const continueFromTurnId=running?undefined:continuationTurn(steps as any[],messages);
  return NextResponse.json({session:{id:saved.id,title:saved.title,anchorId,referenceIds,projectKey,turns,steps:saved.steps,running,status,attention,continueFromTurnId,error:error?.message||(interrupted&&!terminal?"任务因服务中断而停止，请核对已有结果，避免重复生图":undefined)}});
 }
 if(!id)return NextResponse.json({error:"缺少会话编号"},{status:400});
 if(getSession(email,id)?.running || getSession(email,id)?.canvasExecuting)return NextResponse.json({error:"任务仍在执行，请先停止"},{status:409});
 await getSession(email,id)?.persistPending?.catch(()=>undefined);
 if(request.method==="PATCH"){
  const body=await request.json().catch(()=>null),title=String(body?.title||"").trim().slice(0,120);if(!title)return NextResponse.json({error:"请输入会话名称"},{status:400});
  if(!await renameAgentSession(email,id,title))return NextResponse.json({error:"会话不存在"},{status:404});renameRuntimeSession(email,id,title);return NextResponse.json({ok:true});
 }
 if(request.method==="DELETE"){removeRuntimeSession(email,id);await deleteAgentSession(email,id);return NextResponse.json({ok:true});}
 return NextResponse.json({error:"不支持的操作"},{status:405});
}
