"use client";

import {useEffect,useRef,useState} from 'react';
import {useSurfaceAppearance,surfaceAppearanceClass} from '../ui/surface-appearance';
import type {CanvasImageAttachment} from "@/lib/canvas/image-versions";
import {pollImagegen} from '@/lib/imagegen/client';
import {completeCanvasImagegen,listPendingAttempts,pendingAttemptKey,updateCanvasImagegenPlacement,type ImagegenPendingAttempt} from '@/lib/imagegen/client-recovery';

import {bindCanvasFanoutResults,type CanvasFanoutPlacement} from '@/lib/canvas/generation-fanout';

export type ImagegenPendingRecoveryProps={
 owner:string;workspace:string;project:string;isCurrent?:()=>boolean;
 onAttach:(ids:string[],isCurrent:()=>boolean,attachment?:CanvasImageAttachment,placement?:CanvasFanoutPlacement)=>Promise<boolean>;
};

/** The root-level entry survives removal of the original blank canvas node. */
export function ImagegenPendingRecovery(props:ImagegenPendingRecoveryProps){
 const scopeKey=JSON.stringify([props.owner.toLowerCase(),props.workspace,props.project]);
 const scope=useRef({key:scopeKey,epoch:0});
 if(scope.current.key!==scopeKey)scope.current={key:scopeKey,epoch:scope.current.epoch+1};
 const epoch=scope.current.epoch;
 return <ScopedRecovery key={scopeKey} {...props} isCurrent={()=>scope.current.epoch===epoch&&props.isCurrent?.()!==false}/>;
}

function ScopedRecovery({owner,workspace,project,isCurrent,onAttach}:ImagegenPendingRecoveryProps){
 const appearance=useSurfaceAppearance();
 const [attempts,setAttempts]=useState<ImagegenPendingAttempt[]>([]);
 const [open,setOpen]=useState(false);
 const [states,setStates]=useState<Record<string,{busy:boolean;message:string}>>({});
 const mounted=useRef(false),snapshotTaken=useRef(false),checking=useRef(new Set<string>());
 const callbacks=useRef({isCurrent,onAttach});callbacks.current={isCurrent,onAttach};
 const current=()=>mounted.current&&callbacks.current.isCurrent?.()!==false;
 useEffect(()=>{
  mounted.current=true;
  if(!snapshotTaken.current){snapshotTaken.current=true;setAttempts(listPendingAttempts({owner,workspace,project}));}
  return ()=>{mounted.current=false;};
  // The keyed child takes one storage snapshot per scope mount, not per render.
 },[]); // eslint-disable-line react-hooks/exhaustive-deps

 async function check(attempt:ImagegenPendingAttempt){
  const key=pendingAttemptKey(attempt.owner,attempt.workspace,attempt.project,attempt.actionKey);
  if(!current()||checking.current.has(key))return;
  checking.current.add(key);
  setStates(old=>({...old,[key]:{busy:true,message:'正在检查原任务'}}));
  try{
   const result=await pollImagegen(attempt.operationId,{...attempt.context,isCurrent:current});
   if(!current())return;
   if(result.operationId!==attempt.operationId||result.jobId!==`imagegen-${attempt.operationId}`)throw new Error('原任务回执不匹配');
   const ids=[...new Set((result.artifacts||[]).map(artifact=>artifact.artworkId).filter(id=>typeof id==='string'&&id.trim().length>0))];
   const labels:Record<string,string>={queued:'等待开始',pending:'等待处理',running:'处理中',needs_attention:'待核查',succeeded:'已完成',partial:'部分完成',failed:'失败',cancelled:'已取消'};
   let message=labels[result.status]||'状态待确认';
   if((result.status==='succeeded'||result.status==='partial')&&ids.length){
    if(!current())return;
    const target=attempt.request.canvasTarget,attachment=result.canvasAttachment;
    if(target&&(!attachment||attachment.nodeId!==target.nodeId))throw new Error('原任务图片已保存，节点版本仍待同步');
    if(target&&attachment?.reason==='deleted')throw new Error('原节点已删除，生成结果已保存在创作记录');
    const placement=!target&&attempt.placement?updateCanvasImagegenPlacement({owner,workspace,project},attempt.actionKey,p=>bindCanvasFanoutResults(p,ids)):undefined;
    const attached=await callbacks.current.onAttach(target?[target.nodeId]:ids,current,attachment,placement);
    if(!current())return;
    if(result.status==='succeeded'&&attached&&(!placement||placement.slots.every(slot=>slot.artworkId))){
     completeCanvasImagegen(`imagegen-${attempt.operationId}`,{owner:attempt.owner,workspace:attempt.workspace,project:attempt.project});
     setAttempts(old=>old.filter(item=>item.operationId!==attempt.operationId));
     return;
    }
    message+=attached?'，已恢复现有图片，原任务仍待核查':'，图片尚未合并';
   }else if(result.status==='succeeded')message+='，暂无可恢复图片';
   if(result.error?.message)message+=`：${result.error.message.slice(0,120)}`;
   if(current())setStates(old=>({...old,[key]:{busy:false,message}}));
  }catch(error){
   if(current()){
    const status=typeof error==='object'&&error!==null&&'status' in error?String(error.status):'';
    const message=error instanceof Error?error.message:'原任务检查失败';
    setStates(old=>({...old,[key]:{busy:false,message:`${status&&status!=='0'?`HTTP ${status}：`:''}${message.slice(0,160)}`}}));
   }
  }finally{checking.current.delete(key);}
 }

 if(!attempts.length)return null;
 return <aside aria-label="图像任务恢复" className={`absolute bottom-4 left-4 z-30 w-80 max-w-[calc(100vw_-_2rem)] text-xs canvas-ui-text ${surfaceAppearanceClass(appearance||"light")}`}>
  <button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)} className="canvas-ui-control rounded-lg border px-3 py-2 shadow-sm focus-visible:outline focus-visible:outline-2">待恢复任务 {attempts.length}</button>
  {open&&<ul aria-label="待恢复原任务" className="canvas-ui-surface canvas-ui-surface-solid mt-2 max-h-64 space-y-2 overflow-y-auto rounded-xl border p-3 shadow-md">
   {attempts.map((attempt,index)=>{
    const key=pendingAttemptKey(attempt.owner,attempt.workspace,attempt.project,attempt.actionKey),state=states[key];
    return <li key={key} className="canvas-ui-border min-w-0 border-b pb-2 last:border-0 last:pb-0">
     <div className="flex items-center justify-between gap-3">
      <span title={attempt.operationId}>原任务 {index+1} · {attempt.operationId.slice(-8)}</span>
      <button type="button" aria-label={`检查原任务 ${attempt.operationId}`} disabled={state?.busy} onClick={()=>check(attempt)} className="canvas-ui-control shrink-0 rounded-md border px-2 py-1 disabled:opacity-50">{state?.busy?'检查中…':'检查原任务'}</button>
     </div>
     <p role="status" className="canvas-ui-muted mt-1 break-words">{state?.message||(attempt.accepted==='unknown'?'受理状态待确认':'已受理，待恢复')}</p>
    </li>;
   })}
  </ul>}
 </aside>;
}
