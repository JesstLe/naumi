import type { z } from "zod";
import type { modelConfigSchema } from "./schema";
export type Modality = "image" | "text" | "video";
export type ModelConfig = z.infer<typeof modelConfigSchema>;
export type ModelProvider = ModelConfig["providers"][number];
export type UpstreamModel = ModelConfig["upstreamModels"][number];
export type PublicModel = ModelConfig["publicModels"][number];
export type ModelPool = ModelConfig["pools"][number];
export type ModelSnapshot = { version: number; digest: string; config: ModelConfig };
export type ModelDraft = { id: string; revision: number; basedOnVersion: number; config: ModelConfig };
export type ModelFacts = { imagegenRequirements?:import("../imagegen/types").Intent; task: "draft" | "product" | "detail" | "layout"; quality: string; resolution: string; requestedResolution?: string; ratio?: string; needsEdit: boolean; needsMask?: boolean; preserveIdentity: boolean; needsText: boolean; nativeResolution: boolean; references: number; quantity?: number; inputLength?: number };
export type PublicationPhase = "staged" | "preparing" | "activating" | "applied" | "failed" | "unknown";
export type ModelPublication = { id: string; version: number; digest: string; phase: PublicationPhase; errorCode?: string };
export type ModelVersionSummary = ModelPublication & { actor: string; reason: string; createdAt: string };
export type StageInput = { id: string; draftId: string; expectedRevision: number; expectedVersion: number; actor: string; reason: string };
export type RestoreInput = { id: string; targetVersion: number; expectedVersion: number; actor: string; reason: string };
export interface ModelConfigRepository {
  current(): Promise<ModelSnapshot>;
  byVersion(version: number): Promise<ModelSnapshot>;
  draft(actor: string): Promise<ModelDraft>;
  saveDraft(input: { id: string; expectedRevision: number; config: ModelConfig; actor: string }): Promise<ModelDraft>;
  stage(input: StageInput): Promise<ModelPublication>;
  stageRestore(input: RestoreInput): Promise<ModelPublication>;
  publication(id: string): Promise<ModelPublication>;
  history(limit: number): Promise<ModelVersionSummary[]>;
  markApplied(id: string, digest: string): Promise<ModelSnapshot>;
  setPhase(id: string, phase: Exclude<PublicationPhase, "applied">, errorCode?: string): Promise<ModelPublication>;
}
export class ModelConfigError extends Error {
  constructor(public code: string, message: string, public status = 400, public fields: string[] = []) { super(message); this.name = "ModelConfigError"; }
}
