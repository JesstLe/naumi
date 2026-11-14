import "server-only";
import {readByocVideoSnapshot} from "./byoc-snapshot";
import {getPool} from "@/platform/db/pool";
import {createCredentialStore} from "../model-config/credentials";
import {assertComfyEndpointAllowed} from "../comfyui/client";
import {runLegacyModelExecution} from "../model-config/context";
import {runPrivateVideoProvider} from "./providers/private-context";
import type {VideoProviderRuntimeConfig} from "./providers/config";
import type {VideoTaskRow} from "./task-types";
export async function withByocVideoTask<T>(actor:string,task:VideoTaskRow,run:()=>Promise<T>){
  const frozen=readByocVideoSnapshot(actor,task);
  await assertComfyEndpointAllowed(frozen.baseUrl);
  const apiKey=frozen.credentialRef?await createCredentialStore(getPool()).read(frozen.credentialRef,frozen.providerId):"";
  const config:VideoProviderRuntimeConfig={id:frozen.providerId,label:"自备 ComfyUI",protocol:"comfyui",videoProfile:"comfyui",baseUrl:frozen.baseUrl,apiKey,
    models:[task.model],defaultModel:task.model,idempotencyStrategy:"none"};
  return runLegacyModelExecution(()=>runPrivateVideoProvider({config,manifest:frozen.manifest},run));
}
