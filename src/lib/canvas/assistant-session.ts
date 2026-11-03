"use client";
import {browserRandomUUID} from "../browser-crypto";
import {createRetainedBillingSubmission,type RetainedBillingSubmission} from "../billing/client-submission";
import {classifyAgentFailure} from "../agent/recovery";
import {assistantReferences,assistantAttachmentCapacity,MAX_ASSISTANT_IMAGES,assistantContext} from "./assistant-references";
import {updateAssistantTimeline,restoreAssistantTimeline,type AssistantTimelineTurn} from "./assistant-timeline";
import {receiveAssistantActivity,type AssistantLiveActivity} from "./assistant-live-state";
import {reduceAgentProgress} from "./agent-progress";
import {restoredOrbOutcome,agentOrbState,type AgentOrbStep,type AgentOrbOutcome} from "./agent-orb";
import type {Artwork} from "../mock-data";
import type {ImageSkill} from "../image-skills/catalog";
import type {CanvasDocumentScope} from "./document-scope";
import type {OrbCue} from "./orb-contract";

export type CanvasAssistantState={anchorId:string|null;turns:AssistantTimelineTurn[];input:string;attachments:Artwork[];excluded:string[];
  uploading:boolean;uploadError:string|null;skill:ImageSkill|null;busy:boolean;responding:boolean;activity:AssistantLiveActivity;
  steps:AgentOrbStep[];outcome:AgentOrbOutcome;error:string|null;continueTurn:string|null;syncIds:string[]};
const initial=():CanvasAssistantState=>({anchorId:null,turns:[],input:"",attachments:[],excluded:[],uploading:false,uploadError:null,skill:null,
  busy:false,responding:false,activity:{phase:"connecting"},steps:[],outcome:"idle",error:null,continueTurn:null,syncIds:[]});
export const EMPTY_CANVAS_ASSISTANT=initial();
export type CanvasAssistantPrepared={text:string;textNodeId:string};
export type CanvasAssistantContext={
  english:boolean;members:Artwork[];imageModelId:string;ratio:string;resolution:string;quality:string;videoNodeId?:string;textNodeId?:string;
  submit:(body:string,signal:AbortSignal,submission:RetainedBillingSubmission,current:()=>boolean)=>Promise<Response>;
  read:(url:string,init?:RequestInit)=>Promise<Response>;merge:(ids:string[])=>Promise<Artwork[]>;history:(ids:string[],rows:Artwork[])=>void;
  upload:(files:File[],options:{assistant:boolean;isCurrent:()=>boolean})=>Promise<string[]>;
  cue:(event:OrbCue)=>void;selectAnchor:(id:string|null)=>void;
  video:(nodes:{id:string;projectKey:string}[],current:()=>boolean)=>Promise<void>;
  text:(nodes:{id:string;projectKey:string}[],signal:AbortSignal,current:()=>boolean)=>Promise<void>;
  revealVideo:(result:{key:string;nodeId:string},current:()=>boolean)=>Promise<void>;
  storyboard?:(result:{projectKey:string;nodeIds:string[]},current:()=>boolean)=>Promise<void>;
};
type Attempt={input:string;anchorId:string;referencesKey:string;history:AssistantTimelineTurn[];body:string;submission:RetainedBillingSubmission;preparedTextNodeId?:string};
async function jsonOk(response:Response,message:string){const body=await response.json();if(!response.ok)throw Error(body?.error||message);return body;}

