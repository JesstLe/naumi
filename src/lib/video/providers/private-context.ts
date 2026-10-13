import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
import type {VideoProviderRuntimeConfig} from "./config";
import type {VideoWorkflowManifest} from "../workflow-schema";
const privateContext=new AsyncLocalStorage<{config:VideoProviderRuntimeConfig;manifest:VideoWorkflowManifest}>();
export const currentPrivateVideoContext=()=>privateContext.getStore();
export function runPrivateVideoProvider<T>(value:{config:VideoProviderRuntimeConfig;manifest:VideoWorkflowManifest},run:()=>Promise<T>){return privateContext.run(value,run);}
