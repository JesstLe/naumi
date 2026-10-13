import { z } from "zod";
import type { VideoReference } from "./types";

export const videoReferenceSchema=z.strictObject({
  id:z.string().min(1).max(160),kind:z.enum(["image","video","audio"]),
  role:z.enum(["first_frame","last_frame","reference","element","source_video","source_audio"]),
  artworkId:z.string().min(1).max(160).optional(),storageKey:z.string().min(1).max(1000).optional(),
  url:z.string().min(1).max(16384).optional(),mimeType:z.string().max(100).optional(),
  bytes:z.number().int().min(1).max(250*1024*1024).optional(),durationSeconds:z.number().finite().min(0).max(86400).optional(),
  width:z.number().int().min(1).max(16384).optional(),height:z.number().int().min(1).max(16384).optional(),
}).superRefine((ref,ctx)=>{
  if(!ref.url&&!ref.storageKey&&!ref.artworkId)ctx.addIssue({code:"custom",message:"参考素材缺少身份或地址"});
  if(ref.url&&!/^(?:https?:\/\/|\/media\/|data:(?:image|video|audio)\/)/i.test(ref.url))ctx.addIssue({code:"custom",message:"参考素材地址无效"});
  if(["first_frame","last_frame"].includes(ref.role)&&ref.kind!=="image")ctx.addIssue({code:"custom",message:"首尾帧必须是图片"});
  if(ref.role==="source_video"&&ref.kind!=="video")ctx.addIssue({code:"custom",message:"视频引用类型不符"});
  if(ref.role==="source_audio"&&ref.kind!=="audio")ctx.addIssue({code:"custom",message:"音频引用类型不符"});
});
export const orderedInputSchema=z.strictObject({id:z.string().min(1).max(160),nodeId:z.string().min(1).max(160),
  kind:z.enum(["text","image","video","audio"]),role:z.enum(["context","author","first_frame","last_frame","reference","element","source_video","source_audio"]),
  value:z.string().min(1).max(65536)});
export type OrderedInput=z.infer<typeof orderedInputSchema>;
export type NumberedInput=OrderedInput&{index:number;kindIndex:number};
export function numberVideoInputs(raw:readonly OrderedInput[]){
  const inputs=z.array(orderedInputSchema).max(256).parse(raw);
  const seen=new Set<string>(),counts={text:0,image:0,video:0,audio:0};
  const byKind:{text:NumberedInput[];image:NumberedInput[];video:NumberedInput[];audio:NumberedInput[]}={text:[],image:[],video:[],audio:[]};
  const all=inputs.map((input,index)=>{
    if(seen.has(input.id))throw new Error("重复的引用身份");seen.add(input.id);
    const entry={...input,index:index+1,kindIndex:++counts[input.kind]};
    byKind[input.kind].push({...entry,index:entry.kindIndex});return entry;
  });return {all,byKind};
}
export function orderedMediaReferences(inputs:readonly OrderedInput[],refs:readonly VideoReference[]){
  const order=numberVideoInputs(inputs),byId=new Map(refs.map(ref=>[ref.id,ref]));
  const used=new Set<string>(),out:VideoReference[]=[];
  for(const input of order.all){if(input.kind==="text")continue;const ref=byId.get(input.id);if(!ref||ref.kind!==input.kind)throw new Error("引用节点和素材身份不一致");out.push({...ref});used.add(ref.id);}
  if(used.size!==refs.length)throw new Error("参考素材未包含在完整引用序列中");return out;
}
