import "server-only";
import {z} from "zod";
import {Type,type TSchema} from "typebox";
import type {AgentTool} from "@earendil-works/pi-agent-core";
import {speechOperationSchema,transcriptionOperationSchema} from "../audio/operation-schema";
import {audioAdoptionSchema} from "../audio/dialogue-adoption";
import type {CanvasAgentContext} from "./canvas-context";
type Deps={canvas?:CanvasAgentContext;internal:(path:string,signal?:AbortSignal,init?:RequestInit)=>Promise<any>};
export function createAudioTools(d:Deps):AgentTool[]{
  const check=(key:string)=>{if(d.canvas?.video?.projectKey&&d.canvas.video.projectKey!==key)throw new Error("声音操作不属于当前画布项目");return key;};
  const output=(value:any)=>({content:[{type:"text" as const,text:JSON.stringify(value)}],details:{...value,publicSummary:value.node?"声音或字幕已明确采用":value.audioReceipt?"声音结果已保存，尚未采用":"原声音回执已读取"}});
  const post=(path:string,body:any,signal?:AbortSignal)=>d.internal(path,signal,{method:"POST",headers:{"content-type":"application/json","x-naumi-project-context":check(body.target?.projectKey||body.projectKey),...(body.target?{"x-naumi-billing-operation-id":body.operationId}:{})},body:JSON.stringify(body)});
  const tool=(name:string,description:string,properties:Record<string,TSchema>,execute:AgentTool["execute"]):AgentTool=>({name,label:name,description,parameters:Type.Object(properties),executionMode:"sequential",execute});
  return [
    tool("list_dialogue_audio_models","读取当前已发布且有明确售价的配音／转写通道、公开ID、音色、格式及真实时间戳能力。无通道时保留导入录音，不猜测模型或音色。",{},async(_call,_args,signal)=>output(await d.internal("/api/canvas/audio-operations/catalog",signal))),
    tool("generate_dialogue_speech","对已保存timeline确切revision/lineId/textSha256生成一次真实配音，音色和格式只能取管理员已发布audio.speech能力。先按用户授权预算；request.operationId固定。修改台词先save_video_timeline；结果不自动采用。不支持音色样本克隆。UNKNOWN不重新生成，用get/recover_dialogue_audio_operation沿原操作查询或恢复。",{request:Type.Unsafe(z.toJSONSchema(speechOperationSchema))},async(_call,args,signal)=>{const request=speechOperationSchema.parse((args as any).request);return output(await post("/api/canvas/audio-operations/speech",request,signal));}),
    tool("transcribe_dialogue_audio","转写拥有且已完整解码的确切artworkId/sourceSha256音频，绑定已保存的对白target，不把目录或原声冒充转写。request.operationId固定；真实时间戳必须通道显式支持，结果只是字幕候选，不自动覆盖台词／原稿／声音。",{request:Type.Unsafe(z.toJSONSchema(transcriptionOperationSchema))},async(_call,args,signal)=>{const request=transcriptionOperationSchema.parse((args as any).request);return output(await post("/api/canvas/audio-operations/transcribe",request,signal));}),
    tool("get_dialogue_audio_operation","读取同项目原声音操作的账务状态、配音私有结果或转写文本/供应商时间戳。只读不收费、不执行模型；没有检查点的UNKNOWN保持待核对。",{project_key:Type.String({minLength:1,maxLength:166}),operation_id:Type.String({format:"uuid"})},async(_call,args,signal)=>{const a=args as any;return output(await d.internal(`/api/canvas/audio-operations?projectKey=${encodeURIComponent(check(a.project_key))}&operationId=${encodeURIComponent(a.operation_id)}`,signal));}),
    tool("recover_dialogue_audio_operation","只恢复原操作已持久保存的音频/转写字节，完整解码并完成原账务，不重新调用供应商或另建收费任务。原操作没有检查点时保持UNKNOWN，不能据此创建新操作。",{project_key:Type.String({minLength:1,maxLength:166}),operation_id:Type.String({format:"uuid"})},async(_call,args,signal)=>{const a=args as any;return output(await post("/api/canvas/audio-operations/recover",{projectKey:a.project_key,operationId:a.operation_id},signal));}),
    tool("adopt_dialogue_audio_operation","明确采用已结算的配音或转写候选。采用request.operationId与audioOperationId分开；keep保留时序，fit-audio只改该句至实际配音时长，source-segment须匹配当前绑定音频真实分句。原稿/台词与其他剪辑保留；本动作不生成、不另收费。",{request:Type.Unsafe(z.toJSONSchema(audioAdoptionSchema))},async(_call,args,signal)=>{const request=audioAdoptionSchema.parse((args as any).request);return output(await post("/api/canvas/audio-operations/adopt",request,signal));}),
  ];
}
