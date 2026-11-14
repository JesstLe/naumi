import {createHash} from 'node:crypto';
import {ModelConfigError} from '../model-config/types';
import type {VideoWorkflowPlan} from './workflow-schema';
import type {VideoExecutionDraft} from './execution-contract';
import type {CreateVideoInput} from './submission-types';
import type {VideoReference} from './types';

type Node=VideoWorkflowPlan['nodes'][number];
type Binding=NonNullable<Node['mediaBindings']>[number];
export const workflowElementExecutionVersion=2;
export function workflowExecutionVersion(plan:Pick<VideoWorkflowPlan,'nodes'>){return plan.nodes.some(node=>node.mediaBindings?.some(binding=>binding.elementId))?workflowElementExecutionVersion:1;}
export type DeferredWorkflowInput=VideoExecutionDraft['inputs'][number]&{elementId?:string};
export function workflowBindingId(runId:string,binding:Binding){return binding.inputId||`wf-${createHash('sha256').update(`${runId}:${binding.fromNodeId}:${binding.outputIndex||0}:${binding.role}`).digest('hex').slice(0,40)}`;}
const invalid=(reason:string):never=>{throw new ModelConfigError('INVALID_VIDEO_WORKFLOW',reason,422);};

/** Plan structure only. No model capability, ownership shortcut, asset facts,
 * repository, signing or task state is inferred here. Old flat slots keep their
 * exact IDs/order. A new target must name an existing declared element. */
export function validateWorkflowElementBindings(runId:string,node:Node){
 const bindings=node.mediaBindings??[],groups=node.request.elements??[],ids=bindings.map(binding=>workflowBindingId(runId,binding));
 if(new Set(ids).size!==ids.length)invalid('制作链依赖槽身份重复');
 const staticIds=new Set([...(node.request.references??[]),...groups.flatMap(group=>group.references)].map(ref=>ref.id));
 for(const binding of bindings){
  if(staticIds.has(workflowBindingId(runId,binding)))invalid('依赖槽不能覆盖已有素材');
  if(binding.elementId&&(binding.role!=='element'||groups.filter(group=>group.id===binding.elementId).length!==1))invalid('元素依赖需要明确且唯一的目标分组和元素用途');
  if(binding.elementId&&node.request.comfyWorkflowId)invalid('工作流DAG依赖使用输入槽映射，不能隐式映射为模型元素分组');
  if(binding.elementId&&node.request.orderedInputs?.some(input=>input.id===workflowBindingId(runId,binding)))invalid('元素依赖不能同时出现在普通输入序列');
 }
 for(const group of groups)if(!group.references.length&&(!group.id||!bindings.some(binding=>binding.elementId===group.id)))invalid('空元素分组需要明确的前序素材绑定');
}

/** Temporary identity-only draft for the common freeze compiler. The source
 * node is NOT claimed to be an existing artwork: prepareDeferredVideoInputs
 * removes the exact pending ID before any ownership/media resolution. Neither
 * this temporary reference nor invented media facts are written to the plan. */
export function withDeferredWorkflowElements(input:CreateVideoInput,future:DeferredWorkflowInput[]):CreateVideoInput{
 if(!future.some(item=>item.elementId))return input;
 const elements=structuredClone(input.elements??[]);
 for(const item of future){
  if(!item.elementId)continue;
  const group=elements.find(group=>group.id===item.elementId);
  if(!group||item.role!=='element'||item.kind==='text'||group.references.some(ref=>ref.id===item.id))return invalid('元素依赖与原分组不一致');
  group.references.push({id:item.id,kind:item.kind,role:'element',artworkId:item.nodeId});
 }
 return {...input,elements};
}

/** Place only a server-owned dependencyReference receipt into its frozen group.
 * Never append it to ordinary references as well or alter another member. */
export function attachWorkflowElementReference(request:Pick<CreateVideoInput,'elements'>,binding:Binding,reference:VideoReference){
 if(!binding.elementId)return false;
 const group=request.elements?.find(group=>group.id===binding.elementId);
 if(!group||binding.role!=='element'||reference.role!=='element'||reference.kind!==binding.kind||group.references.some(ref=>ref.id===reference.id))return invalid('前序产物与原元素依赖不一致');
 group.references.push(reference);return true;
}
