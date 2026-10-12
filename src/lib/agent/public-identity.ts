import "server-only";
import { getModelAdministration } from "../model-config/server";
import type { ModelExecutionScope } from "../model-config/context";
import type { AgentIdentity } from "./response-policy";

/** Only frozen public display metadata, never provider credentials or wire routing. */
export async function publicAgentIdentity(modelId: string, scope: ModelExecutionScope | null): Promise<AgentIdentity> {
  if (!scope) return { modelLabel: modelId };
  const snapshot = await (await getModelAdministration()).repo.byVersion(scope.frozen.modelVersion);
  const model = snapshot.config.publicModels.find(item => item.id === scope.frozen.publicModelId);
  // Current schema has no verified knowledge-cutoff field; never infer it from model names.
  return { modelLabel: model?.label || "当前配置模型" };
}
