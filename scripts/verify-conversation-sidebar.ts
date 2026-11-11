import assert from "node:assert/strict";
import {workbenchSessionPreview,sortWorkbenchSessions,liveWorkbenchSessions} from "../src/lib/agent/workbench-session-preview";
import {createWorkbenchSessionCatalog,type WorkbenchCatalogContext} from "../src/lib/agent/workbench-session-catalog";
import type {WorkbenchSessionSummary} from "../src/lib/agent/workbench-contract";
import {conversationMarkdown} from "../src/lib/agent/conversation-markdown";

let checks=0;
function eq(actual:unknown,expected:unknown,label:string){assert.deepEqual(actual,expected,label);checks++;console.log("PASS "+label);}
const row=(id:string,pinnedAt:string|null=null,updatedAt="2026-11-11T01:00:00Z"):WorkbenchSessionSummary=>({id,title:id,createdAt:updatedAt,updatedAt,messageCount:1,pinnedAt});
async function main(){
  eq(conversationMarkdown(String.raw`行内 \(a^2+b^2\)`),"行内 $a^2+b^2$","LaTeX parenthesis delimiters normalize for display");
  eq(conversationMarkdown(String.raw`\[\frac{1}{2}\]`),"\n$$\n\\frac{1}{2}\n$$\n","LaTeX block delimiters normalize for display");
  const code="```latex\n\\[do not change\\]\n```\n`\\(code\\)`";
  eq(conversationMarkdown(code),code,"code contents and copy source remain verbatim");
  eq(workbenchSessionPreview([]),{status:"empty"},"empty conversation has no fabricated cover");
  eq(workbenchSessionPreview([{role:"user",content:"[商品图] /media/ref.png"}]),{image:"/media/ref.png",status:"reference"},"reference is labelled separately");
  eq(workbenchSessionPreview([{role:"assistant",content:"![old](/media/old.png)\n![new](/media/new.webp)"}]),{image:"/media/new.webp",status:"ready"},"last generated image is cover");
  eq(workbenchSessionPreview([{role:"assistant",content:"![blocked](https://evil.example/image.png)\n![video](/media/clip.mp4)"}]),{status:"empty"},"no external or video URL as image thumbnail");
  eq(workbenchSessionPreview([{role:"assistant",content:"![old](/media/old.png)"}],[{type:"tool_start",tool:"generate_image"}]),{image:"/media/old.png",status:"generating"},"new task shows progress over previous real result");
  eq(workbenchSessionPreview([],[{type:"tool_end",tool:"generate_image",outputs:["/media/first.png","/media/last.png"]}]),{image:"/media/last.png",status:"ready"},"tool result precedes final assistant text");
  eq(workbenchSessionPreview([],[{type:"tool_start",tool:"generate_image"},{type:"tool_end",tool:"generate_image",isError:true}]),{status:"failed"},"failure is not ready");
  eq(workbenchSessionPreview([],[{type:"tool_start",tool:"generate_image"},{type:"agent_end"}]),{status:"stopped"},"unfinished image tool terminal is stopped");
  eq(workbenchSessionPreview([{role:"assistant",content:"",pending:true,steps:[{tool:"generate_image",summary:"",status:"running"}]}]),{status:"generating"},"live message steps project generation");
  eq(sortWorkbenchSessions([row("new",null,"2026-11-12"),row("pinned","2026-11-01"),row("pinned-new","2026-11-10")]).map(x=>x.id),["pinned-new","pinned","new"],"pinned stays before recent across reload");
  const sessions=[row("a"),row("b")];eq(liveWorkbenchSessions(sessions,"b",[{role:"assistant",content:"![new](/media/live.png)"}]).find(x=>x.id==="b")?.preview,{image:"/media/live.png",status:"ready"},"active cover updates with stream");
  eq(sessions[1].preview,undefined,"live projection does not mutate authoritative rows");
  const interrupted=[{role:"assistant" as const,content:"",steps:[{tool:"generate_image",summary:"",status:"running" as const}]}];
  eq(liveWorkbenchSessions(sessions,"b",interrupted,{running:false,busy:false,unavailable:false})[1].preview?.status,"stopped","known idle owner ends interrupted tool badge");
  eq(liveWorkbenchSessions(sessions,"b",interrupted,{running:false,busy:false,unavailable:true})[1].preview?.status,"generating","lost observation never invents completion");
  eq(liveWorkbenchSessions(sessions,"b",interrupted,{running:true,busy:false,unavailable:false})[1].preview?.status,"generating","active owner keeps generating status");
  let scope:{account:string;active:boolean}={account:"a@example.test",active:true};
  const catalog=createWorkbenchSessionCatalog({current:()=>scope,owns:(s):s is typeof scope=>s===scope&&!!s?.active});
  let rows=[row("a"),row("b")],title="a",deleted=0,error:string|null=null,loading=false;
  let request:typeof fetch=async()=>Response.json({ok:true,pinnedAt:"2026-11-11T02:00:00Z"});
  const context:WorkbenchCatalogContext={ready:true,headers:async()=>({}),request:(...args)=>request(...args),setSessions:change=>{rows=typeof change==="function"?change(rows):change;},setLoading:change=>{loading=typeof change==="function"?change(loading):change;},setError:value=>{error=value;},sessionId:()=>"a",setTitle:value=>{title=value;},deletedCurrent:()=>{deleted++;}};
  eq(await catalog.pin("b",true,context),true,"pin acknowledged");eq(rows.map(x=>x.id),["b","a"],"pin updates ordered list");
  eq(await catalog.rename("a","  新  标题  ",context),true,"rename acknowledged");eq(title,"新 标题","active title updated");
  request=async()=>Response.json({error:"会话正在执行"},{status:409});eq(await catalog.pin("a",true,context),false,"pin failure does not pretend success");eq(rows.find(x=>x.id==="a")?.pinnedAt,null,"failed pin leaves prior metadata");
  request=async()=>Response.json({ok:true});await catalog.remove("a",context);eq(deleted,1,"delete current resets visible conversation");eq(rows.some(x=>x.id==="a"),false,"deleted row removed");
  let release!:(value:Response)=>void;
  request=()=>new Promise(resolve=>{release=resolve;});const late=catalog.pin("b",true,context);await new Promise(resolve=>setTimeout(resolve,0));scope.active=false;scope={account:"b@example.test",active:true};rows=[row("b-account")];release(Response.json({ok:true,pinnedAt:"2026-12-01"}));eq(await late,false,"account change fences pending pin");eq(rows.map(x=>x.id),["b-account"],"late account A cannot alter B list");
  request=async()=>Response.json({sessions:[row("stale")]});let parsed!:(value:unknown)=>void;
  request=async()=>({ok:true,json:()=>new Promise(resolve=>{parsed=resolve;}),body:null}) as Response;
  const refresh=catalog.refresh(context);await new Promise(resolve=>setTimeout(resolve,0));request=async()=>Response.json({ok:true,pinnedAt:"2026-11-12"});await catalog.pin("b-account",true,context);parsed({sessions:[row("stale")]});await refresh;eq(rows[0].id,"b-account","stale parsed list cannot revert successful pin");eq(loading,false,"mutation retires old loading state");
  console.log(`CONVERSATION_SIDEBAR_UNIT_PASS checks=${checks} supplierCalls=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
