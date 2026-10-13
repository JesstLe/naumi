"use client";

import { Sparkles } from "lucide-react";
import { resolveModelBrand, type ModelBrand } from "@/lib/model-brand";
import {
  OpenAIMono, GoogleColor, GeminiColor, NanoBananaColor, ClaudeColor, DeepSeekColor,
  QwenColor, GrokMono, KimiColor, DoubaoColor, JimengColor, MinimaxColor, MistralColor,
  ZhipuColor, MetaColor, WenxinColor, HunyuanColor,
  ByteDanceColor, FluxMono, StabilityColor, IdeogramMono, RecraftMono, SoraColor,
  KlingColor, HailuoColor, AlibabaColor, PixVerseColor, RunwayMono, StepfunMono,
  YiColor, InternLMColor, CohereColor, MidjourneyMono,
} from "./model-brand-icons";

/** Exhaustive local registry. Unknown identities keep the neutral icon. */
const BRAND_ICONS: Record<ModelBrand, (props: { size: number }) => React.JSX.Element> = {
  openai: OpenAIMono, google: GoogleColor, gemini: GeminiColor, "nano-banana": NanoBananaColor,
  claude: ClaudeColor, deepseek: DeepSeekColor, qwen: QwenColor, grok: GrokMono, kimi: KimiColor,
  doubao: DoubaoColor, jimeng: JimengColor, minimax: MinimaxColor, mistral: MistralColor,
  zhipu: ZhipuColor, meta: MetaColor, wenxin: WenxinColor, hunyuan: HunyuanColor,
  bytedance: ByteDanceColor, flux: FluxMono, stability: StabilityColor, ideogram: IdeogramMono,
  recraft: RecraftMono, sora: SoraColor, kling: KlingColor, hailuo: HailuoColor, alibaba: AlibabaColor,
  pixverse: PixVerseColor, runway: RunwayMono, stepfun: StepfunMono, yi: YiColor,
  internlm: InternLMColor, cohere: CohereColor, midjourney: MidjourneyMono,
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
