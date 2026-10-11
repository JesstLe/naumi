import type { ModelConfig } from "../src/lib/model-config/types";
export function fixtureModelConfig(baseUrl: string, credentialRef: string): ModelConfig {
  return { schemaVersion: 1 as const,
    providers: [{ id: "p1", name: "Fixture supplier", protocol: "openai-images" as const, baseUrl, credentialRef, enabled: true, timeoutMs: 120000, maxConcurrent: 4 }],
    upstreamModels: [{ id: "u1", providerId: "p1", model: "wire-image-one", label: "测试上游", modality: "image" as const, enabled: true,
      capabilities: { verified: true, generate: true, edit: true, vision: false, preserveIdentity: false, textAccuracy: false, transparent: false, qualityRank: 3, qualities: ["medium", "high"], nativeResolutions: ["1K", "2K"], maxReferenceImages: 4, expectedLatencyMs: 30000 }, parameterMap: { resolution: { "2K": "2048x2048" } }, costRef: "supplier-cost-estimate" }],
    publicModels: [{ id: "image-a", label: "测试生图", modality: "image" as const, enabled: true, visible: true, target: { type: "upstream" as const, id: "u1" } }],
    pools: [], bindings: { "image.generate": "image-a", "image.edit": "image-a" } };
}
