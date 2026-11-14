import {z} from 'zod';
import {jsonVideoRecipeSchema,createJsonVideoProfile} from './profiles/json-profile';
import {emptyVideoExecutionPolicy,videoExecutionPolicySchema,videoModelBindingSchema,type PublishedVideoModelBinding,type VideoExecutionPolicy,type VideoModelProfile} from './execution-contract';

/** Published mapping, not a second capability description. Other protocol
 * families will add their own discriminated recipe, never a model allowlist. */
export const publishedVideoExecutionSchema=z.strictObject({
  schemaVersion:z.literal(1),profileId:z.literal('json-video'),profileVersion:z.literal(1),
  recipe:jsonVideoRecipeSchema,policy:videoExecutionPolicySchema.optional(),
});
export type PublishedVideoExecution=z.infer<typeof publishedVideoExecutionSchema>;
export const frozenVideoExecutionSchema=publishedVideoExecutionSchema.extend({
  modelVersion:z.number().int().positive(),modelDigest:z.string().regex(/^[a-f0-9]{64}$/),
});
export type FrozenVideoExecution=z.infer<typeof frozenVideoExecutionSchema>;

export function videoExecutionProfile(frozen:FrozenVideoExecution):VideoModelProfile {
  return createJsonVideoProfile(frozen.profileId,frozen.profileVersion);
}
export function bindPublishedVideoExecution(frozen:FrozenVideoExecution,identity:{publicModelId:string;wireModel:string;connectionId:string}):{
  binding:PublishedVideoModelBinding;policy:VideoExecutionPolicy;profile:VideoModelProfile;
} {
  const value=frozenVideoExecutionSchema.parse(frozen);
  return {binding:videoModelBindingSchema.parse({...identity,revision:value.modelVersion,profileId:value.profileId,profileVersion:value.profileVersion,recipe:value.recipe}),
    policy:value.policy??emptyVideoExecutionPolicy(),profile:videoExecutionProfile(value)};
}
