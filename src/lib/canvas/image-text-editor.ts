"use client";
import {browserRandomUUID,browserSha256Hex} from "../browser-crypto";
import {createRetainedBillingSubmission,type RetainedBillingSubmission} from "../billing/client-submission";
import {captureCanvasImageTaskScope} from "./image-task-scope";
import {createCanvasResultAttachment} from "./result-attachment";
import type {CanvasDocumentScope} from "./document-scope";
import type {CanvasPendingNode} from "./scene-types";
import type {CanvasPoint} from "./stable-placement";
import type {Artwork} from "../mock-data";

export type {OcrBox as CanvasOcrBox} from "../canvas-ocr";
import type {OcrBox as CanvasOcrBox} from "../canvas-ocr";
import {visibleTimeout} from "../visible-timeout";
export type CanvasOcrSegment={id:string;text:string;editedText:string;confidence:number;box:CanvasOcrBox};
export type CanvasImageTextState={artworkId:string|null;segments:CanvasOcrSegment[];status:"idle"|"scanning"|"ready"|"applying"|"done"|"error";engine:string;error:string|null;applyingId:string|null;progress:number;imageSize:{width:number;height:number}|null;focusedId:string|null};
const initial=():CanvasImageTextState=>({artworkId:null,segments:[],status:"idle",engine:"",error:null,applyingId:null,progress:0,imageSize:null,focusedId:null});
export const EMPTY_CANVAS_IMAGE_TEXT=initial();
export type CanvasImageEditReceipt={id:string;kind:"text-edit";sourceArtworkId:string;parameters?:{canvasX?:number;canvasY?:number;newText?:string;operationId?:string};status:"queued"|"processing"|"needs_attention"|"completed"|"failed";progress?:number;resultArtworkId?:string;error?:string};
export type CanvasImageTextContext={owner:string;quality:string;members:()=>Artwork[];position:(artwork:Artwork)=>CanvasPoint;
  scan:(body:string,signal:AbortSignal,submission:RetainedBillingSubmission,current:()=>boolean)=>Promise<Response>;
  submit:(body:string,submission:RetainedBillingSubmission,current:()=>boolean)=>Promise<Response>;
  read:(url:string)=>Promise<Response>;pending:(change:(items:CanvasPendingNode[])=>CanvasPendingNode[])=>void;
  merge:(ids:string[],current:()=>boolean)=>Promise<Artwork[]>;history:(ids:string[],rows:Artwork[])=>void;
  refresh:()=>void;credits:()=>Promise<unknown>;notice:(message:string)=>void;
};
type Attempt={panelEpoch:number;operationId:string;unknown?:boolean;body:string;submission:RetainedBillingSubmission;pending:CanvasPendingNode;sourceId:string;segmentId:string;oldText:string;newText:string;taskId?:string};
type Document={context?:CanvasImageTextContext;attempts:Map<string,Attempt>;flights:Map<string,Promise<void>>;segments:Map<string,Attempt>;settled:Set<string>;failed:Set<string>;attachments:Map<string,ReturnType<typeof createCanvasResultAttachment>>};
const normalize=(data:{segments?:Partial<CanvasOcrSegment>[]})=>(data.segments||[]).map((segment,index)=>({id:segment.id||`ocr-${index+1}`,text:String(segment.text||""),editedText:String(segment.text||""),confidence:Number(segment.confidence||0),box:segment.box as CanvasOcrBox})).filter(segment=>segment.text&&segment.box);

/** One editor owns OCR drafts, retained enqueue identity and observation of the
 * existing durable image-edit tasks. It never renders, generates or settles. */
