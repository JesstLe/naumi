import 'server-only';
import {z} from 'zod';
import {videoDraftSchema,videoDiagnostic,type VideoResult,type CompiledVideoPlan} from './execution-contract';
import {prepareVideoExecution} from './prepare-execution';
import {getModelExecutionServices} from '../model-config/execution-services';
import {getModelExecutor} from '../model-config/execution';
import {assertCurrentCreationFeature} from '../saas/creation-access';

export const videoCompilePreviewSchema=z.strictObject({
  modelId:z.string().trim().min(1).max(100).optional(),projectKey:z.string().min(1).max(200).nullable().default(null),
  draft:videoDraftSchema,draftRevision:z.number().int().nonnegative(),
});
type Preview=Pick<CompiledVideoPlan,'intent'|'requestedParameters'|'effectiveParameters'|'billingFacts'> & {
  planDigest:string;modelVersion:number;modelDigest:string;publicModelId:string;draftRevision:number;
};

/** Read-only preview assembly. Selects the same published execution owner as
 * submission; no quotation, reservation, capacity claim, business idempotency
 * or provider create. Internal binding/recipe/storage/credentials stay server-side. */
export async function previewVideoExecution(actor:string,raw:unknown):Promise<VideoResult<Preview>> {
  const parsed=videoCompilePreviewSchema.safeParse(raw);
  if(!parsed.success)return {ok:false,diagnostics:[videoDiagnostic('input','INVALID_VIDEO_PREVIEW','draft','视频预览请求无效','检查草稿与修订编号')]};
  await assertCurrentCreationFeature('/api/video/generate');
  const services=getModelExecutionServices();
  const [snapshot,billing]=await Promise.all([services.models.current(),services.billing.current()]);
  const executor=await getModelExecutor();
  const frozen=await executor.resolve({feature:'video.generate',binding:'video.generate',requestedModelId:parsed.data.modelId,snapshot,billing});
  const scope=await executor.describe(frozen);
  const result=await prepareVideoExecution({actor,projectKey:parsed.data.projectKey,draft:parsed.data.draft,execution:frozen.video?.execution,
    identity:{publicModelId:frozen.publicModelId,connectionId:scope.connection.providerId,wireModel:scope.connection.wireModel}});
  if(!result.ok)return result;
  const plan=result.value;
  return {ok:true,value:{draftRevision:parsed.data.draftRevision,planDigest:plan.digest,modelVersion:frozen.modelVersion,modelDigest:frozen.modelDigest,publicModelId:frozen.publicModelId,
    intent:plan.intent,requestedParameters:plan.requestedParameters,effectiveParameters:plan.effectiveParameters,billingFacts:plan.billingFacts}};
}
