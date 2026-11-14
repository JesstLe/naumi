import {z} from 'zod';

// New execution contracts deliberately do not import legacy capability/schema
// resolvers. Descriptions and test evidence are not execution permissions.
const id=z.string().trim().min(1).max(200);
const revision=z.number().int().nonnegative();
export const videoIntentSchema=z.enum(['text','single_image','frames_required','first_optional','last_optional','reference','video_edit','extend','motion_control','lip_sync']);
export type VideoExecutionIntent=z.infer<typeof videoIntentSchema>;
export const videoPreferenceSchema=z.enum([...videoIntentSchema.options,'image_reference','omni_reference']);
export const videoMediaKindSchema=z.enum(['image','video','audio']);
export const videoInputRoleSchema=z.enum(['context','author','reference','element','first_frame','last_frame','source_video','source_audio']);
export const videoDiagnosticSchema=z.strictObject({
  category:z.enum(['input','mapping','constraint','policy','dependency','internal']),
  code:id,field:id,reason:z.string().min(1),actionable:z.string().min(1),
  inputId:id.optional(),
});
export type VideoDiagnostic=z.infer<typeof videoDiagnosticSchema>;
export type VideoResult<T>={ok:true;value:T}|{ok:false;diagnostics:VideoDiagnostic[]};
export function videoDiagnostic(category:VideoDiagnostic['category'],code:string,field:string,reason:string,actionable:string,inputId?:string):VideoDiagnostic {
  return {category,code,field,reason,actionable,...(inputId?{inputId}:{})};
}

export const videoModelBindingSchema=z.strictObject({
  publicModelId:id,wireModel:id,connectionId:id,revision:revision,
  profileId:id,profileVersion:z.number().int().positive(),
  // Recipe belongs to the published binding; profiles decode their own shape.
  // No credential, latest catalogue or legacy capabilities enter the compiler.
  recipe:z.json(),
});
export type PublishedVideoModelBinding=z.infer<typeof videoModelBindingSchema>;
const restrictions=z.strictObject({
  disabled:z.boolean().optional(),
  deniedIntents:z.array(videoIntentSchema).optional(),
  mediaMaximum:z.strictObject({image:z.number().int().nonnegative().optional(),video:z.number().int().nonnegative().optional(),audio:z.number().int().nonnegative().optional()}).optional(),
});
export const videoExecutionPolicySchema=z.strictObject({
  kind:z.literal('video.execution-policy'),revision,
  restrictions,
  audit:z.strictObject({actor:id,reason:z.string().trim().min(1).max(1000),changedAt:z.iso.datetime()}).optional(),
}).superRefine((policy,ctx)=>{
  const hasRestrictions=Object.values(policy.restrictions).some(v=>v!==undefined);
  if(hasRestrictions&&(policy.revision===0||!policy.audit))ctx.addIssue({code:'custom',message:'显式视频政策必须有修订和操作来源'});
});
export type VideoExecutionPolicy=z.infer<typeof videoExecutionPolicySchema>;
export function emptyVideoExecutionPolicy():VideoExecutionPolicy {
  return {kind:'video.execution-policy',revision:0,restrictions:{}};
}

/** Independent, scoped observations, never a required promotion ladder. */
export const videoCapabilityEvidenceSchema=z.strictObject({
  kind:z.enum(['documented','wire-mapped','smoke-tested','production-confirmed']),
  connectionId:id,wireModel:id,profileId:id,profileVersion:z.number().int().positive(),
  bindingRevision:revision,inputSignature:z.string().min(1).max(2000),observedAt:z.iso.datetime(),
  receiptId:id.optional(),sourceUrl:z.url().optional(),
});
export type VideoCapabilityEvidence=z.infer<typeof videoCapabilityEvidenceSchema>;

