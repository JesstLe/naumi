// Mirrors the API request contract; never silently trim or truncate a draft.
export const PACKAGING_LIMITS = { brief: 2000, answers: 4000, feedback: 2000 } as const;

export const BRIEF_STEPS = [
  { key: "brand", title: "品牌与产品", short: "品牌", prompt: "这次为哪个品牌、什么产品设计包装？", hint: "品牌名、产品名、品类、主要 SKU", placeholder: "例如：山间来信，原叶冷泡茶，茉莉 / 乌龙 / 红茶三款。" },
  { key: "task", title: "项目任务", short: "任务", prompt: "这次包装最需要解决什么问题？", hint: "新品上市、包装升级或产品线扩展", placeholder: "例如：新品上市；让消费者在货架上快速看懂这是冷泡茶，而不是茶饮料。" },
  { key: "audience", title: "目标消费者", short: "人群", prompt: "谁会购买，又会在什么场景使用？", hint: "购买者、使用者、场景和关键顾虑", placeholder: "例如：25—35 岁城市上班族，办公室冷泡；担心口味寡淡、操作麻烦。" },
  { key: "reasons", title: "购买理由", short: "卖点", prompt: "消费者为什么选它？有哪些事实支撑？", hint: "1—3 个核心卖点及配方、工艺、产地等依据", placeholder: "例如：独立茶包，原叶茶；原料与工艺以现有产品资料为准。未经检测的功效不作宣称。" },
  { key: "impression", title: "品牌印象", short: "印象", prompt: "希望消费者记住哪三个感受？", hint: "写下直觉即可，策略会把它转成设计语言", placeholder: "例如：清新、从容、可信。" },
  { key: "priceChannels", title: "价格与渠道", short: "渠道", prompt: "卖多少钱，在哪里卖？", hint: "价格带、销售地区和主要渠道", placeholder: "例如：39 元 / 盒，中国大陆，天猫旗舰店与精品超市。" },
  { key: "competition", title: "竞争关系", short: "竞品", prompt: "消费者还会比较谁？你想有什么不同？", hint: "直接或间接竞品、希望形成的差异", placeholder: "可填写具体品牌，也可以描述现有同类包装；不确定可留空。" },
  { key: "constraints", title: "包装范围与限制", short: "限制", prompt: "哪些内容需要保留，哪些条件不能改变？", hint: "形态、规格、SKU、材质、成本和生产限制", placeholder: "例如：纸盒装，10 袋 / 盒，三款口味；沿用现有盒型和品牌标志，不增加特殊印刷工艺。" },
] as const;

export type BriefKey = (typeof BRIEF_STEPS)[number]["key"];
export type PackagingBrief = Record<BriefKey, string>;
export type PackagingResult = { kind: "questions"; questions: string[] } | { kind: "strategy"; content: string };
export type PackagingProject = {
  id: string;
  title: string;
  brief: PackagingBrief;
  result: PackagingResult | null;
  revision: number;
  updatedAt: string;
};
export type ProjectSummary = Pick<PackagingProject, "id" | "title" | "revision" | "updatedAt">;
export type LocalDraft = { brief: PackagingBrief; project: PackagingProject | null; step: number; answers: string; feedback: string };

export function emptyBrief(): PackagingBrief {
  return { brand: "", task: "", audience: "", reasons: "", impression: "", priceChannels: "", competition: "", constraints: "" };
}

export const EXAMPLE_BRIEF: PackagingBrief = {
  brand: "山间来信 · 原叶冷泡茶，茉莉、乌龙、红茶三款，10 袋 / 盒。",
  task: "新品上市。包装需要让消费者快速识别冷泡茶品类，并区分三种口味。",
  audience: "25—35 岁城市上班族，在办公室和通勤途中饮用；关心冲泡是否方便、口味是否清爽。",
  reasons: "独立茶包，便于携带；使用原叶茶。具体产地与冲泡时长待产品资料确认，不宣称减脂等功效。",
  impression: "清新、从容、可信。",
  priceChannels: "39 元 / 盒；中国大陆；天猫旗舰店与精品超市。",
  competition: "与常见的花果茶和即饮茶形成区分；希望产品名称比装饰图形更容易辨认。具体竞品尚未确定。",
  constraints: "沿用现有纸盒盒型与品牌标志；三款口味统一规格，未来可扩展；不增加特殊印刷工艺。",
};

export function completedFields(brief: PackagingBrief): number {
  return BRIEF_STEPS.filter(({ key }) => brief[key].trim().length > 0).length;
}

export function sameBrief(a: PackagingBrief, b: PackagingBrief): boolean {
  return BRIEF_STEPS.every(({ key }) => a[key] === b[key]);
}

export function parseBrief(value: unknown): PackagingBrief | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  if (!BRIEF_STEPS.every(({ key }) => typeof object[key] === "string" && object[key].length <= PACKAGING_LIMITS.brief)) return null;
  return Object.fromEntries(BRIEF_STEPS.map(({ key }) => [key, object[key]])) as PackagingBrief;
}

export function parseProject(value: unknown): PackagingProject | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const brief = parseBrief(object.brief);
  if (!brief || typeof object.id !== "string" || typeof object.title !== "string" || typeof object.updatedAt !== "string" || !Number.isInteger(object.revision) || (object.revision as number) < 1) return null;
  const result = object.result as Record<string, unknown> | null;
  if (result !== null && (!result || (result.kind !== "strategy" && result.kind !== "questions"))) return null;
  if (result?.kind === "strategy" && typeof result.content !== "string") return null;
  if (result?.kind === "questions" && (!Array.isArray(result.questions) || result.questions.length > 3 || !result.questions.every((q) => typeof q === "string"))) return null;
  return { id: object.id, title: object.title, brief, result: result as PackagingResult | null, revision: object.revision as number, updatedAt: object.updatedAt };
}

export function parseLocalDraft(raw: string | null): LocalDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const brief = parseBrief(value.brief);
    const project = value.project === null ? null : parseProject(value.project);
    if (!brief || (value.project !== null && !project)) return null;
    if (typeof value.answers === "string" && value.answers.length > PACKAGING_LIMITS.answers) return null;
    if (typeof value.feedback === "string" && value.feedback.length > PACKAGING_LIMITS.feedback) return null;
    return {
      brief, project,
      step: typeof value.step === "number" && Number.isInteger(value.step) ? Math.max(0, Math.min(7, value.step)) : 0,
      answers: typeof value.answers === "string" ? value.answers : "",
      feedback: typeof value.feedback === "string" ? value.feedback : "",
    };
  } catch { return null; }
}

export function draftStorageKey(email: string): string {
  return `naumi:packaging-strategy:v1:${email.trim().toLowerCase()}`;
}

export function exportFilename(title: string): string {
  return `${(title || "品牌包装策略").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 80)}.md`;
}
