import "server-only";
import {createValidatedVideo,videoCreationInputDigest} from "./submission";
import {videoSubmissionSchema} from "./submission-schema";
import {VideoContractError} from "./contract";
import {BillingError} from "../billing/types";
import {currentModelExecution} from "../model-config/context";
import {getModelExecutor} from "../model-config/execution";
import {modelConfigurationEnabled} from "../model-config/availability";
import {getModelExecutionServices} from "../model-config/execution-services";
import {ModelConfigError} from "../model-config/types";
import {getVideoTaskByIdempotencyKey} from "./task-repository";
import {submitQueuedVideoTask,handleVideoCreationError} from "./runtime";
import type {CreateVideoInput} from "./submission-types";

export async function createVideoGeneration(
  email: string,
  input: CreateVideoInput
): Promise<{ taskId: string; cost: number }> {
  email=email.toLowerCase();
  // Internal workflow linkage is never part of the public submission schema.
  // Its owned run/stage is checked atomically when the task is reserved.
  const {workflowRunId:_workflowRunId,workflowNodeId:_workflowNodeId,...publicInput}=input;
  const parsed=videoSubmissionSchema.safeParse(publicInput);
  if(!parsed.success)throw new VideoContractError("INVALID_VIDEO_SUBMISSION","视频提交字段无效",parsed.error.issues.map(issue=>issue.path.join(".")));
  if(input.workflowTaskId){
    if(input.workflowManifest)throw new VideoContractError("WORKFLOW_SOURCE_CONFLICT","请选择一个工作流来源");
    const {readOwnedVideoWorkflow}=await import("./workflow-source"),old=await readOwnedVideoWorkflow(email,input.workflowTaskId);
    if(old.publicModelId!==input.modelId)throw new ModelConfigError("VIDEO_WORKFLOW_MODEL_CONFLICT","历史工作流与当前模型不一致，请重新选择模型",409);
    const {workflowTaskId:_source,...settings}=input;input={...settings,workflowManifest:old.manifest};
  }
  const key = String(input.idempotencyKey || "").trim();
  if (key) {
    const existing = await getVideoTaskByIdempotencyKey(email, key);
    if (existing?.parameters?.creationInputDigest) {
      if (existing.parameters.creationInputDigest !== videoInputDigest(input)) throw new BillingError("OPERATION_CONFLICT", "操作编号已用于不同视频任务", 409);
      return { taskId: existing.id, cost: existing.cost };
    }
  }
  if (!currentModelExecution("video") && await modelConfigurationEnabled()) {
    const services = getModelExecutionServices();
    const [snapshot, billing] = await Promise.all([services.models.current(), services.billing.current()]);
    const executor = await getModelExecutor();
    const video = await executor.resolve({ feature:"video.generate", binding: "video.generate", requestedModelId: input.modelId || undefined, snapshot, billing });
    return executor.runBundle({ modelVersion: snapshot.version, billingVersion: billing.version, primary: "video", video }, billing, () => createVideoGeneration(email, input));
  }
  return createVideoGenerationUnlocked(email, {
    ...input,
    idempotencyKey: key || crypto.randomUUID(),
  });
}

const videoInputDigest=videoCreationInputDigest;

async function createVideoGenerationUnlocked(email:string,input:CreateVideoInput):Promise<{taskId:string;cost:number}>{
  return createValidatedVideo(email,input,{submit:(actor,task,request)=>submitQueuedVideoTask(actor,task,request,undefined,false),creationError:handleVideoCreationError});
}
