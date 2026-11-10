import "server-only";
import {z} from "zod";
import {Type,type TSchema} from "typebox";
import type {AgentTool} from "@earendil-works/pi-agent-core";
import {storyboardDocumentSchema,storyboardWriteSchema} from "../storyboard/plan";
import {productionSelectionSchema,roughcutRequestSchema} from "../storyboard/production-schema";
import {videoProjectKeySchema} from "../canvas/project-key";
import {storyboardForkSchema} from "../storyboard/fork";
import type {CanvasAgentContext} from "./canvas-context";

type Deps={canvas?:CanvasAgentContext;internal:(path:string,signal?:AbortSignal,init?:RequestInit)=>Promise<any>};
const uuid=Type.String({pattern:"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"});
const id=Type.String({minLength:1,maxLength:160}),revision=Type.Integer({minimum:1});
const context={project_key:Type.Optional(Type.String({minLength:1,maxLength:166}))};
const selection={...context,plan_id:uuid,revision};
const document=Type.Unsafe(z.toJSONSchema(storyboardDocumentSchema,{unrepresentable:"any"}));
const result=(publicSummary:string,value:Record<string,unknown>)=>{
  const publicNode=(node:any)=>{if(!node.config?.workflowManifest?.template)return node;const {template:_template,...manifest}=node.config.workflowManifest;return {...node,config:{...node.config,workflowManifest:manifest},workflowTemplateStored:true};};
  const view={...value,...(Array.isArray(value.nodes)?{nodes:value.nodes.map(publicNode)}:{})};return {content:[{type:"text" as const,text:JSON.stringify(view)}],details:{...view,publicSummary}};
};