export function createCanvasImageTextEditor(){
  let state=initial(),scope:CanvasDocumentScope|undefined,mounted=true,epoch=0,scan:AbortController|undefined,progress:ReturnType<typeof setInterval>|undefined;
  const listeners=new Set<()=>void>(),documents=new Map<string,Document>();
  const publish=(patch:Partial<CanvasImageTextState>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
  const invalidate=()=>{epoch++;scan?.abort();scan=undefined;if(progress!==undefined)clearInterval(progress);progress=undefined;};
  const reset=(notify=true)=>{invalidate();state=initial();if(notify)listeners.forEach(fn=>fn());};
  function bind(next:CanvasDocumentScope){
    if(scope!==next){scope=next;reset(false);}const bound=next,current=()=>mounted&&scope===bound&&bound.viewCurrent();
    let document=documents.get(bound.key);if(!document){document={attempts:new Map(),flights:new Map(),segments:new Map(),settled:new Set(),failed:new Set(),attachments:new Map()};documents.set(bound.key,document);}const doc=document;
    const close=()=>{if(current())reset();};
    const edit=(id:string,text:string)=>{if(current()&&state.status!=="applying")publish({segments:state.segments.map(s=>s.id===id?{...s,editedText:text}:s)});};
    const focus=(id:string)=>{if(current())publish({focusedId:id});};
    async function open(artwork:Artwork,context:CanvasImageTextContext){
      if(!current())return;invalidate();const token=epoch,controller=new AbortController();scan=controller;
      const active=()=>current()&&token===epoch&&!controller.signal.aborted;
      state={...initial(),artworkId:artwork.id,status:"scanning",progress:12};listeners.forEach(fn=>fn());
      const timer=setInterval(()=>{if(active())publish({progress:state.progress>=88?state.progress:Math.min(88,state.progress+Math.max(2,Math.round((92-state.progress)/8)))});},650);progress=timer;
      try{const response=await context.scan(JSON.stringify({artworkId:artwork.id}),controller.signal,createRetainedBillingSubmission(),active);const data=await response.json();if(!active())return;if(!response.ok)throw Error(data?.error||"图片文字识别失败");
        const segments=normalize(data);if(!segments.length)throw Error("未识别到可编辑文字，请换一张更清晰的图片重试");
        const width=Number(data.image?.width||0),height=Number(data.image?.height||0);publish({segments,engine:String(data.engine||"ocr"),imageSize:width>0&&height>0?{width,height}:null,focusedId:segments[0]?.id||null,progress:100,status:"ready"});
      }catch(error){if(active())publish({error:error instanceof Error?error.message:"图片文字识别失败",status:"error",progress:0});}
      finally{clearInterval(timer);if(progress===timer)progress=undefined;if(scan===controller)scan=undefined;}
    }
    function apply(segment:CanvasOcrSegment,context:CanvasImageTextContext):Promise<void>{
      if(!current()||!state.artworkId)return Promise.resolve();const sourceId=state.artworkId,slot=JSON.stringify([sourceId,segment.id]);const flight=doc.flights.get(slot)||doc.flights.values().next().value;if(flight)return flight;
      const source=context.members().find(a=>a.id===sourceId);if(!source)return Promise.resolve();const text=segment.editedText.trim();
      if(!text||text===segment.text){publish({error:text?"请先修改文字内容":"新文字不能为空"});return Promise.resolve();}
      let attempt=doc.attempts.get(slot);
      // An unknown submit retains its original intent, even if the draft was
      // subsequently edited. Resolve that receipt before creating another job.
      if(!attempt){const point=context.position(source),operationId=browserRandomUUID();attempt={panelEpoch:epoch,operationId,sourceId,segmentId:segment.id,oldText:segment.text,newText:text,submission:createRetainedBillingSubmission(),body:JSON.stringify({kind:"text-edit",quality:context.quality,artworkId:sourceId,oldText:segment.text,newText:text,box:segment.box,canvasX:Math.round(point.x),canvasY:Math.round(point.y),operationId}),pending:{id:`pend-text-edit-${operationId}`,taskKind:"image-edit",x:point.x,y:point.y,parentId:sourceId,linked:true,label:`改字结果 · ${text}`,uploading:false,progress:8,inputs:[sourceId],generating:true}};doc.attempts.set(slot,attempt);}
      if(attempt.taskId){context.refresh();context.notice("原改字任务已受理，正在读取原任务结果");return Promise.resolve();}
      const saved=attempt,token=epoch,visible=()=>current()&&epoch===token&&state.artworkId===sourceId;
      const run=async()=>{if(visible())publish({applyingId:segment.id,status:"applying",error:null,progress:8});context.pending(items=>items.some(p=>p.id===saved.pending.id)?items:[...items,saved.pending]);
        try{let taskId:string;
          if(saved.unknown){
            const id="imgtask-"+(await browserSha256Hex(new TextEncoder().encode(`${context.owner.toLowerCase()}:${saved.operationId}`))).slice(0,32);if(!current())return;
            const response=await context.read(`/api/canvas/image-tasks/${encodeURIComponent(id)}`);const data=await response.json();if(!current())return;
            const task=response.ok&&data.task?.sourceArtworkId===saved.sourceId&&data.task?.parameters?.operationId===saved.operationId?data.task as CanvasImageEditReceipt:undefined;
            if(!task)throw Error("原改字提交尚待核实，请稍后读取原任务；不会重复生成");taskId=task.id;
          }else{
          saved.unknown=true;const response=await context.submit(saved.body,saved.submission,current);const data=await response.json();if(!current())return;
          if(!response.ok||!data?.taskId){if(response.status>=400&&response.status<500&&!["OPERATION_PENDING","OPERATION_CONFLICT"].includes(data?.code))doc.attempts.delete(slot);throw Error(data?.error||"在线改字任务创建失败");}
          taskId=String(data.taskId);
          }
          saved.taskId=taskId;saved.unknown=false;doc.segments.set(saved.taskId,saved);
          context.pending(items=>items.map(p=>p.id===saved.pending.id?{...p,taskId:saved.taskId,taskKind:"image-edit"}:p));context.refresh();
          if(visible())publish({status:"ready",progress:0});context.notice("改字任务已进入后台，可关闭面板继续其他工作");
        }catch(error){if(!saved.submission.ready){saved.unknown=false;doc.attempts.delete(slot);}if(!current())return;context.pending(items=>items.filter(p=>p.id!==saved.pending.id));if(visible())publish({error:error instanceof Error?error.message:"在线改字任务创建失败",status:"error",progress:0});}
        finally{if(visible())publish({applyingId:null});}
      };
      const promise=run().finally(()=>{if(doc.flights.get(slot)===promise)doc.flights.delete(slot);});doc.flights.set(slot,promise);return promise;
    }
    function receive(task:CanvasImageEditReceipt,running:CanvasImageEditReceipt[]){
      if(state.artworkId!==task.sourceArtworkId||state.status==="scanning"||doc.segments.get(task.id)&&doc.segments.get(task.id)!.panelEpoch!==epoch)return;
      if(task.status==="completed"){const saved=doc.segments.get(task.id),segment=saved?.panelEpoch===epoch?saved:undefined;publish({segments:segment?state.segments.map(s=>s.id===segment.segmentId&&s.text===segment.oldText?{...s,text:segment.newText,editedText:s.editedText===segment.newText?segment.newText:s.editedText}:s):state.segments,progress:100,status:running.some(t=>t.sourceArtworkId===task.sourceArtworkId)?"ready":"done",error:null});}
      else publish({progress:0,status:"error",error:task.error||"在线改字失败，请稍后重试"});
    }
    function follow(context:CanvasImageTextContext){
      doc.context=context;let stopped=false,timer:(()=>void)|undefined;const active=()=>!stopped&&current();
      const sync=async()=>{try{
        if(!active())return;const sourceIds=context.members().map(a=>a.id),chunks=Array.from({length:Math.max(1,Math.ceil(sourceIds.length/80))},(_,index)=>sourceIds.slice(index*80,index*80+80));
        const responses=await Promise.all(chunks.map(ids=>context.read(`/api/canvas/image-tasks?limit=500&sourceIds=${encodeURIComponent(ids.join(","))}`)));if(!active())return;if(responses.some(r=>!r.ok))throw Error("图片编辑任务查询失败");
        const payloads=await Promise.all(responses.map(r=>r.json()));if(!active())return;const members=context.members(),memberIds=new Set(members.map(a=>a.id));
        const tasks=payloads.flatMap(p=>Array.isArray(p?.tasks)?p.tasks:[]) as CanvasImageEditReceipt[],relevant=Array.from(new Map(tasks.filter(t=>t.kind==="text-edit"&&memberIds.has(t.sourceArtworkId)).map(t=>[t.id,t])).values());
        for(const task of relevant){for(const attempt of doc.attempts.values())if(attempt.unknown&&attempt.sourceId===task.sourceArtworkId&&attempt.operationId===task.parameters?.operationId){attempt.taskId=task.id;attempt.unknown=false;doc.segments.set(task.id,attempt);}}
        const running=relevant.filter(t=>t.status==="queued"||t.status==="processing"),terminal=new Set(relevant.filter(t=>["completed","failed","needs_attention"].includes(t.status)).map(t=>t.id));
        context.pending(items=>{const aliases=new Map([...doc.attempts.values()].filter(a=>a.taskId).map(a=>[a.pending.id,a.taskId!]));items=items.map(p=>aliases.has(p.id)?{...p,taskId:aliases.get(p.id),taskKind:"image-edit" as const}:p);const progressByTask=new Map(running.map(t=>[t.id,Math.max(5,Math.min(95,Number(t.progress||0)))])),kept=items.filter(p=>p.taskKind!=="image-edit"||!p.taskId||!terminal.has(p.taskId)).map(p=>p.taskKind==="image-edit"&&p.taskId&&progressByTask.has(p.taskId)?{...p,progress:progressByTask.get(p.taskId)!}:p),known=new Set(kept.filter(p=>p.taskKind==="image-edit").map(p=>p.taskId));
          for(const task of running){if(known.has(task.id))continue;const source=members.find(a=>a.id===task.sourceArtworkId)!,point=context.position(source),x=task.parameters?.canvasX==null?NaN:Number(task.parameters.canvasX),y=task.parameters?.canvasY==null?NaN:Number(task.parameters.canvasY);kept.push({id:`pend-image-task-${task.id}`,taskId:task.id,taskKind:"image-edit",x:Number.isFinite(x)?x:point.x,y:Number.isFinite(y)?y:point.y,parentId:task.sourceArtworkId,linked:true,label:task.parameters?.newText?`改字结果 · ${String(task.parameters.newText).slice(0,18)}`:"改字结果生成中",uploading:false,progress:Math.max(5,Math.min(95,Number(task.progress||0))),inputs:[task.sourceArtworkId],generating:true});}return kept;});
        for(const task of relevant){if(!active())return;
          if(task.status==="completed"&&task.resultArtworkId&&!doc.settled.has(task.id)){
            if(!memberIds.has(task.resultArtworkId)){
              let attach=doc.attachments.get(task.id);if(!attach){const x=task.parameters?.canvasX==null?NaN:Number(task.parameters.canvasX),y=task.parameters?.canvasY==null?NaN:Number(task.parameters.canvasY);attach=createCanvasResultAttachment({position:()=>Number.isFinite(x)&&Number.isFinite(y)?{x,y}:undefined,layout:{kind:"single"},saveErrorText:"改字结果定位失败",merge:(ids,isCurrent)=>doc.context!.merge(ids,isCurrent),history:(ids,rows)=>doc.context!.history(ids,rows)});doc.attachments.set(task.id,attach);}
              await attach(captureCanvasImageTaskScope(context.owner,bound.project,active),[{id:task.resultArtworkId}]);if(!active())return;
            }
            await context.credits();if(!active())return;doc.settled.add(task.id);doc.attachments.delete(task.id);receive(task,running);doc.segments.delete(task.id);for(const [slot,attempt] of doc.attempts)if(attempt.taskId===task.id)doc.attempts.delete(slot);context.notice("文字修改完成，结果已生成在原图右侧");
          }
          if((task.status==="failed"||task.status==="needs_attention")&&!doc.failed.has(task.id)){doc.failed.add(task.id);for(const [slot,attempt] of doc.attempts)if(attempt.taskId===task.id)doc.attempts.delete(slot);doc.segments.delete(task.id);receive(task,running);context.notice(task.error||"在线改字失败，请稍后重试");}
        }
        if(active())timer=visibleTimeout(sync,running.length?3000:30000);
      }catch{if(active())timer=visibleTimeout(sync,10000);}};
      void sync();return()=>{stopped=true;timer?.();};
    }
    return {getSnapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},open,close,edit,focus,apply,follow};
  }
  return {bind,mount:(value:boolean)=>{mounted=value;if(!value)invalidate();}};
}
