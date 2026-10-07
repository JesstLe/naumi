import type { ModelConfig } from "@/lib/model-config/types";
export type ConfigurationChange = {
  field: string;
  before: string;
  after: string;
};
function values(config: ModelConfig) {
  const out = new Map<string, string>();
  const walk = (path: string, value: unknown) => {
    if (Array.isArray(value)) {
      if (value.every((v) => typeof v !== "object"))
        out.set(path, value.map(String).join(" → "));
      else
        value.forEach((v, i) =>
          walk(`${path}.${(v as { id?: string })?.id || i}`, v),
        );
    } else if (value && typeof value === "object")
      Object.entries(value).forEach(([key, v]) => walk(`${path}.${key}`, v));
    else if (value !== undefined)
      out.set(
        path,
        typeof value === "boolean" ? (value ? "是" : "否") : String(value),
      );
  };
  for (const section of [
    "providers",
    "upstreamModels",
    "publicModels",
    "pools",
    "bindings",
    "business",
    "fixedMonthlyCosts",
  ] as const)
    walk(section, config[section]);
  return out;
}
export function configurationChanges(
  before: ModelConfig,
  after: ModelConfig,
): ConfigurationChange[] {
  const a = values(before),
    b = values(after);
  return Array.from(new Set([...Array.from(a.keys()), ...Array.from(b.keys())]))
    .filter((key) => a.get(key) !== b.get(key))
    .map((field) => ({
      field,
      before: a.has(field) ? a.get(field) || "（空）" : "未设置",
      after: b.has(field) ? b.get(field) || "（空）" : "未设置",
    }));
}
