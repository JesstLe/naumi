/** Tool-specific result contracts. A malformed response is not a business conclusion. */
export class ToolTextResultError extends Error {
  readonly code = "INVALID_TOOL_TEXT_RESULT";
  constructor(readonly tool: "ipcheck" | "title-gen") {
    super(tool === "ipcheck" ? "检测结果格式异常，尚未形成有效结论" : "标题生成结果格式异常");
    this.name = "ToolTextResultError";
  }
}

function resultObject(raw: unknown, tool: ToolTextResultError["tool"]): Record<string, unknown> {
  if (typeof raw !== "string" || raw.length > 262144) throw new ToolTextResultError(tool);
  let text = raw.replace(/^\uFEFF/, "").trim();
  // Some compatible text APIs wrap the entire JSON in a markdown fence even
  // with response_format. Only unwrap a complete fence, never extract a guess.
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  if (fenced) text = fenced[1].trim();
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new ToolTextResultError(tool); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ToolTextResultError(tool);
  return value as Record<string, unknown>;
}

export type IpCheckResult = {
  risk: "high" | "medium" | "low";
  riskLabel: string;
  summary: string;
  items: { name: string; reason: string }[];
  advice: string;
};
const riskLabels = { high: "高风险", medium: "中风险", low: "低风险" } as const;

export function parseIpCheckResult(raw: unknown): IpCheckResult {
  const value = resultObject(raw, "ipcheck");
  if (!(value.risk === "high" || value.risk === "medium" || value.risk === "low") ||
      typeof value.summary !== "string" || !value.summary.trim() || !Array.isArray(value.items) ||
      value.items.length > 64 || (value.advice !== undefined && typeof value.advice !== "string")) {
    throw new ToolTextResultError("ipcheck");
  }
  const items = value.items.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ToolTextResultError("ipcheck");
    const entry = item as Record<string, unknown>;
    if (typeof entry.name !== "string" || !entry.name.trim() || typeof entry.reason !== "string" || !entry.reason.trim()) {
      throw new ToolTextResultError("ipcheck");
    }
    return { name: entry.name.trim(), reason: entry.reason.trim() };
  });
  return { risk: value.risk, riskLabel: riskLabels[value.risk], summary: value.summary.trim(), items,
    advice: typeof value.advice === "string" ? value.advice.trim() : "" };
}

export function parseTitleResult(raw: unknown): { titles: string[]; sellingPoints: string[] } {
  const value = resultObject(raw, "title-gen");
  const strings = (input: unknown, maximum: number) => Array.isArray(input)
    ? input.filter((item): item is string => typeof item === "string" && !!item.trim()).map(item => item.trim()).slice(0, maximum)
    : [];
  const titles = strings(value.titles, 12);
  if (!titles.length) throw new ToolTextResultError("title-gen");
  return { titles, sellingPoints: strings(value.sellingPoints, 8) };
}
