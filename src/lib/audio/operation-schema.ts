import {z} from "zod";
import {videoProjectKeySchema} from "../canvas/project-key";
import {timelineNodeIdSchema} from "../timeline/project";
import {SPEECH_FORMATS} from "./model-capabilities";

export const audioTargetSchema=z.strictObject({projectKey:videoProjectKeySchema,timelineId:timelineNodeIdSchema,revision:z.number().int().positive(),lineId:z.string().min(1).max(140),textSha256:z.string().regex(/^[a-f0-9]{64}$/)});
const common={operationId:z.uuid(),target:audioTargetSchema,modelId:z.string().min(1).max(100),billingVersion:z.number().int().positive().optional(),billingCredits:z.number().int().nonnegative().optional()};
export const speechOperationSchema=z.strictObject({...common,voice:z.string().min(1).max(100),format:z.enum(SPEECH_FORMATS),speed:z.number().finite().optional(),instructions:z.string().max(10000).optional()});
export const transcriptionOperationSchema=z.strictObject({...common,artworkId:z.string().min(1).max(160),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),format:z.enum(["json","verbose_json"]),timestamps:z.array(z.enum(["segment","word"])).max(2).refine(v=>new Set(v).size===v.length),language:z.string().max(30).optional(),prompt:z.string().max(10000).optional()});
export type AudioTarget=z.infer<typeof audioTargetSchema>;
export type SpeechOperation=z.infer<typeof speechOperationSchema>;
export type TranscriptionOperation=z.infer<typeof transcriptionOperationSchema>;
export type AudioOperation=SpeechOperation|TranscriptionOperation;
export const audioCheckpointSchema=z.strictObject({version:z.literal(1),operationId:z.uuid(),kind:z.enum(["speech","transcribe"]),target:audioTargetSchema,key:z.string().min(1).max(500),sha256:z.string().regex(/^[a-f0-9]{64}$/),mimeType:z.string().max(100),remoteReady:z.boolean(),bytes:z.number().int().positive().max(104857600)});
export type AudioCheckpoint=z.infer<typeof audioCheckpointSchema>;
const commonReceipt={version:z.literal(1),operationId:z.uuid(),target:audioTargetSchema,modelId:z.string().min(1).max(100),modelVersion:z.number().int().positive(),billingVersion:z.number().int().positive(),createdAt:z.iso.datetime()};
export const audioReceiptSchema=z.discriminatedUnion("kind",[
  z.strictObject({...commonReceipt,kind:z.literal("speech"),artworkId:z.string().min(1).max(160),key:z.string().max(500),sha256:z.string().regex(/^[a-f0-9]{64}$/),mimeType:z.string().max(100),durationSeconds:z.number().positive(),textSha256:z.string().regex(/^[a-f0-9]{64}$/),voice:z.string().max(100)}),
  z.strictObject({...commonReceipt,kind:z.literal("transcribe"),key:z.string().max(500),sha256:z.string().regex(/^[a-f0-9]{64}$/),sourceArtworkId:z.string().min(1).max(160),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),timing:z.enum(["supplier-timestamps","untimed"])}),
]);
export type AudioReceipt=z.infer<typeof audioReceiptSchema>;
