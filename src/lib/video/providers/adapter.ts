import type { VideoProviderAdapter } from "@/lib/video/types";

// 适配器注册表(§4.2):按 providerId 取适配器。Phase 3 逐个补录
// Ark/Kling/Gemini/MiniMax/Workflow 适配器,这里保持单一事实源。

const REGISTRY = new Map<string, VideoProviderAdapter>();

export function registerVideoProvider(adapter: VideoProviderAdapter): void {
  REGISTRY.set(adapter.id, adapter);
}

export function getVideoProvider(providerId: string): VideoProviderAdapter | null {
  return REGISTRY.get(providerId) ?? null;
}

export function listVideoProviderIds(): string[] {
  return Array.from(REGISTRY.keys());
}