/** Thin adapters: the same HTTP routes own scope, CAS, take provenance and receipts as the webpage. */
export function createStoryboardTools(d:Deps):AgentTool[]{
  function project(raw:unknown){const current=d.canvas?.video?.projectKey;if(current&&raw&&raw!==current)throw new Error("请选择当前项目的分镜方案");return videoProjectKeySchema.parse(current||raw);}
  function tool(name:string,label:string,description:string,properties:Record<string,TSchema>,execute:AgentTool["execute"]):AgentTool{return {name,label,description,parameters:Type.Object(properties),executionMode:"sequential",execute};}
  async function post(path:string,body:Record<string,unknown>,signal?:AbortSignal){
    try{return await d.internal(path,signal,{method:"POST",headers:{"content-type":"application/json",...(d.canvas?{"x-naumi-canvas":"1"}:{})},body:JSON.stringify(body)});}
    catch(error){throw Object.assign(new Error(`${error instanceof Error?error.message:"操作尚未核实"}；保留原请求${body.operationId?`及 operation_id=${body.operationId}`:""}，查询回执或以完全相同参数重试，不另建操作`),{status:(error as {status?:number}).status});}
  }
  async function plans(key:string,signal?:AbortSignal){return await d.internal(`/api/canvas/storyboards?projectKey=${encodeURIComponent(key)}`,signal);}
  return [
    tool("fork_video_storyboard","建立独立创意版本","从明确plan_id/revision及全部节点revision建立独立版本，复制节点参数并重写内部依赖，保留原稿、设定快照、意见和采用。旧作品通过服务端冻结来源复用，历史任务不改归属；不生成、不收费、不更新原粗剪。operation_id稳定；未知/401后原完整请求重试，不重新读新revision组成另一请求。",{...selection,operation_id:uuid,title:Type.String({minLength:1,maxLength:200}),nodes:Type.Array(Type.Object({id,revision:Type.Integer({minimum:0})}),{minItems:1,maxItems:100})},async(_call,args,signal)=>{
      const a=args as any,body=storyboardForkSchema.parse({projectKey:project(a.project_key),planId:a.plan_id,revision:a.revision,operationId:a.operation_id,title:a.title,nodes:a.nodes});
      const value=await post("/api/canvas/storyboards/fork",body,signal);return result("独立创意版本已建立，尚未生成",{...value,planId:value.plan.id,planRevision:value.plan.revision,nodeIds:value.nodes.map((node:any)=>node.id),projectKey:body.projectKey,operationId:body.operationId});
    }),
    tool("list_video_storyboards","读取分镜方案","列出指定项目的正式持久方案及其revision、采用清单和审片意见。同节点可属于多个方案；后续必须使用明确plan_id，不根据标题或最新结果猜测。",context,async(_call,args,signal)=>result("分镜方案已读取",await plans(project((args as any).project_key),signal))),
    tool("get_video_storyboard","读取指定方案","读取明确plan_id的正式方案。修改前保留完整document和revision；takes是候选及意见，adoptedArtworkId才是明确采用版本。",{...context,plan_id:uuid},async(_call,args,signal)=>{
      const a=args as any,key=project(a.project_key),plan=(await plans(key,signal)).plans.find((plan:any)=>plan.id===a.plan_id&&plan.projectKey===key);
      if(!plan)throw new Error("此项目中没有指定分镜方案");return result("指定方案已读取",{plan});
    }),
    tool("save_video_storyboard","保存方案与审片","保存完整document，包括镜序、连续性、takes审片意见和adoptedArtworkId。保留未修改字段；expected_revision为上次读取版本，新方案为0。新增候选不改变采用版；只有用户已授权选片时才明确修改adoptedArtworkId并在take.note记录理由。不生成视频，不更新粗剪。operation_id稳定，重试原完整请求；冲突先读取，不覆盖。",{...context,plan_id:uuid,expected_revision:Type.Integer({minimum:0}),operation_id:uuid,document},async(_call,args,signal)=>{
      const a=args as any,body=storyboardWriteSchema.parse({id:a.plan_id,projectKey:project(a.project_key),expectedRevision:a.expected_revision,operationId:a.operation_id,document:a.document});
      return result("方案与审片已保存，尚未生成",{...await post("/api/canvas/storyboards",body,signal),operationId:body.operationId});
    }),
    tool("get_video_storyboard_operation","查询方案原操作","查询原operation_id对应的已提交方案回执，即使方案后来已修改也返回原结果。404只代表未找到回执；鉴权失效或网络未知时保留原意图。粗剪沿apply_video_storyboard_roughcut的原完整请求恢复，制作链沿get_video_workflow恢复。",{...context,operation_id:uuid},async(_call,args,signal)=>{
      const a=args as any,key=project(a.project_key);return result("方案原操作已读取",await d.internal(`/api/canvas/storyboards?projectKey=${encodeURIComponent(key)}&operationId=${encodeURIComponent(a.operation_id)}`,signal));
    }),
    tool("inspect_video_storyboard","检查制作与粗剪","读取指定plan_id及revision的连续性、预演素材、实际报价和已关联粗剪身份/当前revision。nodes明确本轮新生成与复用采用版，不创建生成或合成任务，不锁价；未知费用保持未知，BYOC外部费用未计入。",{...selection,nodes:Type.Array(Type.Object({id,reuseCompleted:Type.Boolean()}),{minItems:1,maxItems:100})},async(_call,args,signal)=>{
      const a=args as any,body=productionSelectionSchema.parse({projectKey:project(a.project_key),planId:a.plan_id,revision:a.revision,nodes:a.nodes});return result("制作预检已读取，未提交生成",await post("/api/canvas/storyboards/inspect",body,signal));
    }),
    tool("apply_video_storyboard_roughcut","创建或更新方案粗剪","仅使用方案明确采用版，创建可编辑多轨或更新指定timeline_id/timeline_revision。node_ids是明确选择镜头；更新只安全换片，保留人工裁剪、位置、音轨和转场，不重排。先inspect取得目标身份，不猜测粗剪。不生成、导出或收费；保留operation_id及原完整参数，未知/401后原样重试。",{...selection,operation_id:uuid,mode:Type.Union([Type.Literal("create"),Type.Literal("update")]),node_ids:Type.Array(id,{minItems:1,maxItems:100}),timeline_id:Type.Optional(Type.String({minLength:1,maxLength:80})),timeline_revision:Type.Optional(revision)},async(_call,args,signal)=>{
      const a=args as any,body=roughcutRequestSchema.parse({projectKey:project(a.project_key),planId:a.plan_id,revision:a.revision,operationId:a.operation_id,mode:a.mode,nodeIds:a.node_ids,...(a.timeline_id!==undefined?{timelineId:a.timeline_id}:{}),...(a.timeline_revision!==undefined?{timelineRevision:a.timeline_revision}:{})});
      const value=await post("/api/canvas/storyboards/roughcut",body,signal);return result("方案粗剪已保存",{...value,nodeId:value.node.id,projectKey:body.projectKey,operationId:body.operationId});
    }),
  ];
}
