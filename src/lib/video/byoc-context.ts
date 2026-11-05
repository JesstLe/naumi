import "server-only";
import {z} from "zod";
import {getPool} from "@/platform/db/pool";
import {createCredentialStore} from "../model-config/credentials";
import {ModelConfigError} from "../model-config/types";
import {decryptAtRest} from "../settings";
import {assertComfyEndpointAllowed} from "../comfyui/client";
import {runLegacyModelExecution} from "../model-config/context";
import {videoWorkflowManifestSchema} from "./workflow-schema";
import {runPrivateVideoProvider} from "./providers/private-context";
import type {VideoProviderRuntimeConfig} from "./providers/config";
import type {VideoTaskRow} from "./task-types";
const name=z.string().min(1).max(160);
const snapshotSchema=z.strictObject({actor:z.string(),providerId:name,endpointId:name,baseUrl:z.url(),credentialRef:z.uuid().optional(),manifest:videoWorkflowManifestSchema});

export async function withByocVideoTask<T>(actor:string,task:VideoTaskRow,run:()=>Promise<T>){
  const decrypted=typeof task.parameters.byocSnapshot==="string"?decryptAtRest(task.parameters.byocSnapshot):null;
  if(!decrypted)throw new ModelConfigError("BYOC_SNAPSHOT_UNAVAILABLE","自备视频工作流快照不可用",503);
  const frozen=snapshotSchema.parse(JSON.parse(decrypted));
  if(frozen.actor!==actor||frozen.providerId!==task.providerId)throw new ModelConfigError("BYOC_OWNER_MISMATCH","自备视频任务归属不一致",403);
  await assertComfyEndpointAllowed(frozen.baseUrl);
  const apiKey=frozen.credentialRef?await createCredentialStore(getPool()).read(frozen.credentialRef,frozen.providerId):"";
  const config:VideoProviderRuntimeConfig={id:frozen.providerId,label:"自备 ComfyUI",protocol:"comfyui",videoProfile:"comfyui",baseUrl:frozen.baseUrl,apiKey,
    models:[task.model],defaultModel:task.model,idempotencyStrategy:"none"};
  return runLegacyModelExecution(()=>runPrivateVideoProvider({config,manifest:frozen.manifest},run));
}
