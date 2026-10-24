import "server-only";
import {getVideoTask} from "../db";
import {getPool} from "@/platform/db/pool";
import {ensureVideoNodeSchema} from "../canvas/video-node-repository";
import {decryptAtRest} from "../settings";
import {ModelConfigError} from "../model-config/types";
import {videoWorkflowManifestSchema} from "./workflow-schema";
export async function ownedVideoWorkflowSource(actor:string,taskId:string){await ensureVideoNodeSchema();const saved=(await getPool().query("SELECT public_model_id,manifest_enc,digest FROM app_canvas_video_workflow_sources WHERE email=$1 AND task_id=$2",[actor,taskId])).rows[0];if(saved)return saved as {public_model_id:string;manifest_enc:string;digest:string|null};
  const task=await getVideoTask(actor,taskId);return task&&typeof task.parameters.workflowManifestEnc==="string"?{public_model_id:String(task.parameters.publicModelId||task.model),manifest_enc:task.parameters.workflowManifestEnc,digest:typeof task.parameters.workflowManifestDigest==="string"?task.parameters.workflowManifestDigest:null}:null;
}
export async function readOwnedVideoWorkflow(actor:string,taskId:string){const source=await ownedVideoWorkflowSource(actor,taskId);if(!source)throw new ModelConfigError("VIDEO_WORKFLOW_UNAVAILABLE","历史工作流不存在或无权访问",404);try{const text=decryptAtRest(source.manifest_enc);if(!text)throw new Error("unavailable");return {publicModelId:source.public_model_id,manifest:videoWorkflowManifestSchema.parse(JSON.parse(text))};}catch{throw new ModelConfigError("VIDEO_WORKFLOW_UNAVAILABLE","历史工作流快照暂不可用",503);}}
