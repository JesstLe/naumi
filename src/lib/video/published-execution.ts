import {nativeVideoRecipeSchema,createNativeVideoProfile} from './profiles/native-profile';
import {z} from 'zod';
import {jsonVideoRecipeSchema,createJsonVideoProfile} from './profiles/json-profile';
import {workflowVideoRecipeSchema,createWorkflowVideoProfile} from './profiles/workflow-profile';
import {emptyVideoExecutionPolicy,videoExecutionPolicySchema,videoModelBindingSchema,type PublishedVideoModelBinding,type VideoExecutionPolicy,type VideoModelProfile} from './execution-contract';
const common={schemaVersion:z.literal(1),profileVersion:z.literal(1),policy:videoExecutionPolicySchema.optional()};
const jsonExecution=z.strictObject({...common,profileId:z.literal('json-video'),recipe:jsonVideoRecipeSchema});
const nativeExecution=z.strictObject({...common,profileId:z.literal('native-video'),recipe:nativeVideoRecipeSchema});
const workflowExecution=z.strictObject({...common,profileId:z.literal('workflow-video'),recipe:workflowVideoRecipeSchema});
/** A discriminated executable recipe, not another model-name registry. */
export const publishedVideoExecutionSchema=z.discriminatedUnion('profileId',[jsonExecution,workflowExecution,nativeExecution]);
export type PublishedVideoExecution=z.infer<typeof publishedVideoExecutionSchema>;
const revision={modelVersion:z.number().int().positive(),modelDigest:z.string().regex(/^[a-f0-9]{64}$/)};
export const frozenVideoExecutionSchema=z.discriminatedUnion('profileId',[jsonExecution.extend(revision),workflowExecution.extend(revision),nativeExecution.extend(revision)]);
export type FrozenVideoExecution=z.infer<typeof frozenVideoExecutionSchema>;
export function videoExecutionProfile(frozen:Pick<FrozenVideoExecution,'profileId'|'profileVersion'>):VideoModelProfile{
 return frozen.profileId==='native-video'?createNativeVideoProfile():frozen.profileId==='workflow-video'?createWorkflowVideoProfile():createJsonVideoProfile(frozen.profileId,frozen.profileVersion);
}
export function bindPublishedVideoExecution(frozen:FrozenVideoExecution,identity:{publicModelId:string;wireModel:string;connectionId:string}):{binding:PublishedVideoModelBinding;policy:VideoExecutionPolicy;profile:VideoModelProfile}{
 const value=frozenVideoExecutionSchema.parse(frozen);
 return {binding:videoModelBindingSchema.parse({...identity,revision:value.modelVersion,profileId:value.profileId,profileVersion:value.profileVersion,recipe:value.recipe}),policy:value.policy??emptyVideoExecutionPolicy(),profile:videoExecutionProfile(value)};
}
