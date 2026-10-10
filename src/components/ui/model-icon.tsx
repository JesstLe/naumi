"use client";

import { Sparkles } from "lucide-react";
import { resolveModelBrand, type ModelBrand } from "@/lib/model-brand";
import {
  OpenAIMono, GoogleColor, GeminiMono, NanoBananaColor, ClaudeColor, DeepSeekColor,
  QwenColor, GrokMono, KimiMono, DoubaoColor, JimengColor, MinimaxMono, MistralMono,
  ZhipuMono, MetaMono, WenxinMono, HunyuanMono,
} from "./model-brand-icons";

/** Exhaustive local registry. Unknown identities keep the neutral icon. */
const BRAND_ICONS: Record<ModelBrand, (props: { size: number }) => JSX.Element> = {
  openai: OpenAIMono, google: GoogleColor, gemini: GeminiMono, "nano-banana": NanoBananaColor,
  claude: ClaudeColor, deepseek: DeepSeekColor, qwen: QwenColor, grok: GrokMono, kimi: KimiMono,
  doubao: DoubaoColor, jimeng: JimengColor, minimax: MinimaxMono, mistral: MistralMono,
  zhipu: ZhipuMono, meta: MetaMono, wenxin: WenxinMono, hunyuan: HunyuanMono,
};

export function ModelIcon({ modelId, modelName, brand, size = 16 }: {
  modelId: string; modelName?: string; brand?: ModelBrand; size?: number;
}) {
  const identity = resolveModelBrand({ modelId, modelName, brand });
  const Icon = identity ? BRAND_ICONS[identity] : null;
  return (
    <span aria-hidden="true" data-model-brand={identity || "unknown"}
      className="inline-flex flex-none items-center justify-center" style={{ width: size, height: size }}>
      {Icon ? <Icon size={size} /> : <Sparkles aria-hidden size={size} strokeWidth={1.8} className="flex-none" />}
    </span>
  );
}
