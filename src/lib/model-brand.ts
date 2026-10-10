/** Presentation only: these identities never choose an upstream or change billing. */
export const MODEL_BRANDS = {
  openai: "OpenAI", google: "Google", gemini: "Gemini", "nano-banana": "Nano Banana",
  claude: "Claude", deepseek: "DeepSeek", qwen: "Qwen", grok: "Grok", kimi: "Kimi",
  doubao: "Doubao", jimeng: "Jimeng", minimax: "MiniMax", mistral: "Mistral",
  zhipu: "Zhipu", meta: "Meta", wenxin: "Wenxin", hunyuan: "Hunyuan",
} as const;
export type ModelBrand = keyof typeof MODEL_BRANDS;

/** Add deliberately branded, opaque public aliases here, not private upstream IDs. */
export const MODEL_BRAND_ALIASES: Readonly<Record<string, ModelBrand>> = {
  gpt6astra: "openai", gpt6sol: "openai", gpt6luna: "openai",
};

const RULES: ReadonlyArray<readonly [ModelBrand, RegExp]> = [
  ["nano-banana", /^(?:nano[\s_-]*banana(?:$|[\s_.\d-])|gemini-3(?:\.0)?-pro-image(?:$|-)|gemini-3\.1-flash-image(?:$|-))/],
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
