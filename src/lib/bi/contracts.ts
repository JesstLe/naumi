import { USER_POSITION_FILTERS } from "./positions";
export const BI_SECTIONS = [
  "overview",
  "users",
  "operations",
  "ledger",
  "artworks",
  "models",
  "calls",
  "conversations",
  "orders",
  "access",
  "management",
] as const;
export type BiSection = (typeof BI_SECTIONS)[number];
export type BiRow = Record<string, string | number | boolean | null>;
export type BiQuery = {
  recordId?: string;
  recordSource?: string;
  period?: 'range'|'all';
  section: BiSection;
  from: string;
  to: string;
  start: string;
  end: string;
  email: string;
  q: string;
  accountType: string;
  status: string;
  position: string;
  page: number;
  size: number;
};
export type BiOverview = {
  accounts: number;
  enterprises: number;
  activeUsers: number;
  consumed: number;
  refunded: number;
  available: number;
  reserved: number;
  artworks: number;
  deletedArtworks: number;
  tasks: number;
  failed: number;
  review: number;
  auditImages: number;
  downgradedImages: number;
  receivedCents: number;
  mockCents: number;
  daily: {
    date: string;
    consumed: number;
    refunded: number;
    artworks: number;
    receivedCents: number;
    mockCents: number;
  }[];
  models: BiRow[];
};
export type BiResponse = {
  section: BiSection;
  rows: BiRow[];
  total: number;
  page: number;
  size: number;
  generatedAt: string;
  overview?: BiOverview;
  query: Pick<BiQuery, "from" | "to">;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function date(raw: string) {
  if (
    !datePattern.test(raw) ||
    !Number.isFinite(Date.parse(`${raw}T00:00:00Z`)) ||
    new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) !== raw
  )
    throw new Error("日期无效");
  return raw;
}
export function parseBiQuery(
  params: URLSearchParams,
  now = new Date(),
): BiQuery {
  const today = new Date(now.getTime() + 8 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const to = date(params.get("to") || today);
  const from = date(
    params.get("from") ||
      new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400_000)
        .toISOString()
        .slice(0, 10),
  );
  const days = (Date.parse(to) - Date.parse(from)) / 86400_000;
  const section = params.get("section") || "overview";
  if (!(BI_SECTIONS as readonly string[]).includes(section))
    throw new Error("数据分类无效");
  const period=params.get('period')==='all'&&section!=='overview'?'all':'range';
  if(period==='range'&&(days<0||days>365))throw new Error("请选择不超过 366 天的有效日期范围");
  const recordSource=section==='operations'?(params.get('source')||''):'';
  if(!['','app_image_jobs','app_canvas_image_tasks','app_video_tasks'].includes(recordSource))throw new Error('任务来源无效');
  const accountType = params.get("accountType") || "";
  if (!["", "personal", "enterprise", "unknown"].includes(accountType))
    throw new Error("账户类型无效");
  const position = params.get("position") || "";
  if (!(USER_POSITION_FILTERS as readonly string[]).includes(position))
    throw new Error("岗位筛选无效");
  const number = (key: string, fallback: number, max: number) => {
    const raw = params.get(key);
    const value = raw === null ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > max)
      throw new Error("分页参数无效");
    return value;
  };
  return {
    recordId: (params.get("id") || "").trim().slice(0, 240),
    recordSource,
    period,
    section: section as BiSection,
    from,
    to,
    start: period==='all'?'-infinity':`${from}T00:00:00+08:00`,
    end: period==='all'?'infinity':`${new Date(Date.parse(`${to}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10)}T00:00:00+08:00`,
    email: (params.get("email") || "").trim().toLowerCase().slice(0, 254),
    q: (params.get("q") || "").trim().slice(0, 100),
    accountType,
    status: (params.get("status") || "").slice(0, 40),
    position,
    page: number("page", 1, 100_000),
    size: number("size", 30, 100),
  };
}

/** Spreadsheet programs must not interpret user content as executable formulas. */
export function biCsvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
