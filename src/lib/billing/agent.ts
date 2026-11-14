import {withPreparedAgentVideo} from '../video/agent-execution';
import {assertVideoCreationSettings,type CreationSettings} from "../agent/creation-settings";
import "server-only";
import {agentVideoWorkflowIntent} from "../agent/video-workflow-intent";
import {prepareCanvasVideoWorkflow,type PreparedCanvasVideoWorkflow} from "../video/canvas-workflow";
import {getVideoWorkflow} from "../video/workflow";
import {ensureVideoWorkflowSchema} from "@/lib/video/storage-schema";

import {videoAgentOperationId} from "../agent/canvas-video-tools";
import {getVideoNode} from "../canvas/video-node-repository";
import {mediaBillingQuote} from "../video/media-billing";
import { CREATIVE_TOOL_FEATURES } from "../agent/creative-tool-catalog";
import {quoteForActor} from "./quotation";
import {getBillingRuntime} from "@/lib/billing/runtime";
import type { BillingQuote, FeatureId } from "./types";
import {getVideoTaskByIdempotencyKey} from "@/lib/video/task-repository";
import {dbEnabled} from "@/platform/db/pool";
import {getUser} from "@/lib/accounts/session";
import { fingerprint } from "./fingerprint";
import { getImageJob } from "@/lib/image-job-repository";
import { currentModelBillingSnapshot } from "../model-config/context";
import { CANVAS_IMAGE_TOOLS, type CanvasAgentContext } from "../agent/canvas-context";
import {SHARED_IMAGEGEN_TOOLS,agentImagegenRequest} from "../imagegen/agent-request";
import {planImagegenBatch} from "../imagegen/batch";
import {planImagegen,imagegenFingerprint} from "../imagegen/plan";
import {imagegenStepId} from "../imagegen/generation-core";
import type {ImagegenPlan} from "../imagegen/types";
import {currentExecutionBundle} from "../model-config/context";
export const AGENT_FEATURES: Record<string, {
    feature: FeatureId;
    label: string;
}> = { ...CREATIVE_TOOL_FEATURES, generate_aplus: { feature: "image.aplus", label: "A+ 母图准备" }, generate_image: { feature: "image.generate", label: "AI 生图" }, retouch_product: { feature: "tool.retouch", label: "商品精修" }, recolor_product: { feature: "tool.recolor", label: "产品换色" }, replicate_hot: { feature: "tool.replicate", label: "爆款复刻" }, generate_suite: { feature: "image.suite", label: "商品套图" }, continue_aplus_generation: { feature: "image.aplus", label: "A+ 详情页" }, generate_packaging_3d: { feature: "tool.packaging3d", label: "包装 3D" }, generate_video: { feature: "video.generate", label: "视频生成" }, extend_video: { feature: "video.generate", label: "视频续写" }, edit_video: { feature: "video.generate", label: "视频编辑" },render_video_timeline:{feature:"video.process",label:"多轨导出"},prepare_video_review_frames:{feature:"video.process",label:"审片抽帧"},review_video_storyboard_take:{feature:"canvas.text-generate",label:"辅助审片"},process_video:{feature:"video.process",label:"视频媒体处理"},run_video_workflow:{feature:"video.generate",label:"视频制作链"},confirm_video_workflow_stage:{feature:"video.generate",label:"制作链阶段"} };
export async function agentQuote(name: string, args: Record<string, any>, email: string, cred: {
    cookie: string;
    authorization: string;
    imageQuality?: string; originalRequest?: string; creationSettings?: CreationSettings;
    canvas?: CanvasAgentContext;
    imageSkill?:import("../imagegen/types").ImagegenRequest["skill"];
}): Promise<{
    quote: Pick<BillingQuote, "configVersion" | "requestedCredits"> & Partial<Pick<BillingQuote,"modelVersion" | "authorizedCredits" | "imagePreset" | "tariff">>;
    label: string;
    threshold: number;
    imagegenPlan?:ImagegenPlan;
    videoWorkflow?:PreparedCanvasVideoWorkflow;authorizationRequired?:boolean;
} | null> {
    const canvas = cred.canvas;
    const videoTool=["generate_video","extend_video","edit_video"].includes(name);
    if(videoTool){const nodeId=args.node_id||canvas?.video?.nodeId,current=nodeId?await getVideoNode(email,String(nodeId)):null;if(nodeId&&!current)throw new Error("视频节点不存在");if(current&&canvas?.video?.projectKey&&current.projectKey!==canvas.video.projectKey)throw new Error("视频节点不属于当前项目");const config=current?.config||args.config||{};if(current)assertVideoCreationSettings(config,cred.creationSettings);if(config.comfyWorkflowId)return null;if(current&&Number.isInteger(args.expected_revision)&&current.revision!==args.expected_revision)throw new Error("视频节点已更新，请重新读取后生成");const modern=await withPreparedAgentVideo(email,{config,inputs:current?.inputs||args.inputs||[],...(current?{node:{id:current.id,revision:current.revision},projectKey:current.projectKey}:{}),requiredIntent:name==='extend_video'?'extend':name==='edit_video'?'video_edit':undefined},async plan=>{
      if(!plan)return undefined;
      const runtime=await getBillingRuntime(),snapshot=currentModelBillingSnapshot()??await runtime.config.current();
      return {quote:await quoteForActor(email,{feature:'video.generate',quantity:1,modelId:plan.identity.publicModelId,providerId:plan.identity.connectionId,resolution:plan.billingFacts.resolution,ratio:plan.billingFacts.aspectRatio},undefined,snapshot),label:AGENT_FEATURES[name].label,threshold:snapshot.config.thresholds.agentConfirmCredits};
    });if(modern)return modern;args={...args,...config,quality:"medium"};}

    if (canvas && CANVAS_IMAGE_TOOLS.has(name) && name !== "generate_image") args = {...args,quality:canvas.quality,resolution:canvas.resolution,ratio:canvas.ratio,model:canvas.imageModelId,modelId:undefined};
    const entry = canvas && CANVAS_IMAGE_TOOLS.has(name) ? { feature: "canvas.image" as const, label: AGENT_FEATURES[name]?.label || "画布生图" } : AGENT_FEATURES[name];
    if (!entry)
        return null;
    const runtime = await getBillingRuntime(), snapshot=currentModelBillingSnapshot()??await runtime.config.current(),threshold=snapshot.config.thresholds.agentConfirmCredits;
    if((SHARED_IMAGEGEN_TOOLS.has(name)||canvas&&CANVAS_IMAGE_TOOLS.has(name))&&!args._category){const request=await agentImagegenRequest(name,args,email,canvas,cred.imageQuality,cred.imageSkill,cred.originalRequest),bundle=currentExecutionBundle(),plan=await (request.mode==="batch"?planImagegenBatch:planImagegen)(request,email,bundle?{modelVersion:bundle.modelVersion,billingVersion:bundle.billingVersion}:undefined);return {quote:{configVersion:plan.billingVersion,modelVersion:plan.modelVersion,requestedCredits:plan.totalCredits,authorizedCredits:plan.totalCredits},label:entry.label,threshold:plan.confirmationRequired?0:threshold,imagegenPlan:plan};}
    if(name==="run_video_workflow"){
      if(cred.creationSettings?.video)for(const node of args.nodes||[]){if(node.reuseCompleted)continue;const current=await getVideoNode(email,String(node.id));if(!current)throw new Error("视频节点不存在");assertVideoCreationSettings(current.config,cred.creationSettings);}
      const prepared=await prepareCanvasVideoWorkflow(email,agentVideoWorkflowIntent(args,canvas)),quotes=Object.values(prepared.frozen).map(stage=>stage.quote),credits=quotes.reduce((total,q)=>total+q.credits,0)+(prepared.assemblyQuote?.requestedCredits||0),authorizedCredits=quotes.reduce((total,q)=>total+q.authorizedCredits,0)+(prepared.assemblyQuote?.authorizedCredits||0);
      return {quote:{configVersion:quotes[0].version,requestedCredits:credits,authorizedCredits,modelVersion:quotes.find(q=>q.modelVersion)?.modelVersion},label:entry.label,threshold:credits>0||authorizedCredits>0?0:Number.MAX_SAFE_INTEGER,videoWorkflow:prepared,authorizationRequired:quotes.some(q=>q.authorization===true)};
    }
    if(name==="confirm_video_workflow_stage"){const run=await getVideoWorkflow(email,args.run_id);if(canvas?.video?.projectKey&&run.projectKey!==canvas.video.projectKey)throw new Error("制作链不属于当前项目");const stage=run.nodes.find(node=>node.id===args.stage_id);if(stage?.status!=="needs_confirmation"||!stage.quote)throw new Error("此阶段无需确认或缺少冻结报价");const q=stage.quote;return {quote:{configVersion:q.version,requestedCredits:q.credits,authorizedCredits:q.authorizedCredits,modelVersion:q.modelVersion},label:entry.label,threshold:q.authorizedCredits>0?0:Number.MAX_SAFE_INTEGER,authorizationRequired:q.authorization===true};}
    if(name==="render_video_timeline"){
      const {getTimelineNode}=await import("../canvas/timeline-node-service"),{findTimelineRenderIntent}=await import("../canvas/timeline-node-repository"),{listMediaJobs}=await import("../video/media-jobs");
      const node=await getTimelineNode(email,String(args.timeline_id));if(!node||canvas?.video?.projectKey&&node.projectKey!==canvas.video.projectKey||args.project_key&&node.projectKey!==args.project_key)throw new Error("多轨工程不属于此项目");
      const intent=await findTimelineRenderIntent(email,String(args.operation_id));if(intent){if(intent.id!==node.id||intent.render?.baseRevision!==args.expected_revision)throw new Error("导出编号已用于其他工程");const job=(await listMediaJobs(email,{operationId:args.operation_id})).jobs[0];if(job)return {quote:{configVersion:0,requestedCredits:0,authorizedCredits:0},label:entry.label,threshold};}
      else if(node.revision!==args.expected_revision)throw new Error("多轨工程已更新，请读取最新版本");
      return {quote:await mediaBillingQuote(email,"ffmpeg"),label:entry.label,threshold};
    }
    if(name==="prepare_video_audio_review"){
      const {audioReviewExtractSchema}=await import("../storyboard/audio-review"),{requireReviewTarget}=await import("../storyboard/assisted-review-service");const input=audioReviewExtractSchema.parse(args.request);if(canvas?.video?.projectKey&&canvas.video.projectKey!==input.projectKey)throw new Error("语音审片不属于当前项目");const {material}=await requireReviewTarget(email,input);if(!material.hasAudio)throw new Error("原片没有声音");return {quote:await mediaBillingQuote(email,"ffmpeg"),label:entry.label,threshold};
    }
    if(name==="review_video_storyboard_audio"){
      const {audioReviewEvidence}=await import("../storyboard/audio-review-service"),{withModelOperation}=await import("../model-config/requests");const {input}=await audioReviewEvidence(email,args.request);if(canvas?.video?.projectKey&&canvas.video.projectKey!==input.projectKey)throw new Error("语音审片不属于当前项目");if(!snapshot.config.features["audio.transcribe"].enabled)throw new Error("声音通道尚未配置明确售价");return withModelOperation({path:"/api/canvas/storyboards/review-audio",body:input,references:0},async()=>({quote:await quoteForActor(email,{feature:"audio.transcribe",modelId:input.modelId,quantity:1,quality:"medium",resolution:"1K"},undefined,snapshot),label:entry.label,threshold}));
    }
    if(name==="prepare_video_review_frames"){
      const {reviewFramesSchema}=await import("../storyboard/assisted-review"),{requireReviewTarget}=await import("../storyboard/assisted-review-service");
      const input=reviewFramesSchema.parse({projectKey:canvas?.video?.projectKey||args.project_key,planId:args.plan_id,revision:args.revision,nodeId:args.node_id,taskId:args.task_id,artworkId:args.artwork_id,operationId:args.operation_id,samples:args.samples});
      const {material}=await requireReviewTarget(email,input);if(input.samples.some(time=>time>=material.durationSeconds!))throw new Error("抽帧超出实际原片时长");
      return {quote:await mediaBillingQuote(email,"ffmpeg"),label:entry.label,threshold};
    }
    if(name==="generate_dialogue_speech"||name==="transcribe_dialogue_audio"){
      const {speechOperationSchema,transcriptionOperationSchema}=await import("../audio/operation-schema"),{requireAudioTarget}=await import("../audio/operation-service"),{withModelOperation}=await import("../model-config/requests");
      const kind=name==="generate_dialogue_speech"?"speech":"transcribe",input=(kind==="speech"?speechOperationSchema:transcriptionOperationSchema).parse(args.request);
      if(canvas?.video?.projectKey&&canvas.video.projectKey!==input.target.projectKey)throw new Error("声音操作不属于当前项目");
      await requireAudioTarget(email,input.target);
      if(!snapshot.config.features[entry.feature].enabled)throw new Error("声音通道尚未配置明确售价");
      return withModelOperation({path:`/api/canvas/audio-operations/${kind}`,body:input,references:0},async()=>({quote:await quoteForActor(email,{feature:entry.feature,modelId:input.modelId,quantity:1,quality:"medium",resolution:"1K"},undefined,snapshot),label:entry.label,threshold}));
    }
    if(name==="review_video_storyboard_take"){
      const {assistedReviewRequestSchema}=await import("../storyboard/assisted-review"),{reviewEvidence}=await import("../storyboard/assisted-review-service"),{withModelOperation}=await import("../model-config/requests");
      const input=assistedReviewRequestSchema.parse({projectKey:canvas?.video?.projectKey||args.project_key,planId:args.plan_id,revision:args.revision,nodeId:args.node_id,taskId:args.task_id,artworkId:args.artwork_id,operationId:args.operation_id,samples:args.samples,frameJobId:args.frame_job_id});
      await reviewEvidence(email,input);
      return withModelOperation({path:"/api/canvas/storyboards/review",body:input,references:input.samples.length},async()=>({quote:await quoteForActor(email,{feature:"canvas.text-generate",quantity:1,quality:"medium",resolution:"1K"},undefined,snapshot),label:entry.label,threshold}));
    }
    if(name==="process_video")return {quote:await mediaBillingQuote(email,args.action),label:entry.label,threshold};
    if (name === "continue_aplus_generation") {
        const job = await getImageJob(String(args.job_id || ""), "aplus");
        if (!job || job.email !== email.toLowerCase())
            throw new Error("详情页任务不存在或无权访问");
        const frozen = job.payload.billingQuote as BillingQuote | undefined;
        if (frozen)
            return { quote: frozen, label: entry.label, threshold };
        return { quote: { configVersion: 0, requestedCredits: Number(job.snapshot.cost || 0) }, label: entry.label, threshold };
    }
    const quantity = name === "generate_aplus" ? (Array.isArray(args.modules) && args.modules.length ? args.modules.length : 4) : ["generate_image","generate_variations","fuse_images"].includes(name) ? Math.min(4, Math.max(1, Number(args.count) || 1)) : name === "generate_suite" ? (args.structure === "custom" && Array.isArray(args.shots) ? Math.max(1, Math.min(20, args.shots.length)) : 13) : 1;
    return { quote: await quoteForActor(email, { feature: entry.feature, quantity, quality: args.quality || canvas?.quality || cred.imageQuality || "medium", resolution: videoTool?args.resolution:args.resolution || canvas?.resolution || "1K", modelId: args.model || args.modelId || args.model_id || (CANVAS_IMAGE_TOOLS.has(name) ? canvas?.imageModelId : undefined), providerId: args.providerId || args.provider_id, ratio: videoTool?args.aspectRatio:args.ratio || canvas?.ratio },undefined,snapshot), label: entry.label, threshold };
}
export type AgentBillingSession = {
    /** This step's budget exposure; may differ from a later stage's frozen quote. */
    preparedBudgetCredits?:number;
    email: string;
    cred: {
        cookie: string;
        authorization: string;
        imageQuality?: string; originalRequest?: string; creationSettings?: CreationSettings;
        canvas?: CanvasAgentContext;
    };
    id: string;
    creationSettings?: CreationSettings;
    turnId?: string;
    /** @deprecated Compatibility for historical verification scripts; never authorizes execution. */
    userConfirmedQuote?: boolean;
    preparedBilling?: {
        billingVersion: number;
        billingCredits: number;
        billingOperationId: string;
    };
    preparedImagegen?:ImagegenPlan;preparedVideoWorkflow?:PreparedCanvasVideoWorkflow;
};
export async function agentBillingPrecheck(session: AgentBillingSession, name: string, args: Record<string, unknown>, callId: string) {
    session.preparedBilling = undefined;
    session.preparedBudgetCredits = undefined;
    session.preparedImagegen=undefined;session.preparedVideoWorkflow=undefined;
    if (!dbEnabled)
        return undefined;
    if(["generate_video","extend_video","edit_video"].includes(name)&&await getVideoTaskByIdempotencyKey(session.email,typeof args.operation_id==="string"?args.operation_id:videoAgentOperationId(session.email,callId,"video-generate")))return undefined;
    if(name==="run_video_workflow"){
      if(typeof args.operation_id!=="string")return {block:true,reason:"请选择制作链原操作编号"};
      await ensureVideoWorkflowSchema();try{await getVideoWorkflow(session.email,args.operation_id);return undefined;}catch(error){if((error as {status?:number}).status!==404)throw error;}
    }
    let quoted;
    try {
        quoted = await agentQuote(name, args as Record<string, any>, session.email, {...session.cred,creationSettings:session.creationSettings});
    }
    catch (error) {
        const detail=error as {code?:string;issues?:{message?:string}[]};
        return { block: true, reason: Array.isArray(detail.issues)?detail.issues.map(i=>i.message).filter(Boolean).join("；").slice(0,500):error instanceof Error ? error.message : "报价暂不可用",
          code:typeof detail.code==="string"?detail.code:Array.isArray(detail.issues)?"ARGUMENT_INVALID":"PLAN_UNAVAILABLE",submissionState:"not_submitted" as const };
    }
    if (!quoted)
        return undefined;
    const costPlus=quoted.quote.tariff?.pricing.mode==="api-cost-plus"||quoted.authorizationRequired===true, cap=quoted.quote.authorizedCredits??quoted.quote.requestedCredits;
    const meta = { cost: name === "generate_aplus" ? 0 : quoted.quote.requestedCredits, label: quoted.label };
    // Prepare the server quote once for this tool call; pricing is not a second user-confirmation flow.
    const audioOperation=args.request&&typeof args.request==="object"&&typeof (args.request as {operationId?:unknown}).operationId==="string"?String((args.request as {operationId:string}).operationId):undefined;
    session.preparedBilling = { billingVersion: quoted.quote.configVersion, billingCredits: costPlus?cap:quoted.quote.requestedCredits, billingOperationId: ["generate_dialogue_speech","transcribe_dialogue_audio","review_video_storyboard_audio"].includes(name)&&audioOperation?audioOperation:name==="review_video_storyboard_take"&&typeof args.operation_id==="string"?args.operation_id:fingerprint({ session: session.id, turn: session.turnId, call: callId }) };
    session.preparedBudgetCredits = name === "generate_aplus" ? 0 : session.preparedBilling.billingCredits;
    if(quoted.videoWorkflow)session.preparedVideoWorkflow=quoted.videoWorkflow;
    if(quoted.imagegenPlan){const request={...quoted.imagegenPlan.request,operationId:imagegenStepId(session.preparedBilling.billingOperationId,"agent")};session.preparedImagegen={...quoted.imagegenPlan,request,fingerprint:imagegenFingerprint(request)};}
    const u = await getUser(session.email);
    if (!u)
        return { block: true, attention: "restricted" as const, reason: "积分账户不可用，请先登录后重试" };
    const balance = u.creditsTotal - u.creditsUsed;
    if (balance < session.preparedBudgetCredits) {
        return {
            block: true,
            attention: "restricted" as const,
            reason: `余额不足:「${meta.label}」需要约 ${meta.cost} 积分,当前余额 ${balance}。请先充值或减少任务规模。`,
            terminate: true,
        };
    }
    return undefined;
}
