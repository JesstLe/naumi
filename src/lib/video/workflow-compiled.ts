import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {canonicalConfig} from '../model-config/snapshot-value';
import {currentModelExecution} from '../model-config/context';
import {BillingError,type BillingQuote} from '../billing/types';
import {VideoContractError} from './contract';
import {videoSubmissionDraft} from './submission-draft';
import {bindPublishedVideoExecution} from './published-execution';
import {prepareDeferredVideoInputs} from './prepare-inputs';
import {prepareVideoDraftConstraints} from './compile';
import {videoDraftSchema,resolvedVideoDraftSchema,videoModelBindingSchema,videoExecutionPolicySchema,videoDraftPreparationSchema,videoDiagnostic,
 type VideoExecutionDraft,type ResolvedVideoDraft,type VideoResult,type CompiledVideoPlan} from './execution-contract';
import {prepareVideoExecution} from './prepare-execution';
import type {CreateVideoInput} from './submission-types';

const projectedSchema=videoDraftPreparationSchema;
const payloadSchema=z.strictObject({schemaVersion:z.literal(1),state:z.enum(['prepared','dependency_pending']),
 binding:videoModelBindingSchema,policy:videoExecutionPolicySchema,
 requestDraft:videoDraftSchema,draft:videoDraftSchema,staticDraft:resolvedVideoDraftSchema,
 futureInputs:videoDraftSchema.shape.inputs,projected:projectedSchema});
const frozenSchema=payloadSchema.extend({digest:z.string().regex(/^[a-f0-9]{64}$/)});
export type FrozenWorkflowCompiled=z.infer<typeof frozenSchema>;
const budgetSchema=z.object({version:z.number().int().positive(),authorizedCredits:z.number().int().nonnegative()});
type Confirmation={version:number;credits:number};
const pendingContext=new AsyncLocalStorage<{frozen:FrozenWorkflowCompiled;budget:z.infer<typeof budgetSchema>;confirmation?:Confirmation}>();
const failure=(code:string,reason:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic('input',code,'inputs',reason,'核对原制作链冻结记录与依赖产物')]});
const hash=(value:unknown)=>createHash('sha256').update(canonicalConfig(value)).digest('hex');
function required<T>(result:VideoResult<T>):T{if(!result.ok)throw new VideoContractError(result.diagnostics[0].code,result.diagnostics[0].reason,[result.diagnostics[0].field]);return result.value;}

/** This is not a compiled plan: dependency slots have no asset facts, and the
 * shared Profile mapper only establishes draft constraints/quote facts here.
 * Each stage performs its single final compilation after dependencies resolve. */
export async function freezeWorkflowCompiled(actor:string,projectKey:string,input:CreateVideoInput,futureInputs:VideoExecutionDraft['inputs']):Promise<FrozenWorkflowCompiled>{
 const execution=currentModelExecution('video');
 if(!execution?.frozen.video?.execution)throw new VideoContractError('VIDEO_EXECUTION_NOT_CONFIGURED','制作链缺少新版执行绑定');
 const {binding,policy,profile}=bindPublishedVideoExecution(execution.frozen.video.execution,{publicModelId:execution.frozen.publicModelId,wireModel:execution.connection.wireModel,connectionId:execution.connection.providerId});
 const requestDraft=videoSubmissionDraft(input),pendingIds=new Set(futureInputs.map(item=>item.id));
 if(pendingIds.size!==futureInputs.length)throw new VideoContractError('DUPLICATE_INPUT','制作链依赖槽重复');
 for(const future of futureInputs){
   const existing=requestDraft.inputs.find(item=>item.id===future.id);
   if(existing&&(existing.kind!==future.kind||existing.role!==future.role||existing.nodeId!==future.nodeId))throw new VideoContractError('INPUT_IDENTITY_MISMATCH','依赖槽与输入身份不一致');
   if(input.references?.some(ref=>ref.id===future.id))throw new VideoContractError('DUPLICATE_INPUT','依赖槽不能覆盖已有素材');
   if(existing)requestDraft.inputs[requestDraft.inputs.indexOf(existing)]={...future};else{
     // Submission flattens grouped inputs after ordinary references. Future
     // media belong to that ordinary sequence, not after synthetic shot text
     // or element members; otherwise final ingress order disagrees with freeze.
     const structuredIds=new Set([...(requestDraft.structure?.shots??[]).flatMap(shot=>shot.promptInputId?[shot.promptInputId]:[]),...(requestDraft.structure?.elements??[]).flatMap(element=>element.inputIds)]);
     const index=requestDraft.inputs.findIndex(item=>structuredIds.has(item.id));
     requestDraft.inputs.splice(index<0?requestDraft.inputs.length:index,0,{...future});
   }
 }
 const preparation=required(await prepareDeferredVideoInputs(actor,projectKey,requestDraft,[...pendingIds]));
 // Existing text is frozen, not re-read later as a different prompt. The
 // resolved static manifest separately preserves its true owner identities.
 const staticById=new Map(preparation.resolved.inputs.map(item=>[item.id,item]));
 const draft={...preparation.draft,inputs:preparation.draft.inputs.map(item=>{const known=staticById.get(item.id);return {...item,...(known?.kind==='text'?{value:known.text}:{})};})};
 const projected=required(prepareVideoDraftConstraints({draft,binding,policy,profile}));
 const payload=payloadSchema.parse({schemaVersion:1,state:futureInputs.length?'dependency_pending':'prepared',binding,policy,requestDraft,draft,staticDraft:preparation.resolved,futureInputs,projected});
 return {...payload,digest:hash(payload)};
}

