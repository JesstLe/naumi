import {z} from "zod";

export const mediaOutputNameSchema=z.string().min(1).max(160).regex(/^[a-zA-Z0-9_%.-]+(?:\/[a-zA-Z0-9_%.-]+)*$/)
  .refine(value=>value.split("/").every(part=>part!=="."&&part!==".."),"输出路径无效");
export const mediaActionSchema=z.enum(["frame","extract_audio","separate","trim","concat","ffmpeg","ffprobe"]);
export const mediaJobRequestSchema=z.object({
  operationId:z.string().uuid(),
  action:mediaActionSchema,
  inputs:z.array(z.string().min(1).max(300)).max(32),
  outputs:z.array(mediaOutputNameSchema).max(32).default([]),
  timestamp:z.union([z.number().finite().nonnegative(),z.literal("first"),z.literal("last")]).optional(),
  start:z.number().finite().nonnegative().optional(),end:z.number().finite().positive().optional(),
  args:z.array(z.string().max(16384).refine(value=>!value.includes("\0"))).max(512).optional(),
  source:z.enum(["canvas","agent","workbench","workflow"]).default("canvas"),
  projectKey:z.string().min(1).max(200).optional(),
  billingConfirmation:z.object({version:z.number().int().positive(),credits:z.number().int().nonnegative()}).strict().optional(),
}).strict().superRefine((request,ctx)=>{
  if(!["ffmpeg","ffprobe"].includes(request.action)&&!request.inputs.length)ctx.addIssue({code:"custom",path:["inputs"],message:"缺少媒体输入"});
  if(request.action==="trim"&&(request.start===undefined||request.end===undefined||request.start>=request.end))ctx.addIssue({code:"custom",path:["end"],message:"裁剪范围无效"});
  if(request.action==="concat"&&request.inputs.length<2)ctx.addIssue({code:"custom",path:["inputs"],message:"拼接至少需要两个输入"});
  if(new Set(request.outputs).size!==request.outputs.length)ctx.addIssue({code:"custom",path:["outputs"],message:"输出文件名重复"});
});
export type MediaJobRequest=z.infer<typeof mediaJobRequestSchema>;
export type MediaProbe={durationSeconds:number;width:number;height:number;videoCodec:string|null;audioCodecs:string[];formatName:string;frameRate:number|null};
export type MediaJobStatus="queued"|"processing"|"completed"|"failed"|"cancelled";
export type MediaJobOutput={artworkId:string;storageKey:string;url:string;mimeType:string;sha256:string;bytes:number;name:string;probe:MediaProbe|null};
