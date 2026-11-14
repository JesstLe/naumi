import 'server-only';
import {z} from 'zod';
import {getVideoNode} from '../canvas/video-node-repository';
import {ModelConfigError} from '../model-config/types';
import {videoDraftSchema} from './execution-contract';
import {videoSubmissionDraft} from './submission-draft';
import {previewVideoExecution} from './compile-preview';
import {assertCurrentCreationFeature} from '../saas/creation-access';

export const canvasVideoPreviewSchema=z.strictObject({expectedRevision:z.number().int().nonnegative(),draftRevision:z.number().int().nonnegative(),
  draft:videoDraftSchema.optional(),modelId:z.string().trim().min(1).max(100).optional()});
/** The node owns project and revision. Unsaved draft values are still untrusted
 * input identities, resolved by the same application compiler as submission. */
export async function previewCanvasVideo(actor:string,nodeId:string,raw:unknown){
  await assertCurrentCreationFeature(`/api/canvas/video-nodes/${nodeId}/generate`);
  const parsed=canvasVideoPreviewSchema.safeParse(raw);if(!parsed.success)throw new ModelConfigError('INVALID_VIDEO_PREVIEW','视频预览字段无效',422);
  const node=await getVideoNode(actor,nodeId);if(!node)throw new ModelConfigError('VIDEO_NODE_UNAVAILABLE','视频节点不存在',404);
  if(node.revision!==parsed.data.expectedRevision)throw new ModelConfigError('VIDEO_NODE_REVISION_CONFLICT','视频节点已更新，请重新读取后预览',409);
  const {batchCount:_batch,comfyWorkflowId:_comfy,comfyInputs:_inputs,comfyOverrides:_overrides,...config}=node.config;
  const draft=parsed.data.draft??videoSubmissionDraft({...config,source:'canvas',prompt:config.prompt||'',seconds:String(config.durationSeconds??''),size:config.resolution||'',
    orderedInputs:node.inputs.length?node.inputs:undefined,references:node.inputs.length?undefined:config.references});
  return previewVideoExecution(actor,{projectKey:node.projectKey,modelId:parsed.data.modelId??node.config.modelId,draftRevision:parsed.data.draftRevision,draft});
}
