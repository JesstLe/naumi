import type { VideoProviderAdapter } from "@/lib/video/types";
import { configuredVideoProviders } from "@/lib/video/providers/config";
import { createDirectVideoAdapter } from "@/lib/video/providers/direct";
import { openAiVideosAdapter } from "@/lib/video/providers/openai-videos";

// 适配器注册表(§4.2):按 providerId 取适配器。Phase 3 逐个补录
// Ark/Kling/Gemini/MiniMax/Workflow 适配器,这里保持单一事实源。

const REGISTRY = new Map<string, VideoProviderAdapter>();
let initialized = false;

function ensureProviders(): void {
  if (initialized) return;
  initialized = true;
  for (const cfg of configuredVideoProviders()) {
    const adapter = cfg.protocol === "openai-videos"
      ? openAiVideosAdapter
      : createDirectVideoAdapter(cfg.id);
    if (adapter) REGISTRY.set(cfg.id, adapter);
  }
}

export function registerVideoProvider(adapter: VideoProviderAdapter): void {
  ensureProviders();
  REGISTRY.set(adapter.id, adapter);
}

export function getVideoProvider(providerId: string): VideoProviderAdapter | null {
  ensureProviders();
  return REGISTRY.get(providerId) ?? null;
}

export function listVideoProviderIds(): string[] {
  ensureProviders();
  return Array.from(REGISTRY.keys());
}
