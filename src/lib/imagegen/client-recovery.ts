"use client";
import {browserSha256Hex} from '../browser-crypto';
import {ImagegenHttpError} from './http';
import type {ImagegenClientContext} from './client';
import type {ImagegenRequest} from './types';
import {readCanvasFanoutPlacement,type CanvasFanoutPlacement} from '../canvas/generation-fanout';

const prefix='naumi:imagegen-pending:v1:';
export type ImagegenPendingAttempt={version:1;owner:string;workspace:string;project:string;actionKey:string;operationId:string;quoteId?:string;request:ImagegenRequest;authorizedCredits:number;confirmationRequired:boolean;accepted:'unknown'|'unaccepted'|'accepted';jobId?:string;context:Omit<ImagegenClientContext,'isCurrent'>;placement?:CanvasFanoutPlacement};
const inFlight=new Map<string,Promise<Response>>();
const storage=()=>{if(typeof sessionStorage==='undefined')throw new Error('浏览器未保存本次任务凭据，请启用会话存储后重试');return sessionStorage};
export function pendingAttemptKey(owner:string,workspace:string,project:string,actionKey:string){return prefix+JSON.stringify([owner.toLowerCase(),workspace,project,actionKey]);}
export function readPendingAttempt(key:string):ImagegenPendingAttempt|null{
 const raw=storage().getItem(key);if(raw===null)return null;
 try{const value=JSON.parse(raw) as ImagegenPendingAttempt;
  if(value.version!==1||!value.request||value.request.operationId!==value.operationId||pendingAttemptKey(value.owner,value.workspace,value.project,value.actionKey)!==key||!Number.isFinite(value.authorizedCredits)||value.jobId!==undefined&&value.jobId!==`imagegen-${value.operationId}`||!['unknown','unaccepted','accepted'].includes(value.accepted)||value.context.workspace!==value.workspace||(value.context.projectContext||'workspace')!==value.project)throw Error();
  if(value.placement&&!readCanvasFanoutPlacement(value.placement,value.request.sourceNodeId,value.request.variants))throw Error();
  return value;
 }catch{throw new ImagegenHttpError('本次任务凭据读取异常，请保留当前会话并稍后核查',0);}
}
/** A mount-time snapshot, independent of the original canvas node/action.
 * Invalid and foreign receipts stay untouched; only possibly accepted work is
 * offered for an explicit, read-only check of the original operation. */
export function listPendingAttempts(scope:{owner:string;workspace:string;project:string}):ImagegenPendingAttempt[]{
 if(!scope.owner||!scope.workspace||!scope.project)return [];
 try{
  const target=storage(),owner=scope.owner.toLowerCase();
  const scopedPrefix=prefix+JSON.stringify([owner,scope.workspace,scope.project]).slice(0,-1)+',';
  const keys=Array.from({length:target.length},(_,i)=>target.key(i));
  const attempts:ImagegenPendingAttempt[]=[];
  for(const key of keys){
   if(!key?.startsWith(scopedPrefix))continue;
   try{const attempt=readPendingAttempt(key);
    if(attempt&&attempt.owner===owner&&attempt.workspace===scope.workspace&&attempt.project===scope.project&&(attempt.accepted==='unknown'||attempt.accepted==='accepted'))attempts.push(attempt);
   }catch{/* Preserve unreadable receipts, without hiding other valid work. */}
  }
  return attempts;
 }catch{return [];}
}
export function savePendingAttempt(key:string,value:ImagegenPendingAttempt){const target=storage(),raw=JSON.stringify(value);target.setItem(key,raw);if(target.getItem(key)!==raw)throw new Error('本次任务凭据未保存，尚未提交生成');}
/** One live submit/recovery per action. Each caller receives an unread Response. */
export async function withPendingAttempt(key:string,run:()=>Promise<Response>){
 let promise=inFlight.get(key);
 if(!promise){promise=run();inFlight.set(key,promise);void promise.finally(()=>{if(inFlight.get(key)===promise)inFlight.delete(key)}).catch(()=>{});}
 return (await promise).clone();
}
/** Node action metadata is stable across outer retries. Content is only the
 * fallback for callers without node metadata; positions and file timestamps
 * must not turn a retry into a fresh purchase. */
export async function canvasImagegenActionKey(form:FormData,sourceNodeId?:string){
 const node=String(form.get('imagegenNodeId')||'');if(node)return `node:${node}`;
 const entries:unknown[]=[];
 for(const [key,value] of form.entries()){
  if(['imagegenNodeX','imagegenNodeY','imagegenPlacement','email'].includes(key))continue;
  entries.push([key,typeof value==='string'?value:{name:value.name,type:value.type,size:value.size,sha256:await browserSha256Hex(new Uint8Array(await value.arrayBuffer()))}]);
 }
 return `content:${await browserSha256Hex(new TextEncoder().encode(JSON.stringify([sourceNodeId||'',entries])))}`;
}
/** Called only after the original job's results have been attached successfully
 * to this canvas. A POST acknowledgment is not completed delivery. */
export function completeCanvasImagegen(jobId:string,scope:{owner:string;project:string;workspace:string}){
 if(!/^imagegen-[a-f0-9-]{36}$/i.test(jobId))return;
 try{
 const target=storage();
 const scopedPrefix=prefix+JSON.stringify([scope.owner.toLowerCase(),scope.workspace,scope.project]).slice(0,-1)+',';
 for(const key of Array.from({length:target.length},(_,i)=>target.key(i)).filter((key):key is string=>!!key&&key.startsWith(scopedPrefix))){
  let attempt:ImagegenPendingAttempt|null;try{attempt=readPendingAttempt(key);}catch{continue;}
  if(attempt&&attempt.owner===scope.owner.toLowerCase()&&attempt.workspace===scope.workspace&&attempt.project===scope.project&&`imagegen-${attempt.operationId}`===jobId&&target.getItem(key)===JSON.stringify(attempt))target.removeItem(key);
 }
 }catch{/* Delivery already succeeded. Keep the receipt; never fail attachment. */}
}

/** Only update presentation metadata on the exact existing scoped receipt. */
export function updateCanvasImagegenPlacement(scope:{owner:string;workspace:string;project:string},actionKey:string,
  update:(placement:CanvasFanoutPlacement)=>CanvasFanoutPlacement) {
 const key=pendingAttemptKey(scope.owner,scope.workspace,scope.project,actionKey),pending=readPendingAttempt(key);
 if(!pending?.placement)return;
 const placement=readCanvasFanoutPlacement(update(pending.placement),pending.request.sourceNodeId,pending.request.variants);
 if(!placement)throw new Error("生成位置记录无效，原任务已保留");
 savePendingAttempt(key,{...pending,placement});
 return placement;
}
