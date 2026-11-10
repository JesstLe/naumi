import "server-only";
import {z} from "zod";
import {Type,type TSchema} from "typebox";
import type {AgentTool} from "@earendil-works/pi-agent-core";
import {audioReviewRequestSchema,audioReviewExtractSchema} from "../storyboard/audio-review";
import {reviewTargetSchema} from "../storyboard/assisted-review";
import type {CanvasAgentContext} from "./canvas-context";
type Deps={canvas?:CanvasAgentContext;internal:(path:string,signal?:AbortSignal,init?:RequestInit)=>Promise<any>};
export function createAudioReviewTools(d:Deps):AgentTool[]{
 const check=(key:string)=>{if(d.canvas?.video?.projectKey&&d.canvas.video.projectKey!==key)throw new Error("语音检查不属于当前项目");};
 const result=(value:any)=>({content:[{type:"text" as const,text:JSON.stringify(value)}],details:{...value,publicSummary:"语音审片证据；不是质量通过，未改稿或采用"}});
 const post=(url:string,body:any,signal?:AbortSignal)=>{check(body.projectKey||body.target.projectKey);return d.internal(url,signal,{method:"POST",headers:{"content-type":"application/json","x-naumi-project-context":body.projectKey||body.target.projectKey,...(url.endsWith('/review-audio')?{"x-naumi-billing-operation-id":body.operationId}:{})},body:JSON.stringify(body)});};
 const tool=(name:string,description:string,properties:Record<string,TSchema>,execute:AgentTool['execute']):AgentTool=>({name,label:name,description,parameters:Type.Object(properties),executionMode:"sequential",execute});
 return [tool("prepare_video_audio_review","从确切plan/revision/node/task/artwork原片提取声音证据，原持久媒体任务计费，稳定request.operationId。无音轨不提交。用get_video_media_task核对，未转写或判断质量。",{request:Type.Unsafe(z.toJSONSchema(audioReviewExtractSchema))},async(_id,args,signal)=>result(await post('/api/canvas/storyboards/review-audio-source',audioReviewExtractSchema.parse((args as any).request),signal))),
 tool("review_video_storyboard_audio","用户明确要求后，对已完成audioJobId与原候选进行一次实际ASR。request须保留完整原参数与operationId；modelId/format/timestamps由list_dialogue_audio_models读取。参考台词只读服务端确切原稿SHA；不作为ASR提示词。输出原音频SHA、真实时间、转写与文字差异、不确定性；一致不是发音/声线/口型或质量通过。无结果检查点UNKNOWN不换编号重试。",{request:Type.Unsafe(z.toJSONSchema(audioReviewRequestSchema))},async(_id,args,signal)=>{const input=audioReviewRequestSchema.parse((args as any).request);await post('/api/canvas/storyboards/review-audio',input,signal);return result(await d.internal(`/api/canvas/storyboards/review-audio?${new URLSearchParams({target:JSON.stringify({projectKey:input.projectKey,planId:input.planId,revision:input.revision,nodeId:input.nodeId,taskId:input.taskId,artworkId:input.artworkId}),operationId:input.operationId})}`,signal));}),
 tool("get_video_audio_review","只读确切原source和operation_id的语音审片回执，不调用模型。人工选择后才保存take.audioReviews引用或人工批注；不改台词、采用或返工。",{target:Type.Unsafe(z.toJSONSchema(reviewTargetSchema)),operation_id:Type.String({format:"uuid"})},async(_id,args,signal)=>{const a=args as any,target=reviewTargetSchema.parse(a.target);check(target.projectKey);return result(await d.internal(`/api/canvas/storyboards/review-audio?${new URLSearchParams({target:JSON.stringify(target),operationId:a.operation_id})}`,signal));}),
 tool("recover_video_audio_review","只消费原持久结果检查点并完成原账务，不调用模型、不刷新报价。没有完整结果时保持待核查，不新建收费操作。",{target:Type.Unsafe(z.toJSONSchema(reviewTargetSchema)),operation_id:Type.String({format:"uuid"})},async(_id,args,signal)=>{const a=args as any;return result(await post('/api/canvas/storyboards/review-audio/recover',{target:reviewTargetSchema.parse(a.target),operationId:a.operation_id},signal));})];
}