export function readFrozenWorkflowCompiled(raw:unknown):FrozenWorkflowCompiled{
 const parsed=frozenSchema.safeParse(raw);if(!parsed.success)throw new VideoContractError('INVALID_WORKFLOW_COMPILED','制作链编译快照结构无效');
 const {digest,...payload}=parsed.data;
 if(hash(payload)!==digest||new Set(payload.futureInputs.map(item=>item.id)).size!==payload.futureInputs.length||payload.state!==(payload.futureInputs.length?'dependency_pending':'prepared'))throw new VideoContractError('INVALID_WORKFLOW_COMPILED','制作链编译快照摘要不一致');
 return parsed.data;
}
export function runFrozenWorkflowCompiled<T>(raw:unknown,budget:unknown,confirmation:Confirmation|undefined,run:()=>Promise<T>){
 const parsed=budgetSchema.safeParse(budget);if(!parsed.success)throw new VideoContractError('INVALID_WORKFLOW_COMPILED','制作链授权报价记录无效');
 return pendingContext.run({frozen:readFrozenWorkflowCompiled(raw),budget:parsed.data,confirmation},run);
}
/** Only frozen Workflow authorization is bounded here. Generic quote display
 * confirmation stays unchanged. A larger final authorization uses the existing
 * durable stage confirmation route, before reservation/provider effects. */
export function assertFrozenWorkflowQuote(quote:BillingQuote){
 const context=pendingContext.getStore();if(!context)return;
 const {budget,confirmation}=context;
 if(quote.configVersion===budget.version&&quote.authorizedCredits<=budget.authorizedCredits)return;
 if(confirmation?.version===quote.configVersion&&Number.isSafeInteger(confirmation.credits)&&confirmation.credits>=quote.authorizedCredits)return;
 throw new BillingError('PRICE_CHANGED','此阶段报价超出制作链原授权，请确认后继续',409);
}

/** Called only inside the authenticated frozen-stage scope. HTTP cannot send
 * a plan or install this context. Known assets stay pinned; only declared
 * future slots bind newly completed owned outputs. No latest catalogue read. */