export const videoDraftSchema=z.strictObject({
  prompt:z.string().max(65536),
  parameters:z.record(z.string().min(1).max(100),z.json()),
  intentPreference:videoPreferenceSchema.optional(),
  // Compatibility read only. A missing explicit preference + legacy text/media
  // is automatic; structured legacy modes preserve their original semantics.
  legacyMode:videoIntentSchema.optional(),
  inputs:z.array(z.strictObject({id,nodeId:id,kind:z.enum(['text','image','video','audio']),role:videoInputRoleSchema,value:z.string().max(65536).optional(),storageKey:z.string().min(1).max(1000).optional()})).max(256),
});
export type VideoExecutionDraft=z.infer<typeof videoDraftSchema>;
// Standalone Workbench drafts may not yet belong to a canvas project. The
// authenticated application supplies an opaque workspace identity when scoped.
export const videoExecutionScopeSchema=z.strictObject({actorId:id,projectKey:id.nullable(),workspaceId:id.optional()});
export const resolvedVideoAssetSchema=z.strictObject({
  artworkId:id.optional(),storageKey:z.string().min(1).max(1000),
  sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().positive(),
  mimeType:z.string().regex(/^(image|video|audio)\/[a-zA-Z0-9.+-]+$/),
  width:z.number().int().positive().optional(),height:z.number().int().positive().optional(),
  durationSeconds:z.number().finite().positive().optional(),
});
export type ResolvedVideoAsset=z.infer<typeof resolvedVideoAssetSchema>;
export const resolvedVideoInputSchema=z.discriminatedUnion('kind',[
  z.strictObject({id,nodeId:id,kind:z.literal('text'),role:z.enum(['context','author']),text:z.string().max(65536)}),
  z.strictObject({id,nodeId:id,kind:videoMediaKindSchema,role:z.enum(['reference','element','first_frame','last_frame','source_video','source_audio']),asset:resolvedVideoAssetSchema}),
]);
export const resolvedVideoDraftSchema=videoDraftSchema.omit({inputs:true}).extend({
  scope:videoExecutionScopeSchema,
  inputs:z.array(resolvedVideoInputSchema).max(256),
}).superRefine((draft,ctx)=>{
  const ids=new Set<string>();
  const versions=new Map<string,string>();
  for(const input of draft.inputs){
    if(ids.has(input.id))ctx.addIssue({code:'custom',message:'引用身份重复',path:['inputs']});ids.add(input.id);
    if(input.kind==='text')continue;
    const version=`${input.asset.sha256}:${input.asset.bytes}`;
    if(versions.has(input.asset.storageKey)&&versions.get(input.asset.storageKey)!==version)
      ctx.addIssue({code:'custom',message:'同一素材存在冲突版本',path:['inputs']});
    versions.set(input.asset.storageKey,version);
    if(!input.asset.mimeType.startsWith(input.kind+'/')||input.kind!=='image'&&!input.asset.durationSeconds
      ||['first_frame','last_frame'].includes(input.role)&&input.kind!=='image'
      ||input.role==='source_video'&&input.kind!=='video'||input.role==='source_audio'&&input.kind!=='audio')
      ctx.addIssue({code:'custom',message:'真实素材类型、角色或时长不一致',path:['inputs']});
  }
});
export type ResolvedVideoDraft=z.infer<typeof resolvedVideoDraftSchema>;
export type ResolvedVideoInput=ResolvedVideoDraft['inputs'][number];

export const videoWireTemplateSchema=z.strictObject({
  method:z.literal('POST'),path:z.string().regex(/^\/(?!\/)[^?#\s]*$/).max(1000),
  encoding:z.enum(['json','multipart','workflow']),body:z.json(),
});
export type VideoWireTemplate=z.infer<typeof videoWireTemplateSchema>;
export const videoProfileOutputSchema=z.strictObject({
  intent:videoIntentSchema,effectiveParameters:z.record(z.string(),z.json()),
  wireTemplate:videoWireTemplateSchema,consumedInputIds:z.array(id),
  billingFacts:z.strictObject({durationSeconds:z.number().finite().refine(n=>n===-1||n>0),resolution:id,aspectRatio:id.optional()}),
});
export type VideoProfileOutput=z.infer<typeof videoProfileOutputSchema>;
export type VideoInputContract={profileId:string;profileVersion:number;bindingRevision:number;description:unknown};
export interface VideoModelProfile {
  readonly profileId:string;
  readonly version:number;
  describe(binding:PublishedVideoModelBinding):VideoResult<VideoInputContract>;
  compile(draft:ResolvedVideoDraft,contract:VideoInputContract,binding:PublishedVideoModelBinding):VideoResult<VideoProfileOutput>;
}
export type CompiledVideoPlan={
  schemaVersion:1;
  identity:Pick<PublishedVideoModelBinding,'publicModelId'|'wireModel'|'connectionId'|'profileId'|'profileVersion'>&{bindingRevision:number;policyRevision:number};
  binding:PublishedVideoModelBinding;
  policy:VideoExecutionPolicy;
  scope:ResolvedVideoDraft['scope'];
  intent:VideoExecutionIntent;
  originalPrompt:string;
  requestedParameters:ResolvedVideoDraft['parameters'];
  effectiveParameters:VideoProfileOutput['effectiveParameters'];
  inputManifest:ResolvedVideoInput[];
  wireTemplate:VideoWireTemplate;
  billingFacts:VideoProfileOutput['billingFacts'];
  digest:string;
};
export const compiledVideoPlanSchema=z.strictObject({
  schemaVersion:z.literal(1),
  identity:videoModelBindingSchema.omit({recipe:true,revision:true}).extend({bindingRevision:revision,policyRevision:revision}),
  binding:videoModelBindingSchema,policy:videoExecutionPolicySchema,
  scope:videoExecutionScopeSchema,intent:videoIntentSchema,originalPrompt:z.string().max(65536),
  requestedParameters:z.record(z.string(),z.json()),effectiveParameters:z.record(z.string(),z.json()),
  inputManifest:z.array(resolvedVideoInputSchema).max(256),wireTemplate:videoWireTemplateSchema,
  billingFacts:videoProfileOutputSchema.shape.billingFacts,digest:z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((plan,ctx)=>{
  for(const key of ['publicModelId','wireModel','connectionId','profileId','profileVersion'] as const)
    if(plan.identity[key]!==plan.binding[key])ctx.addIssue({code:'custom',message:'计划身份与冻结绑定不一致',path:['identity',key]});
  if(plan.identity.bindingRevision!==plan.binding.revision||plan.identity.policyRevision!==plan.policy.revision)
    ctx.addIssue({code:'custom',message:'计划修订与冻结绑定或政策不一致',path:['identity']});
  const draft=resolvedVideoDraftSchema.safeParse({scope:plan.scope,prompt:plan.originalPrompt,parameters:plan.requestedParameters,inputs:plan.inputManifest});
  if(!draft.success)ctx.addIssue({code:'custom',message:'冻结计划包含无效的输入事实',path:['inputManifest']});
});
