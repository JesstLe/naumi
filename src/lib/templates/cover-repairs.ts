import repairs from "./cover-repairs.json";
import type { TemplateCover } from "./cover-layout";

type CoverRepair = { source: string; image: string; width: number; height: number };
const records: Record<string, CoverRepair> = repairs;
const byImage = new Map(Object.values(records).map(record => [record.image, record]));

/** Restore only a verified original case, not an administrator's replacement. */
export function repairedTemplateCover(id: string, source: string): string | undefined {
  const record = records[id];
  return record?.source === source ? record.image : undefined;
}

export function bundledTemplateCover(image: string): TemplateCover | undefined {
  const record = byImage.get(image);
  return record ? { source: image, width: record.width, height: record.height } : undefined;
}
