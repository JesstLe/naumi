/** Owner-facing usage is measured activity, not an employee performance score. */
export const USAGE_SORTS = ["consumed", "delivered", "tasks", "activeDays", "modelCalls"] as const;
export type UsageSort = (typeof USAGE_SORTS)[number];
export type UsageQuery = {
  from: string; to: string; start: string; end: string; email: string;
  tenantId: string; q: string; page: number; size: number; sort: UsageSort;
};
export type UsageMetrics = {
  tasks: number; delivered: number; uploads: number; imports: number;
  storedArtworks: number; deletedArtworks: number; unattributedArtworks: number;
  consumed: number; refunded: number; netCredits: number; administrativeDebits: number;
  activeUsers: number; activeDays: number; modelCalls: number;
  inputTokens: number | null; outputTokens: number | null; tokenSamples: number;
  creditsPerDelivered: number | null; deliveriesPerActiveDay: number | null;
  tasksPerActiveDay: number | null;
};
export type UsageUser = UsageMetrics & {
  email: string; name: string; company: string; tenantId: string | null;
  role: string; lastActivityAt: string | null;
};
export type UsageDay = {
  date: string; tasks: number; delivered: number; uploads: number;
  consumed: number; refunded: number; activeUsers: number;
};
export type UsageResponse = {
  generatedAt: string;
  query: Pick<UsageQuery, "from" | "to" | "email" | "tenantId" | "q" | "sort">;
  summary: UsageMetrics; daily: UsageDay[]; users: UsageUser[];
  total: number; page: number; size: number;
  tenants: { id: string; name: string }[];
  coverage: {
    sources: { key: string; label: string; available: boolean; records: number }[];
    notes: string[]; historyFrom: string | null;
  };
  definitions: { key: string; label: string; formula: string }[];
};
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function parseUsageQuery(params: URLSearchParams, now = new Date()): UsageQuery {
  const today = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  const to = params.get("to") || today;
  if (!validDate(to)) throw new Error("结束日期无效");
  const from = params.get("from") || new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400_000).toISOString().slice(0, 10);
  if (!validDate(from)) throw new Error("开始日期无效");
  const days = (Date.parse(to) - Date.parse(from)) / 86400_000;
  if (days < 0 || days > 365) throw new Error("请选择不超过 366 天的日期范围，历史数据可按年度查询");
  const tenantId = (params.get("tenantId") || params.get("enterpriseId") || "").trim();
  if (tenantId && !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(tenantId)) throw new Error("企业参数无效");
  const sort = params.get("sort") || "consumed";
  if (!(USAGE_SORTS as readonly string[]).includes(sort)) throw new Error("排序参数无效");
  const integer = (key: string, fallback: number, max: number) => {
    const raw = params.get(key), value = raw === null ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error("分页参数无效");
    return value;
  };
  return { from, to, start: `${from}T00:00:00+08:00`,
    end: `${new Date(Date.parse(`${to}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10)}T00:00:00+08:00`,
    email: (params.get("email") || "").trim().toLowerCase().slice(0, 254), tenantId,
    q: (params.get("q") || "").trim().slice(0, 100), sort: sort as UsageSort,
    page: integer("page", 1, 100_000), size: integer("size", 30, 100) };
}
export const USAGE_DEFINITIONS: UsageResponse["definitions"] = [
  { key: "tasks", label: "生成任务", formula: "图片、画布图片工具和视频的提交记录；有同账号父任务精确依据的 imagegen 子任务不重复计数。" },
  { key: "delivered", label: "生成交付", formula: "期间保存的完成态图片或视频作品，有明确服务端生成来源或同账号任务关联；上传、导入、复制不计，后来删除的已保存作品仍计。" },
  { key: "activeDays", label: "活跃人日", formula: "每个账号有生成任务、作品保存、模型调用或实际消费的北京时间日期去重后求和；不是在线工时。" },
  { key: "deliveriesPerActiveDay", label: "每活跃人日产出", formula: "生成交付数 ÷ 活跃人日；无活跃记录时为空。不代表采纳率、质量或节省工时。" },
  { key: "consumed", label: "实际消费积分", formula: "期间 consume 类型的负数账本金额绝对值，排除有明确依据的管理员扣减；不以报价或预占替代；退款单列。" },
  { key: "creditsPerDelivered", label: "每份产出积分", formula: "期间实际消费积分 ÷ 期间生成交付数；是期间整体使用强度，不是逐作品成本或人民币成本。" },
  { key: "tokenSamples", label: "Token 记录覆盖", formula: "同时记录输入及输出 Token 的模型调用样本；仅这些样本累加 Token，缺失记录显示为空。" },
];
