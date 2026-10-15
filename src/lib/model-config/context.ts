import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ExecutionModel, ExecutionConnection } from "./execution";
import type { UpstreamModel } from "./types";
import type { ConfigSnapshot } from "../billing/types";

export type ModelExecutionScope = { channelGuard?:import("./channel-availability").ChannelGuard; capacityReserved?:boolean; supplierRouting?:{policy:import("./channel-policy").ChannelPolicy;targets:import("./channel-scheduler").ChannelTarget[]}; imagePreset?: import("./image-preset").ImagePreset; audited?: boolean; costPhase?: string; costRuleId?: string; frozen: ExecutionModel; connection: ExecutionConnection; capabilities: UpstreamModel["capabilities"]; parameterMap: UpstreamModel["parameterMap"]; businessOption?: import("./business-schema").BusinessOption; procurement?: import("./business-schema").Procurement; routing?: { policy: import("./business-schema").BusinessRouting; matchedRuleId?: string; spentMicros: bigint; targets: Record<string, { connection: ExecutionConnection; capabilities: UpstreamModel["capabilities"]; parameterMap: UpstreamModel["parameterMap"]; procurement: import("./business-schema").Procurement }> } };
const context = new AsyncLocalStorage<ModelExecutionScope | null>();
export type ExecutionBundle = { modelVersion: number; billingVersion: number; primary?: "image" | "text" | "vision" | "video"; image?: ExecutionModel; text?: ExecutionModel; vision?: ExecutionModel; video?: ExecutionModel };
export type ResolvedExecutionBundle = { frozen: ExecutionBundle; billing: ConfigSnapshot; image?: ModelExecutionScope; text?: ModelExecutionScope; vision?: ModelExecutionScope; video?: ModelExecutionScope };
const bundles = new AsyncLocalStorage<ResolvedExecutionBundle | null>();
const legacyBilling = new AsyncLocalStorage<ConfigSnapshot>();
export function currentModelExecution(role?: "image" | "text" | "vision" | "video") {
  const current = context.getStore();
  if (current === null) return null;
  const bundle = bundles.getStore();
  // A separately configured visual purpose is authoritative even when the
  // primary text model can also consume images.
  if (role === "vision" && bundle?.vision) return bundle.vision;
  if (current && (!role || current.frozen.modality === role || role === "vision" && current.capabilities.vision)) return current;
  return (role ? bundle?.[role] : bundle?.image || bundle?.text || bundle?.vision || bundle?.video) || null;
}
export const currentExecutionBundle = () => bundles.getStore()?.frozen;
export const currentModelBillingSnapshot = () => bundles.getStore()?.billing||legacyBilling.getStore();
export const legacyModelExecutionActive = () => context.getStore() === null || bundles.getStore() === null;
export function runModelExecution<T>(scope: ModelExecutionScope, run: () => Promise<T>) { return context.run(scope, run); }
export function runExecutionBundle<T>(bundle: ResolvedExecutionBundle, run: () => Promise<T>) { return bundles.run(bundle, () => run()); }
export function runLegacyModelExecution<T>(run: () => Promise<T>) { return bundles.run(null, () => context.run(null, run)); }
export function runFrozenLegacyBilling<T>(billing:ConfigSnapshot,run:()=>Promise<T>){return legacyBilling.run(billing,()=>runLegacyModelExecution(run));}
