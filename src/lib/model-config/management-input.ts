import "server-only";
import { imageMappingEditorSchema } from "./image-mapping-editor";
import { resolutionParametersSchema } from "./resolution-policy";
import { imagegenRoutePolicySchema } from "./imagegen-policy";
import { videoDefinitionSchema, videoWireProfileSchema } from "../video/capability-schema";
import { videoParametersSchema } from "./video-policy";
import { channelPolicySchema } from "./channel-policy";
import { MODEL_MANAGEMENT_PROTOCOLS } from "./management";
import { DISPLAY_QUALITY_IDS, qualityPolicySchema } from "./quality-policy";
import { FEATURE_IDS, QUALITY_IDS, RESOLUTION_IDS } from "../billing/rules/registry";
import { z } from "zod";
import {onboardingFields} from './onboarding-schema';
import type { getModelAdministration } from "./server";
/** Wire contract of POST /api/admin/model-management (and the legacy /api/admin/mvp alias).
 * Operation ids, actions and field names are a persisted compatibility protocol. */
export const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
const common = { id: z.uuid(), expectedVersion: z.number().int().positive() };
const credits=z.number().int().min(0).max(2147483647);
const creditPricing=z.discriminatedUnion("mode",[z.strictObject({mode:z.literal("matrix"),prices:z.record(z.enum(QUALITY_IDS),z.record(z.enum(RESOLUTION_IDS),credits.nullable()))}),z.strictObject({mode:z.literal("fixed"),credits}),z.strictObject({mode:z.literal("quality-resolution"),quality:z.record(z.enum(QUALITY_IDS),credits),resolutionExtra:z.record(z.enum(RESOLUTION_IDS),credits)})]);
export const managementInput = z.discriminatedUnion("action", [
  z.strictObject({action:z.literal('create-models'),...common,...onboardingFields}),
  z.strictObject({action:z.literal("video-capability-upgrade"),...common,reviewDigest:z.string().regex(/^[a-f0-9]{64}$/),publicIds:z.array(identifier).min(1).max(100)}),
  z.strictObject({action:z.literal('video-execution-migration'),...common,reviewDigest:z.string().regex(/^[a-f0-9]{64}$/),publicIds:z.array(identifier).min(1).max(100)}),
  z.strictObject({action:z.literal("video-parameters"),...common,rowId:identifier,routes:videoParametersSchema}),
  z.strictObject({action:z.literal("imagegen-parameters"),...common,rowId:identifier,routes:z.array(imagegenRoutePolicySchema).max(100).nullable()}),
  z.strictObject({action:z.literal("channels"),...common,rowId:identifier,policy:channelPolicySchema.nullable()}),
  z.strictObject({action:z.literal("image-mapping"),...common,rowId:identifier,mapping:imageMappingEditorSchema}),
  z.strictObject({action:z.literal("resolutions"),...common,rowId:identifier,resolutions:z.array(z.enum(["1K","2K","4K"])).min(1).max(3).nullable(),parameters:resolutionParametersSchema.nullable().optional()}),
  z.strictObject({ action: z.literal("discover"), providerId: identifier, force: z.boolean().optional() }),
  z.strictObject({ action: z.literal("credential"), providerId: identifier, ciphertext: z.string().min(1).max(32768).optional(), keyPlain: z.string().min(1).max(16384).optional() }),
  z.strictObject({ action: z.literal("switch"), ...common, rowId: identifier, upstreamId: identifier }),
  z.strictObject({ action: z.literal("identity"), ...common, rowId: identifier, publicId: identifier, label: z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/) }),
  z.strictObject({ action: z.literal("rename"), ...common, rowId: identifier, label: z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/) }),
  z.strictObject({action:z.literal("scope-compat"),...common}),
  z.strictObject({action:z.literal("order"),...common,rowIds:z.array(identifier).min(1).max(500)}),
  z.strictObject({action:z.literal("scope"),...common,rowId:identifier,features:z.array(z.enum(FEATURE_IDS)).max(FEATURE_IDS.length),canvas:z.boolean().optional()}),
  z.strictObject({action:z.literal("parameters"),...common,rowId:identifier,parameters:z.strictObject({choices:z.array(z.strictObject({id:z.enum(DISPLAY_QUALITY_IDS),label:z.string().trim().min(1).max(30)})).min(1).max(5),routes:z.array(z.strictObject({upstreamId:identifier,mode:z.enum(["map","passthrough","omit"]),values:z.record(z.string(),z.string().max(100)),metadataRef:z.strictObject({id:z.uuid(),revision:z.number().int().positive()}).nullable().optional(),evidence:z.strictObject({status:z.enum(["unverified","documented","accepted","rejected"]),source:z.string().max(1000),checkedAt:z.string().max(30)}).optional()})).min(1).max(100)}).nullable()}),
  z.strictObject({action:z.literal("pricing"),...common,expectedBillingVersion:z.number().int().positive(),rowId:identifier,features:z.array(z.enum(FEATURE_IDS)).min(1).max(FEATURE_IDS.length),pricing:creditPricing.nullable()}),
  z.strictObject({ action: z.literal("connect"), ...common, name: z.string().trim().min(1).max(100), baseUrl: z.string().max(1024), protocol: z.enum(MODEL_MANAGEMENT_PROTOCOLS), credentialRef: z.uuid() }),
  z.strictObject({ action: z.literal("register"), ...common, providerId: identifier, model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/), confirmed: z.literal(true), capabilityVerified:z.boolean().optional(), qualityPolicy:qualityPolicySchema.optional(), edit: z.boolean(), vision: z.boolean(), qualityRank: z.number().int().min(1).max(5).default(2), qualities: z.array(z.enum(["low", "medium", "high", "xhigh", "max", "auto"])).max(6), resolutions: z.array(z.enum(["1K", "2K", "4K"])).max(3), maxReferenceImages: z.number().int().min(0).max(128),videoDefinition:videoDefinitionSchema.optional(),videoProfile:videoWireProfileSchema.optional() }),
]);
export type ManagementInput = z.infer<typeof managementInput>;
export type ManagementAdministration = Awaited<ReturnType<typeof getModelAdministration>>;
