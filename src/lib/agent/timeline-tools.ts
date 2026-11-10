import "server-only";
import {z} from "zod";
import {Type,type TSchema} from "typebox";
import type {AgentTool} from "@earendil-works/pi-agent-core";
import {timelineProjectSchema,timelineNodeIdSchema} from "../timeline/project";
import {videoProjectKeySchema} from "../canvas/project-key";
import type {CanvasAgentContext} from "./canvas-context";

type Deps={canvas?:CanvasAgentContext;confirmation?:()=>{version:number;credits:number}|undefined;internal:(path:string,signal?:AbortSignal,init?:RequestInit)=>Promise<any>};
const uuid=Type.String({format:"uuid"}),id=Type.String({pattern:"^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$"}),revision=Type.Integer({minimum:1});
const context={project_key:Type.Optional(Type.String({minLength:1,maxLength:166}))};
const result=(value:any)=>({content:[{type:"text" as const,text:JSON.stringify(value)}],details:{...value,publicSummary:value.job?"工程导出已受理":"多轨工程已读取或保存",...(value.job?{jobId:value.job.id}:{}),...(value.node?{nodeId:value.node.id,projectKey:value.node.projectKey}:{})}});
export function createTimelineTools(d:Deps):AgentTool[]{
 const project=(raw:unknown)=>{const current=d.canvas?.video?.projectKey;if(current&&raw&&current!==raw)throw new Error("请选择当前项目的多轨工程");return videoProjectKeySchema.parse(current||raw);};
 const get=async(raw:unknown,key:string,signal?:AbortSignal)=>{const value=await d.internal(`/api/canvas/timeline-nodes/${encodeURIComponent(timelineNodeIdSchema.parse(raw))}`,signal);if(value.node?.projectKey!==key)throw new Error("多轨工程不属于此项目");return value;};
 const post=async(path:string,body:any,signal?:AbortSignal)=>{try{return await d.internal(path,signal,{method:"POST",headers:{"content-type":"application/json",...(d.canvas?{"x-naumi-canvas":"1"}:{})},body:JSON.stringify(body)});}catch(error){throw new Error(`${error instanceof Error?error.message:"操作结果尚未核实"}；保留operation_id=${body.operationId}及原完整参数重试，不另建操作`);}};
 const tool=(name:string,description:string,properties:Record<string,TSchema>,execute:AgentTool["execute"]):AgentTool=>({name,label:name,description,parameters:Type.Object(properties),executionMode:"sequential",execute});
 return [
  tool("get_video_timeline","读取指定项目的确切多轨工程和revision，包括真实音轨、dialogue逐句原文/台词/字幕/声音片段绑定、冻结导出和采用结果。读取后完整保留未修改字段。",{...context,timeline_id:id},async(_call,args,signal)=>{const a=args as any;return result(await get(a.timeline_id,project(a.project_key),signal));}),
  tool("save_video_timeline","保存正式可编辑工程。timeline为完整JSON，保留其他画面、音轨和字幕。dialogue.lines的source.text是经服务端核实的原稿快照，不随text/字幕改动；text是朗读台词，subtitleText单独编辑。audioClipId引用确切真实声音片段，一句跨多个画面只保存一次。修改台词后旧audioText不同即声音待重录/核对，不自动重做视频或配音。不渲染不收费；operation_id和完整请求稳定。",{...context,timeline_id:id,expected_revision:Type.Integer({minimum:0}),operation_id:uuid,title:Type.Optional(Type.String({maxLength:200})),timeline:Type.Unsafe(z.toJSONSchema(timelineProjectSchema,{unrepresentable:"any"}))},async(_call,args,signal)=>{const a=args as any,key=project(a.project_key);if(a.expected_revision>0)await get(a.timeline_id,key,signal);return result(await post("/api/canvas/timeline-nodes",{id:a.timeline_id,projectKey:key,expectedRevision:a.expected_revision,operationId:a.operation_id,...(a.title!==undefined?{title:a.title}:{}),timeline:timelineProjectSchema.parse(a.timeline)},signal));}),
  tool("render_video_timeline","按明确工程revision冻结并导出MP4和SRT，dialogue.burnIn控制烧录。复用原媒体job/报价/预算/结算；不生成视频、配音或转写。operation_id稳定，未知/401后原完整参数恢复；用get_video_media_task查询jobId，导出不会自动替换采用版。",{...context,timeline_id:id,expected_revision:revision,operation_id:uuid},async(_call,args,signal)=>{const a=args as any;await get(a.timeline_id,project(a.project_key),signal);return result(await post(`/api/canvas/timeline-nodes/${encodeURIComponent(a.timeline_id)}/render`,{operationId:a.operation_id,expectedRevision:a.expected_revision,...(d.confirmation?.()?{billingConfirmation:d.confirmation!()}:{})},signal));}),
  tool("adopt_video_timeline","明确采用此工程真实已完成job的成片。历史导出保留其冻结工程；过期输出不会把新版工程覆盖成旧版，修改未完成时不得冒称当前结果。",{...context,timeline_id:id,expected_revision:revision,operation_id:uuid,job_id:uuid},async(_call,args,signal)=>{const a=args as any;await get(a.timeline_id,project(a.project_key),signal);return result(await post(`/api/canvas/timeline-nodes/${encodeURIComponent(a.timeline_id)}/adopt`,{operationId:a.operation_id,expectedRevision:a.expected_revision,jobId:a.job_id},signal));}),
 ];
}