/** Only decodes this response. No reconnection, repeat POST or tool execution. */
async function* events(response:Response,current:()=>boolean,signal:AbortSignal){
  const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer="";
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener("abort",abort,{once:true});
  const parse=(frame:string)=>{const lines=frame.split("\n"),kind=lines.find(line=>line.startsWith("event: "))?.slice(7).trim(),data=lines.filter(line=>line.startsWith("data: ")).map(line=>line.slice(6)).join("\n");return kind&&data?{type:kind,data:JSON.parse(data) as Record<string,unknown>}:undefined;};
  try{for(;;){const {done,value}=await reader.read();if(!current()){await reader.cancel();return;}
    buffer+=(done?decoder.decode():decoder.decode(value,{stream:true}));buffer=buffer.replace(/\r\n/g,"\n");
    let boundary;while((boundary=buffer.indexOf("\n\n"))>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const event=parse(frame);if(event)yield event;}
    if(done){const event=parse(buffer);if(event)yield event;return;}
  }}finally{signal.removeEventListener("abort",abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}

/** One editor session owns execution and public transcript. Canvas only supplies
 * scoped domain ports; no scene/component state or billing is duplicated here. */
export function createCanvasAssistant(){
  let mounted=true,state=initial(),scope:CanvasDocumentScope|undefined,epoch=0,sessionId=browserRandomUUID(),liveSessionId="",controller:AbortController|null=null,
    attempt:Attempt|undefined,uploadToken:object|null=null,syncContext:CanvasAssistantContext|undefined,syncHistory=false,syncCompletion:{outcome:AgentOrbOutcome;error:string|null}|undefined;
  const listeners=new Set<()=>void>(),getSnapshot=()=>state,subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
  const set=(patch:Partial<CanvasAssistantState>)=>{state={...state,...patch};for(const listener of listeners)listener();};
  function invalidate(){epoch++;controller?.abort();controller=null;uploadToken=null;}
  function reset(turns:AssistantTimelineTurn[]=[],preserveSkill=true,notify=true){invalidate();attempt=undefined;liveSessionId="";sessionId=browserRandomUUID();syncContext=undefined;syncHistory=false;syncCompletion=undefined;const skill=preserveSkill?state.skill:null;state={...initial(),skill,turns};if(notify)for(const listener of listeners)listener();}
  function bind(next:CanvasDocumentScope){if(scope!==next){const sameAccount=scope?.account===next.account;scope=next;reset([],sameAccount,false);}const bound=next;
    const visible=()=>mounted&&scope===bound&&bound.viewCurrent(),version=()=>epoch;
    const refs=(context:CanvasAssistantContext)=>assistantReferences(state.anchorId?assistantContext(context.members,state.anchorId):[],state.attachments,state.excluded);
    const clearAttempt=()=>{attempt=undefined;};
    function anchor(id:string|null){if(!visible()||state.busy||state.anchorId===id)return;set({anchorId:id});clearAttempt();}
    function input(text:string){if(visible())set({input:text});}
    function skill(value:ImageSkill|null){if(visible()){set({skill:value});clearAttempt();}}
    function removeReference(id:string){if(!visible()||state.busy||uploadToken)return;set({attachments:state.attachments.filter(art=>art.id!==id),excluded:[...state.excluded,id],uploadError:null});clearAttempt();}
    function clearReferences(){if(!visible()||uploadToken)return;set({attachments:[],excluded:[],anchorId:null});clearAttempt();}
    function newChat(context:CanvasAssistantContext,turns:AssistantTimelineTurn[]=[]){if(!visible()||state.busy||uploadToken)return;const anchorId=state.anchorId;reset(turns);set({anchorId});context.cue({type:"reset"});}
    function detach(){if(!visible())return;invalidate();set({busy:false,responding:false,uploading:false,outcome:"stopped",continueTurn:null});}
    async function stop(context:CanvasAssistantContext){if(!visible())return;context.cue({type:"stop"});set({busy:false,responding:false,outcome:"stopped",continueTurn:null,error:"任务已停止，可从历史继续。已生成的结果会保留。"});controller?.abort();const id=liveSessionId||sessionId;
      if(id.startsWith("cv-"))await context.read("/api/canvas/assistant/control",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"stop",sessionId:id,projectKey:bound.project||"workspace"})}).catch(()=>null);
    }
    async function synchronize(context=syncContext){if(!context||!visible()||!state.syncIds.length)return;const ids=[...state.syncIds],token=epoch;
      try{const rows=await context.merge(ids);if(!visible()||token!==epoch)return;
        if(ids.some(id=>!rows.some(row=>row.id===id&&row.image)))throw Error("已有结果尚未全部载入，请重试同步原结果");
        if(!syncHistory){context.history(ids,rows);syncHistory=true;}set({syncIds:[],...(syncCompletion||{})});if(syncCompletion)context.cue({type:"restore",running:false,outcome:syncCompletion.outcome,recall:false});
      }catch{if(visible()&&token===epoch)set({outcome:"error",error:"已有结果已保存，画布尚未同步；请重试读取原结果，不会重新执行工具"});}
    }
    async function upload(files:File[],context:CanvasAssistantContext){if(!visible()||uploadToken||!files.length)return;
      const capacity=assistantAttachmentCapacity(refs(context).map(art=>art.id));if(!capacity){set({uploadError:context.english?`Up to ${MAX_ASSISTANT_IMAGES} images. Remove one to add another.`:`最多添加 ${MAX_ASSISTANT_IMAGES} 张图片，请先移除一张再添加。`});return;}
      const token={},accepted=sessionId,requestEpoch=epoch;uploadToken=token;const current=()=>visible()&&requestEpoch===epoch&&uploadToken===token&&accepted===sessionId;
      set({uploading:true,uploadError:null});clearAttempt();
      try{const ids=await context.upload(files.slice(0,capacity),{assistant:true,isCurrent:current});if(!current())return;const fresh=await context.merge(ids);if(!current())return;
        const added=ids.map(id=>fresh.find(art=>art.id===id)).filter((art):art is Artwork=>!!art);const errors=[];
        if(ids.length<Math.min(files.length,capacity))errors.push(context.english?'Some images failed to upload. Your existing images are kept.':'部分图片添加失败，已有图片已保留，请查看上传结果后重试。');
        if(added.length<ids.length)errors.push(context.english?'Images saved; refresh the canvas to select them.':'图片已保存，列表读取未完成，请刷新画布后选择。');
        if(files.length>capacity)errors.push(context.english?`Up to ${MAX_ASSISTANT_IMAGES} images; extra files were not uploaded.`:`最多添加 ${MAX_ASSISTANT_IMAGES} 张图片，超出的文件未上传。`);
        set({attachments:assistantReferences([], [...state.attachments,...added]),uploadError:errors.join(' ')||null});
      }catch(error){if(current())set({uploadError:error instanceof Error?error.message:'图片添加失败，已有图片已保留'});}
      finally{if(uploadToken===token){uploadToken=null;set({uploading:false});}}
    }
    async function send(context:CanvasAssistantContext,continueText=false,prepared?:CanvasAssistantPrepared){
      if(!visible()||state.busy||uploadToken)return;if(state.syncIds.length){await synchronize(context);return;}
      const continuation=continueText?state.continueTurn:null;if(continueText&&!continuation)return;const inputText=prepared?.text??(continueText?"继续输出":state.input.trim());if(!inputText)return;
      const references=prepared?[]:refs(context),anchorId=references[0]?.id||"",referencesKey=JSON.stringify(references.map(art=>art.id));
      const reuse=!continueText&&attempt?.input===inputText&&attempt.anchorId===anchorId&&attempt.referencesKey===referencesKey&&attempt.preparedTextNodeId===prepared?.textNodeId;
      const history=reuse?attempt!.history:[...state.turns,{id:`as-u-${Date.now()}`,role:"user" as const,content:inputText}];
      const saved=reuse?attempt!:{input:inputText,anchorId,referencesKey,history,preparedTextNodeId:prepared?.textNodeId,submission:createRetainedBillingSubmission(),body:JSON.stringify({mode:"agent",continueText,continueFromTurnId:continuation,skill:!prepared&&state.skill?{id:state.skill.id,revision:state.skill.revision}:null,sessionId,turnId:browserRandomUUID(),anchorId,videoNodeId:prepared?undefined:context.videoNodeId,textNodeId:prepared?.textNodeId??context.textNodeId,projectKey:bound.project||"workspace",contextIds:references.map(art=>art.id),messages:continueText?[]:history.slice(-12).map(({role,content})=>({role,content:content.slice(0,4000)})),imageModelId:context.imageModelId,ratio:context.ratio,resolution:context.resolution,quality:context.quality})};
      attempt=saved;const requestEpoch=++epoch,acceptedSession=sessionId,active=new AbortController();controller=active;liveSessionId=acceptedSession;
      const current=()=>visible()&&requestEpoch===epoch&&acceptedSession===sessionId&&!active.signal.aborted;
      let serverSession=acceptedSession,receivedText="",recoveryTurn:string|null=null,orbFailureCode:string|undefined,videoProject:{key:string;nodeId:string}|undefined;const artifactIds=new Set<string>(),plannedNodeIds=new Set<string>();
      set({error:null,busy:true,responding:false,activity:{phase:"connecting"},steps:[],outcome:"running",continueTurn:null,...(!prepared?{input:""}:{}),turns:[...history,{id:`as-a-${Date.now()}`,role:"assistant",content:""}]});context.cue({type:"submit"});
      try{
        const response=await context.submit(saved.body,active.signal,saved.submission,current);if(!current()){await response.body?.cancel().catch(()=>{});return;}
        if(!response.ok||!response.body){let data;try{data=await response.json();}catch{}orbFailureCode=response.status===401||response.status===403?"AUTH":response.status===402?"CREDITS":response.status===400?"VALIDATION":undefined;throw Error(data?.error||"画布助手暂时不可用");}
        context.cue({type:"connected"});set({activity:{phase:"processing",lastEventAt:Date.now()}});
        let text="",streamError:string|null=null,completed=false,lastOrbDelta=0;
        const setLast=(patch:Partial<AssistantTimelineTurn>)=>{const turns=[...state.turns],last=turns.at(-1);if(last)turns[turns.length-1]={...last,...patch};set({turns});};
        for await(const{type,data}of events(response,current,active.signal)){
          if(!current())return;set({activity:receiveAssistantActivity(state.activity,type,data,Date.now())});
          if(["delta","assistant","tool_start","tool_end","attention","artifacts","final"].includes(type))set({turns:updateAssistantTimeline(state.turns,{...data,type},context.english)});
          if(type==="open"){serverSession=String(data.sessionId||acceptedSession);liveSessionId=serverSession;}
          if(type==="done"&&data.ok===true)completed=true;
          if(type==="attention"){set({steps:reduceAgentProgress(state.steps,{...data,type},context.english)});if(data.kind==="waiting"||data.kind==="restricted")context.cue({type:"attention",kind:data.kind});else if(data.kind==="resolved")context.cue({type:"attention-resolved",tool:String(data.tool||"")});}
          if(type==="delta"){if(Date.now()-lastOrbDelta>650){lastOrbDelta=Date.now();context.cue({type:"delta"});}text+=String(data.text||"");receivedText=text;set({responding:true});setLast({content:text});}
          else if(type==="error"){if(data.canContinue===true&&typeof data.continueFromTurnId==="string")recoveryTurn=data.continueFromTurnId;if(typeof data.code==="string")orbFailureCode=data.code;streamError=String(data.error||data.message||"画布助手暂时不可用");}
          else if(type==="tool_start"||type==="tool_end"){context.cue(type==="tool_start"?{type:"tool-start",tool:String(data.tool||"")}:{type:"tool-end",error:!!data.isError});set({responding:false,steps:reduceAgentProgress(state.steps,{...data,type},context.english)});}
          else if(type==="video_nodes"&&Array.isArray(data.nodes)){const nodes=data.nodes as {id:string;projectKey:string}[];if(prepared)for(const node of nodes)if(node.projectKey===bound.project)plannedNodeIds.add(node.id);if(bound.project)await context.video(nodes,current);else if(nodes[0])videoProject={key:nodes[0].projectKey,nodeId:nodes[0].id};}
          else if(type==="text_nodes"&&Array.isArray(data.nodes))await context.text(data.nodes as {id:string;projectKey:string}[],active.signal,current);
          else if(type==="artifacts"&&Array.isArray(data.artifacts)){const arts=data.artifacts as {id:string;image:string;title:string}[];arts.forEach(art=>artifactIds.add(art.id));set({steps:reduceAgentProgress(state.steps,{...data,type},context.english)});context.cue({type:"artifacts",count:artifactIds.size});setLast({artifacts:[...new Map([...(state.turns.at(-1)?.artifacts||[]),...arts].map(art=>[art.id,art])).values()]});}
          else if(type==="final"){text=String(data.reply||text);setLast({content:text});}
        }
        if(!current())return;if(streamError)throw Error(streamError);if(!completed)throw Error("任务连接已中断，请从历史核对执行结果，避免重复生图");if(!text.trim())throw Error("助手没有返回内容，请重试");setLast({content:text.trim()});if(attempt===saved)attempt=undefined;set({outcome:"done"});context.cue({type:"done"});
        if(prepared&&bound.project&&plannedNodeIds.size)await context.storyboard?.({projectKey:bound.project,nodeIds:[...plannedNodeIds]},current);
        if(videoProject&&current())await context.revealVideo(videoProject,current);
      }catch(error){if(!visible()||requestEpoch!==epoch||acceptedSession!==sessionId)return;
        const aborted=active.signal.aborted||classifyAgentFailure(error).code==="ABORTED";
        set({...(!prepared&&attempt===saved&&!recoveryTurn&&!receivedText?{input:continueText?"":inputText}:{}),continueTurn:aborted?null:recoveryTurn,outcome:aborted?"stopped":"error",error:active.signal.aborted?"任务已停止，可从历史继续。已生成的结果会保留。":error instanceof Error?error.message:"画布助手暂时不可用"});context.cue(aborted?{type:"stop"}:{type:"failure",code:orbFailureCode||classifyAgentFailure(error).code});
      }finally{
        if(visible()&&requestEpoch===epoch){sessionId=serverSession;if(artifactIds.size){syncContext=context;syncHistory=false;syncCompletion={outcome:state.outcome,error:state.error};set({syncIds:[...artifactIds]});await synchronize(context);}}
        if(controller===active){controller=null;set({busy:false,responding:false});}
      }
    }
    async function restore(id:string,context:CanvasAssistantContext){if(!visible())return;invalidate();const requestEpoch=epoch,active=new AbortController();controller=active;sessionId=id;liveSessionId=id;attempt=undefined;
      const current=()=>visible()&&epoch===requestEpoch&&controller===active&&!active.signal.aborted;let recalled=false;
      set({attachments:[],excluded:[],uploading:false,uploadError:null,steps:[],outcome:"running",busy:true,responding:false,activity:{phase:"connecting"},input:"",error:null,continueTurn:null,syncIds:[]});
      try{for(;;){const response=await context.read(`/api/canvas/assistant?projectKey=${encodeURIComponent(bound.project||"workspace")}&id=${encodeURIComponent(id)}`,{signal:active.signal});const data=await jsonOk(response,"历史对话读取失败");if(!current())return;
        set({activity:{phase:"processing",lastEventAt:Date.now()},anchorId:data.session.anchorId||null});context.selectAnchor(data.session.anchorId||null);
        if(Array.isArray(data.session.referenceIds)){const rows=await context.merge(data.session.referenceIds);if(!current())return;set({attachments:data.session.referenceIds.map((refId:string)=>rows.find(art=>art.id===refId)).filter((art:Artwork|undefined):art is Artwork=>!!art),excluded:assistantContext(rows,data.session.anchorId||"").filter(art=>!data.session.referenceIds.includes(art.id)).map(art=>art.id)});}
        let steps:AgentOrbStep[]=[];const history=data.session.steps||[],turn=history.findLastIndex((step:{type:string})=>step.type==="canvas_turn");for(const step of history.slice(Math.max(0,turn)))steps=reduceAgentProgress(steps,step,context.english,!!data.session.running);
        set({turns:restoreAssistantTimeline(data.session.turns,history,context.english),steps,outcome:restoredOrbOutcome(data.session)});context.cue({type:"restore",recall:!recalled,running:!!data.session.running,outcome:restoredOrbOutcome(data.session),attention:data.session.attention,phase:agentOrbState(!!data.session.running,restoredOrbOutcome(data.session),steps)});recalled=true;
        if(!data.session.running){set({continueTurn:data.session.continueFromTurnId||null,...(data.session.error?{error:data.session.error}:{})});const ids=data.session.turns.flatMap((turn:AssistantTimelineTurn)=>(turn.artifacts||[]).map(art=>art.id));if(ids.length){syncContext=context;syncHistory=true;syncCompletion={outcome:state.outcome,error:state.error};set({syncIds:[...new Set<string>(ids)]});await synchronize(context);}break;}
        await new Promise(resolve=>setTimeout(resolve,1000));if(!current())return;
      }}catch(error){if(current()){context.cue(active.signal.aborted?{type:"stop"}:{type:"failure",code:classifyAgentFailure(error).code});set({outcome:active.signal.aborted?"stopped":"error",error:active.signal.aborted?"已停止跟随任务，请在历史中核对已有结果":error instanceof Error?error.message:"历史对话读取失败"});}}
      finally{if(controller===active){controller=null;set({busy:false,responding:false});}}
    }
    async function list(context:CanvasAssistantContext){const response=await context.read(`/api/canvas/assistant?projectKey=${encodeURIComponent(bound.project||"workspace")}`),data=await jsonOk(response,"历史记录读取失败");return visible()?(data.sessions||[]).map((row:{id:string;title:string;updatedAt:string;anchorId:string})=>({...row,turns:[]})):[];}
    async function rename(id:string,title:string,context:CanvasAssistantContext){if(!visible())return;await jsonOk(await context.read(`/api/canvas/assistant?projectKey=${encodeURIComponent(bound.project||"workspace")}&id=${encodeURIComponent(id)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({title})}),"会话改名失败");}
    async function remove(id:string,context:CanvasAssistantContext){if(!visible())return;await jsonOk(await context.read(`/api/canvas/assistant?projectKey=${encodeURIComponent(bound.project||"workspace")}&id=${encodeURIComponent(id)}`,{method:"DELETE"}),"删除会话失败");if(visible()&&sessionId===id){reset();context.cue({type:"reset"});}}
    return{getSnapshot,subscribe,refs,anchor,input,skill,removeReference,clearReferences,newChat,detach,stop,synchronize,upload,send,restore,list,rename,remove,
      identity:()=>({sessionId,epoch}),isUploading:()=>!!uploadToken,isCurrent:visible,invalidateAttempt:clearAttempt,version};
  }
  return{bind,mount:(value:boolean)=>{mounted=value;if(!value)invalidate();}};
}