export async function prepareFrozenWorkflowCompiled(actor:string,input:CreateVideoInput):Promise<VideoResult<CompiledVideoPlan>|undefined>{
 const context=pendingContext.getStore();if(!context)return undefined;const {frozen}=context;
 if(!input.workflowRunId||!input.workflowNodeId)return failure('WORKFLOW_SNAPSHOT_MISMATCH','冻结制作链只可提交所属阶段');
 const execution=currentModelExecution('video');if(!execution?.frozen.video?.execution)return failure('WORKFLOW_SNAPSHOT_MISMATCH','制作链没有恢复原执行绑定');
 const bound=bindPublishedVideoExecution(execution.frozen.video.execution,{publicModelId:execution.frozen.publicModelId,wireModel:execution.connection.wireModel,connectionId:execution.connection.providerId});
 if(canonicalConfig(bound.binding)!==canonicalConfig(frozen.binding)||canonicalConfig(bound.policy)!==canonicalConfig(frozen.policy)||actor.toLowerCase()!==frozen.staticDraft.scope.actorId||input.projectKey!==frozen.staticDraft.scope.projectKey)return failure('WORKFLOW_SNAPSHOT_MISMATCH','制作链执行作用域或绑定已改变');
 const actual=videoSubmissionDraft(input),futureIds=new Set(frozen.futureInputs.map(item=>item.id));
 const settings=(draft:VideoExecutionDraft)=>({prompt:draft.prompt,parameters:draft.parameters,structure:draft.structure,intentPreference:draft.intentPreference,legacyMode:draft.legacyMode});
 if(canonicalConfig(settings(actual))!==canonicalConfig(settings(frozen.requestDraft)))return failure('WORKFLOW_DRAFT_CHANGED','制作链原始参数或描述已改变');
 const expected=frozen.requestDraft.inputs;
 if(actual.inputs.length!==expected.length||actual.inputs.some((item,index)=>{
  const old=expected[index];return !old||item.id!==old.id||item.kind!==old.kind||item.role!==old.role||!futureIds.has(item.id)&&(item.nodeId!==old.nodeId||item.storageKey!==old.storageKey);
 }))return failure('WORKFLOW_DRAFT_CHANGED','制作链输入顺序、角色或身份已改变');
 const known=new Map(frozen.staticDraft.inputs.map(item=>[item.id,item])),resolvedFuture=new Map(actual.inputs.filter(item=>futureIds.has(item.id)).map(item=>[item.id,item]));
 const draft:VideoExecutionDraft={...frozen.draft,inputs:frozen.draft.inputs.map(item=>{
   const previous=known.get(item.id);if(!previous)return {...resolvedFuture.get(item.id)!};
   if(previous.kind==='text')return {id:item.id,nodeId:/^(character|scene):/.test(previous.nodeId)?`inline:workflow-${item.id}`:previous.nodeId,kind:'text',role:previous.role,value:previous.text};
   return {id:item.id,nodeId:previous.asset.artworkId||`upload:${item.id}`,kind:previous.kind,role:previous.role,...(!previous.asset.artworkId?{storageKey:previous.asset.storageKey}:{})};
 })};
 const validateResolved=(resolved:ResolvedVideoDraft):VideoResult<true>=>{
   if(canonicalConfig(resolved.scope)!==canonicalConfig(frozen.staticDraft.scope))return failure('VIDEO_SCOPE_MISMATCH','制作链素材与原工作空间不一致');
   for(const previous of frozen.staticDraft.inputs){const current=resolved.inputs.find(item=>item.id===previous.id);
     if(!current||current.kind!==previous.kind||current.role!==previous.role)return failure('FROZEN_MEDIA_CHANGED','制作链已冻结素材或文字版本发生变化');
     if(previous.kind==='text'){
       if(current.kind!=='text'||current.text!==previous.text)return failure('FROZEN_MEDIA_CHANGED','制作链冻结文字已改变');
     }else if(current.kind==='text'||canonicalConfig(current.asset)!==canonicalConfig(previous.asset))return failure('FROZEN_MEDIA_CHANGED','制作链已冻结素材版本发生变化');
   }
   for(const future of frozen.futureInputs){const current=resolved.inputs.find(item=>item.id===future.id),ref=input.references?.find(item=>item.id===future.id);
     if(!ref?.artworkId||!current||current.kind==='text'||current.asset.artworkId!==ref.artworkId||ref.sha256&&ref.sha256!==current.asset.sha256)return failure('FROZEN_MEDIA_CHANGED','前序产物与制作链回执不一致');
   }
   return {ok:true,value:true};
 };
 const result=await prepareVideoExecution({actor,projectKey:input.projectKey!,draft,execution:execution.frozen.video.execution,identity:{publicModelId:frozen.binding.publicModelId,wireModel:frozen.binding.wireModel,connectionId:frozen.binding.connectionId},validateResolved});
 if(result.ok&&canonicalConfig({intent:result.value.intent,effectiveParameters:result.value.effectiveParameters,billingFacts:result.value.billingFacts})!==canonicalConfig(frozen.projected))return failure('WORKFLOW_SNAPSHOT_MISMATCH','最终执行事实与冻结参数准备不一致');
 return result;
}
