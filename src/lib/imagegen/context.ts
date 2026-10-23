import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
import type {ImagegenRequest,Intent} from "./types";
import type {BillingQuote} from "../billing/types";
export type ImagegenStepBilling={owner:string;operationId:string;quote:BillingQuote};
const context=new AsyncLocalStorage<{request:ImagegenRequest;intent:Intent;ratioContractVersion?:1|2;requestedParameters?:import("../model-config/image-preset").ImageParameters;eligibleUpstreamIds?:string[];billing?:ImagegenStepBilling}>();
/** Trusted internal steps only; HTTP callers cannot opt out of intent validation. */
export const currentImagegenStep=()=>context.getStore();
export function withImagegenStep<T>(request:ImagegenRequest,intent:Intent,run:()=>Promise<T>,ratioContractVersion?:1|2,requestedParameters?:import("../model-config/image-preset").ImageParameters,eligibleUpstreamIds?:string[],billing?:ImagegenStepBilling){return context.run({request,intent,ratioContractVersion,requestedParameters,eligibleUpstreamIds,billing},run);}
