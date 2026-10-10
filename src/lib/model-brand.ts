/** Presentation only: these identities never choose an upstream or change billing. */
export const MODEL_BRANDS = {
  openai: "OpenAI", google: "Google", gemini: "Gemini", "nano-banana": "Nano Banana",
  claude: "Claude", deepseek: "DeepSeek", qwen: "Qwen", grok: "Grok", kimi: "Kimi",
  doubao: "Doubao", jimeng: "Jimeng", minimax: "MiniMax", mistral: "Mistral",
  zhipu: "Zhipu", meta: "Meta", wenxin: "Wenxin", hunyuan: "Hunyuan",
  bytedance: "ByteDance", flux: "FLUX", stability: "Stability AI", ideogram: "Ideogram",
  recraft: "Recraft", sora: "Sora", kling: "Kling", hailuo: "Hailuo", alibaba: "Alibaba",
  pixverse: "PixVerse", runway: "Runway", stepfun: "Stepfun", yi: "Yi", internlm: "InternLM",
  cohere: "Cohere", midjourney: "Midjourney",
} as const;
export type ModelBrand = keyof typeof MODEL_BRANDS;

/** Add deliberately branded, opaque public aliases here, not private upstream IDs. */
export const MODEL_BRAND_ALIASES: Readonly<Record<string, ModelBrand>> = {
  gpt6astra: "openai", gpt6sol: "openai", gpt6luna: "openai",
};

const RULES: ReadonlyArray<readonly [ModelBrand, RegExp]> = [
  ["nano-banana", /^(?:nano[\s_-]*banana(?:$|[\s_.\d-])|gemini-3(?:\.0)?-pro-image(?:$|-)|gemini-3\.1-flash-image(?:$|-))/],
  // Product rules precede parent-company rules. Wan/Seed use verified company marks.
  ["bytedance", /^(?:(?:doubao[\s_-]*)?seed(?:ream|ance)(?:$|[\s_.\d-])|byte[\s_-]*dance(?:$|[\s_/-])|字节跳动(?:$|[\s_.\d-]))/],
  ["flux", /^(?:flux|bfl|black[\s_-]*forest[\s_-]*labs)(?:$|[\s_/.\d-])/],
  ["stability", /^(?:stable[\s_-]*diffusion|stability(?:[\s_-]*ai)?|sdxl|sd[\s_-]*3)(?:$|[\s_/.\d-])/],
  ["ideogram", /^ideogram(?:$|[\s_.\d-])/],
  ["recraft", /^recraft(?:$|[\s_.\d-])/],
  ["sora", /^sora(?:$|[\s_.\d-])/],
  ["kling", /^(?:kling(?:[\s_-]*ai)?|(?:快手)?可灵)(?:$|[\s_.\d-])/],
  ["hailuo", /^(?:(?:minimax[\s_-]*)?hailuo|海螺)(?:$|[\s_.\d-])/],
  ["alibaba", /^(?:wanx?|wan[\s_-]*video|(?:通义)?万相|alibaba|aliyun)(?:$|[\s_/.\d-])/],
  ["pixverse", /^(?:pix[\s_-]*verse|爱诗)(?:$|[\s_.\d-])/],
  ["runway", /^(?:runway|gen[\s_-]*[34])(?:$|[\s_.\d-])/],
  ["stepfun", /^(?:stepfun|step|阶跃星辰)(?:$|[\s_.\d-])/],
  ["yi", /^(?:yi|01[\s_.-]*ai|零一万物)(?:$|[\s_.\d-])/],
  ["internlm", /^(?:intern[\s_-]*lm|书生)(?:$|[\s_.\d-])/],
  ["cohere", /^(?:cohere|command[\s_-]*[ra])(?:$|[\s_.\d-])/],
  ["midjourney", /^(?:midjourney|mj)(?:$|[\s_.\d-])/],
  ["openai", /^(?:gpt(?:[\s_-]*\d|[\s_-]+(?:image|oss)(?:$|[\s_.\d-]))|o\d+(?:$|[\s_.-])|chat[\s_-]*gpt(?:$|[\s_.\d-])|open[\s_-]*ai(?:$|[\s_/-])|naumi-image(?:$|-)|dall[\s_-]*e(?:$|[\s_.\d-]))/],
  ["gemini", /^(?:gemini|gemma)(?:$|[\s_.\d-])/],
  ["google", /^(?:google|imagen|veo)(?:$|[\s_/.\d-])/],
  ["claude", /^(?:claude(?:$|[\s_.\d-])|anthropic(?:$|[\s_/-]))/],
  ["deepseek", /^deep[\s_-]*seek(?:$|[\s_.\d-])/],
  ["qwen", /^(?:qwen|qwq|qvq|通义千问)(?:$|[\s_.\d-])/],
  ["grok", /^(?:grok|xai|x\.ai)(?:$|[\s_/.\d-])/],
  ["kimi", /^(?:kimi|moonshot)(?:$|[\s_/.\d-])/],
  ["doubao", /^(?:doubao|豆包)(?:$|[\s_.\d-])/],
  ["jimeng", /^(?:jimeng|dreamina|即梦)(?:$|[\s_.\d-])/],
  ["minimax", /^mini[\s_-]*max(?:$|[\s_.\d-])/],
  ["mistral", /^(?:mistral|mixtral)(?:$|[\s_.\d-])/],
  ["zhipu", /^(?:glm|zhipu|chatglm|智谱)(?:$|[\s_.\d-])/],
  ["meta", /^(?:llama|meta)(?:$|[\s_/.\d-])/],
  ["wenxin", /^(?:ernie|wenxin|文心)(?:$|[\s_.\d-])/],
  ["hunyuan", /^(?:hunyuan|混元)(?:$|[\s_.\d-])/],
];

function normalized(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[‐‑–—]/g, "-");
}
function infer(value: string): ModelBrand | null {
  const name = normalized(value);
  // Try the actual model token before its provider namespace: google/gemini != Google G.
  const tokens = name.includes("/") ? [name.slice(name.lastIndexOf("/") + 1), name] : [name];
  for (const token of tokens) {
    for (const [brand, pattern] of RULES) if (pattern.test(token)) return brand;
  }
  return null;
}

export function resolveModelBrand({ modelId, modelName, brand }: {
  modelId: string; modelName?: string; brand?: ModelBrand;
}): ModelBrand | null {
  if (brand && Object.prototype.hasOwnProperty.call(MODEL_BRANDS, brand)) return brand;
  const id = normalized(modelId);
  const alias = Object.prototype.hasOwnProperty.call(MODEL_BRAND_ALIASES, id) ? MODEL_BRAND_ALIASES[id] : null;
  return alias || infer(id) || (modelName ? infer(modelName) : null);
}
