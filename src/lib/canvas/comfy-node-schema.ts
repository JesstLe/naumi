import {z} from "zod";
import {validateComfyDocument,type ComfyDocument} from "../comfyui/document";
import {videoProjectKeySchema} from "./project-key";
export const comfyDocumentSchema=z.unknown().transform((value,ctx)=>{try{return validateComfyDocument(value);}catch(error){ctx.addIssue({code:"custom",message:error instanceof Error?error.message:"工作流格式无效"});return z.NEVER;}});
const coordinate=z.number().finite().min(-1e7).max(1e7);
export const comfyNodeWriteSchema=z.strictObject({id:z.string().min(1).max(200),projectKey:videoProjectKeySchema.optional(),expectedRevision:z.number().int().nonnegative(),operationId:z.uuid(),title:z.string().trim().max(200).optional(),x:coordinate.optional(),y:coordinate.optional(),width:z.number().min(64).max(1e7).optional(),height:z.number().min(64).max(1e7).optional(),workflow:comfyDocumentSchema.optional(),deleted:z.boolean().optional()});
export type ComfyNodeWrite=z.infer<typeof comfyNodeWriteSchema>;
export type CanvasComfyNode={id:string;projectKey:string;revision:number;title:string;x:number;y:number;width:number;height:number;workflow:ComfyDocument;deletedAt:string|null;createdAt:string;updatedAt:string};

export type ComfyNodeActions={field:(id:string,nodeId:string,key:string,value:unknown)=>Promise<unknown>;move:(id:string,nodeId:string,x:number,y:number)=>Promise<unknown>;collapse:(id:string)=>Promise<unknown>;run:(id:string)=>void};
