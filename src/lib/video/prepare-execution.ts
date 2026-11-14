import 'server-only';
import {prepareVideoExecutionInputs} from './prepare-inputs';
import {bindPublishedVideoExecution,frozenVideoExecutionSchema} from './published-execution';
import {compileVideoRequest} from './compile';
import {videoDiagnostic,videoModelBindingSchema,type CompiledVideoPlan,type VideoResult} from './execution-contract';

/** Shared application use case for preview/acceptance. Its frozen binding is
 * resolved by the model-config owner, not accepted from an HTTP draft. No task,
 * billing, idempotency claim, signing or supplier operation is performed here. */
export async function prepareVideoExecution(input:{actor:string;projectKey:string|null;draft:unknown;
  execution:unknown;identity:{publicModelId:string;wireModel:string;connectionId:string}}):Promise<VideoResult<CompiledVideoPlan>> {
  const frozen=frozenVideoExecutionSchema.safeParse(input.execution);
  if(!frozen.success)return {ok:false,diagnostics:[videoDiagnostic('mapping','VIDEO_EXECUTION_NOT_CONFIGURED','binding','此通道尚未配置新版执行映射','配置对应的协议请求映射')]};
  if(!videoModelBindingSchema.safeParse({...input.identity,revision:frozen.data.modelVersion,profileId:frozen.data.profileId,profileVersion:frozen.data.profileVersion,recipe:frozen.data.recipe}).success)
    return {ok:false,diagnostics:[videoDiagnostic('mapping','INVALID_VIDEO_BINDING','binding','视频通道身份无效','重新读取已发布通道')]};
  const prepared=await prepareVideoExecutionInputs(input.actor,input.projectKey,input.draft);if(!prepared.ok)return prepared;
  const {binding,policy,profile}=bindPublishedVideoExecution(frozen.data,input.identity);
  return compileVideoRequest({binding,policy,profile,draft:prepared.value});
}
