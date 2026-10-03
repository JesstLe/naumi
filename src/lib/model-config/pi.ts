import "server-only";
import type { ModelExecutionScope } from "./context";
import { modelEndpointFetch } from "./transport";

/** Each instance closes over one immutable account; running streams never re-read mutable settings. */
export async function configuredPiModels(scope: ModelExecutionScope) {
  const [{ createModels, createProvider }, { openAICompletionsApi }] = await Promise.all([import("@earendil-works/pi-ai"), import("@earendil-works/pi-ai/api/openai-completions.lazy")]);
  const { connection: c, capabilities, frozen } = scope;
  const models = createModels();
  models.setProvider(createProvider({ id: "naumi-relay", name: "Naumi", baseUrl: c.baseUrl,
    auth: { apiKey: { name: "Model credential", resolve: async () => ({ auth: { apiKey: c.apiKey } }) } },
    models: [{ id: c.wireModel, name: frozen.publicModelId, api: "openai-completions", provider: "naumi-relay", baseUrl: c.baseUrl,
      reasoning: false, input: capabilities.vision ? ["text", "image"] : ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 }], api: openAICompletionsApi() }));
  return { models, wireModel: c.wireModel,
    stamp: `${frozen.modelVersion}:${frozen.credentialRef}:${frozen.publicModelId}`,
    fetch: modelEndpointFetch(c.baseUrl, { trustedOrigins: (process.env.MODEL_CONFIG_TRUSTED_ORIGINS || "").split(/[\s,]+/).filter(Boolean) }, c) };
}
