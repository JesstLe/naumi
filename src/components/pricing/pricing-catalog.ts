/** Customer-facing quote only. This module must never create payment orders. */
export type PricingPlan = {
  id: string;
  name: string;
  description: string;
  price: number;
  beans: number;
  featured?: boolean;
};

export const PRICING_PLANS: Record<"month" | "year", PricingPlan[]> = {
  month: [
    { id: "starter", name: "体验月包", description: "从第一组商品图开始", price: 29, beans: 190 },
    { id: "creator", name: "常用月包", description: "为日常上新与内容创作准备", price: 99, beans: 775, featured: true },
    { id: "studio", name: "批量月包", description: "适合多商品、多场景创作", price: 299, beans: 2500 },
  ],
  year: [
    { id: "team-year", name: "团队年包", description: "为持续创作做好年度规划", price: 1099, beans: 12000, featured: true },
    { id: "volume-year", name: "批量年包", description: "面向更高频的商品视觉产出", price: 4499, beans: 60000 },
  ],
};

export const PRICING_FAQS = [
  { question: "豆是什么？能生成多少张图？", answer: "豆是本页套餐方案中的创作额度单位。正式扣豆规则及其与现有账户额度的衔接将在开通前确认。可生成的张数取决于模型、尺寸和工具，本页暂不将套餐额度换算成出图张数。" },
  { question: "现在可以直接购买这些套餐吗？", answer: "本页为套餐报价预览，暂未开放在线购买。你可以通过「咨询开通」了解适合的方案。我们会在开通前确认价格、额度发放方式、有效期及退款条件；本页不会发起付款或自动续费。" },
  { question: "年包的豆会一次到账吗？会过期吗？", answer: "年包展示的是年度总额度，不代表一次性到账或每月固定发放。额度发放节奏、使用期限、未用额度处理和续费方式，以开通前双方确认的方案为准。" },
  { question: "2K、4K、5K 都是模型原生生成吗？", answer: "不是。它们是输出尺寸档位，当前流程可能在生成后进行放大处理。1K 沿用模型返回的尺寸；其他档位的目标长边分别为 2048、4096、5120 像素。实际输出取决于模型和任务结果，尺寸不等同于原生细节或独立质量档位。" },
  { question: "不同模型和工具的扣豆规则一样吗？", answer: "不一定。生图、视频、3D 服装和其他工具可能采用不同的消耗规则。页面的尺寸表只说明现有输出档位，不是新套餐的正式扣豆表；模型与工具以创作页实际可用项为准，操作前请查看消耗提示。" },
  { question: "团队年包包含多少席位？可以商用吗？", answer: "套餐名称表示适用的创作需求，不默认包含额外席位、共享账户或特定授权。席位、协作方式和商业使用条件需在开通前确认；你也需要确保上传素材及生成内容的使用符合相关权利要求。" },
];
