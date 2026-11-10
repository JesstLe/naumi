import {z} from "zod";
import {videoProjectKeySchema} from "../canvas/project-key";

const identity=z.string().min(1).max(160);
export const productionSelectionSchema=z.strictObject({projectKey:videoProjectKeySchema,planId:z.uuid(),revision:z.number().int().positive(),nodes:z.array(z.strictObject({id:identity,reuseCompleted:z.boolean()})).min(1).max(100).refine(nodes=>new Set(nodes.map(node=>node.id)).size===nodes.length)});
export const roughcutRequestSchema=z.strictObject({projectKey:videoProjectKeySchema,planId:z.uuid(),revision:z.number().int().positive(),operationId:z.uuid(),mode:z.enum(["create","update"]),nodeIds:z.array(identity).min(1).max(100).refine(ids=>new Set(ids).size===ids.length),timelineId:z.string().min(1).max(80).optional(),timelineRevision:z.number().int().positive().optional()}).superRefine((value,ctx)=>{if(value.mode==="update"&&(!value.timelineId||!value.timelineRevision)||value.mode==="create"&&(value.timelineId||value.timelineRevision))ctx.addIssue({code:"custom",message:"粗剪目标与版本无效"});});
