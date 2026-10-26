import {z} from "zod";
const sha=z.string().regex(/^[a-f0-9]{40}$/),imageDigest=z.string().regex(/^sha256:[a-f0-9]{64}$/);

const flavorSchema=z.object({reference:z.string().max(200),digest:imageDigest,tag:z.string().max(160),imageId:imageDigest,offline:z.object({name:z.string().max(180),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().min(1).max(2*1024**3-1)}).strict().optional()}).strict();

export const releaseManifestSchema=z.object({schemaVersion:z.literal(1),sourceCommit:sha,buildVersion:z.number().int().positive(),platform:z.literal('linux/amd64'),mediaVariants:z.literal(true),provenance:z.object({repository:z.literal('JesstLe/naumi'),workflowCommit:sha,runId:z.string().regex(/^[1-9][0-9]*$/),attempt:z.string().regex(/^[1-9][0-9]*$/)}).strict(),images:z.object({ui:flavorSchema,desktop:flavorSchema,enterprise:flavorSchema}).strict()}).strict().superRefine((manifest,context)=>{
  for(const [flavor,row] of Object.entries(manifest.images)){
    const tag='ghcr.io/jesstle/naumi:'+manifest.sourceCommit+(flavor==='ui'?'':'-'+flavor);
    if(row.reference!=='ghcr.io/jesstle/naumi@'+row.digest||row.tag!==tag||row.offline&&row.offline.name!==`naumi-${flavor}-${manifest.sourceCommit}.tar.gz`)context.addIssue({code:'custom',message:'镜像来源不匹配'});
  }
});

export const releaseRegistrationSchema=z.object({action:z.literal('release-register'),id:z.string().uuid(),sourceInstanceId:z.string().uuid(),manifest:releaseManifestSchema,evidenceSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();

export const releasePolicySchema=z.object({action:z.literal('release-policy'),instanceId:z.string().uuid(),sourceInstanceId:z.string().uuid(),enabled:z.boolean(),expectedVersion:z.number().int().min(0)}).strict();

export const releasePlanChangeSchema=z.object({action:z.literal('release-plan-review'),planId:z.string().uuid(),decision:z.enum(['hold','resume']),expectedVersion:z.number().int().min(0)}).strict();
