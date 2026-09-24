// ---------------------------------------------------------------------------
// BYOK 供应商预设模板(cc-switch 思路):新增供应商时一键预填 baseUrl/协议/示例模型。
// 纯常量无服务端依赖,前后端共用。预设只省打字——生图可用性仍由「测试并读取
// 模型」实测验证(部分中转站仅有对话模型、无生图模型)。
// ---------------------------------------------------------------------------

export type ImageProviderPreset = {
  key: string;
  name: string;
  baseUrl: string;
  protocol: "openai-images" | "chat-completions";
  /** 预填进「可用模型」的示例(仅为常见生图模型名,以测试连接结果为准)。 */
  sampleModels: string[];
  /** 获取 API Key 的入口,仅作展示。 */
  keyUrl?: string;
  note?: string;
};

export const IMAGE_PROVIDER_PRESETS: ImageProviderPreset[] = [
  {
    key: "openai",
    name: "OpenAI 官方",
    baseUrl: "https://api.openai.com/v1",
    protocol: "openai-images",
    sampleModels: ["gpt-image-2"],
    keyUrl: "https://platform.openai.com/api-keys",
    note: "官方标准 images 接口",
  },
  {
    key: "siliconflow",
    name: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    protocol: "openai-images",
    sampleModels: ["Kwai-Kolors/Kolors"],
    keyUrl: "https://cloud.siliconflow.cn/account/ak",
    note: "国内直连，Kolors 生图便宜",
  },
  {
    key: "zhipu",
    name: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    protocol: "openai-images",
    sampleModels: ["cogview-4"],
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    note: "CogView 系列",
  },
  {
    key: "dashscope",
    name: "阿里通义（百炼）",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    protocol: "openai-images",
    sampleModels: ["wanx2.1-t2i-turbo"],
    keyUrl: "https://bailian.console.aliyun.com/",
    note: "兼容模式端点，万相生图",
  },
  {
    key: "volcengine",
    name: "火山方舟",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    protocol: "openai-images",
    sampleModels: ["doubao-seedream-4-0"],
    keyUrl: "https://console.volcengine.com/ark",
    note: "豆包 Seedream 系列",
  },
  {
    key: "moonshot",
    name: "Moonshot Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    protocol: "chat-completions",
    sampleModels: ["kimi-latest"],
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
    note: "以对话接口为主，生图模型以实测为准",
  },
  {
    key: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    protocol: "chat-completions",
    sampleModels: ["deepseek-chat"],
    keyUrl: "https://platform.deepseek.com/api_keys",
    note: "对话模型为主，通常无生图",
  },
  {
    key: "302ai",
    name: "302.AI",
    baseUrl: "https://api.302.ai/v1",
    protocol: "openai-images",
    sampleModels: ["gpt-image-2", "nano-banana-pro"],
    keyUrl: "https://platform.302.ai/",
    note: "聚合中转，生图模型多",
  },
  {
    key: "aihubmix",
    name: "AIHubMix",
    baseUrl: "https://aihubmix.com/v1",
    protocol: "openai-images",
    sampleModels: ["gpt-image-1"],
    keyUrl: "https://aihubmix.com/",
    note: "聚合中转",
  },
  {
    key: "ohmygpt",
    name: "OhMyGPT",
    baseUrl: "https://api.ohmygpt.com/v1",
    protocol: "openai-images",
    sampleModels: ["gpt-image-2"],
    keyUrl: "https://www.ohmygpt.com/",
    note: "聚合中转",
  },
  {
    key: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    protocol: "openai-images",
    sampleModels: ["openai/gpt-image-1"],
    keyUrl: "https://openrouter.ai/keys",
    note: "国外聚合，需国际网络",
  },
  {
    key: "custom",
    name: "自定义 / 其他中转",
    baseUrl: "",
    protocol: "chat-completions",
    sampleModels: [],
    note: "任何 OpenAI 兼容接口：填到 /v1 为止",
  },
];
