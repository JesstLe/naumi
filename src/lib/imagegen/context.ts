import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
import type {ImagegenRequest,Intent} from "./types";
const context=new AsyncLocalStorage<{request:ImagegenRequest;intent:Intent;ratioContractVersion?:1|2;requestedParameters?:import("../model-config/image-preset").ImageParameters}>();
/** Trusted internal steps only; HTTP callers cannot opt out of intent validation. */
export const currentImagegenStep=()=>context.getStore();
export function withImagegenStep<T>(request:ImagegenRequest,intent:Intent,run:()=>Promise<T>,ratioContractVersion?:1|2,requestedParameters?:import("../model-config/image-preset").ImageParameters){return context.run({request,intent,ratioContractVersion,requestedParameters},run);}
