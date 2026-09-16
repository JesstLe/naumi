import { z } from "zod";

export const regionSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().max(80),
  kind: z.enum(["color", "text", "product", "component", "background"]),
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().min(0.002).max(1), height: z.number().min(0.002).max(1),
  instruction: z.string().max(1500),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  enabled: z.boolean(),
}).refine(r => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001, "选区超出图片");
export const regionsSchema = z.array(regionSchema).max(20).refine(
  rs => new Set(rs.map(r => r.id)).size === rs.length, "选区 ID 重复",
);
export type CompetitorRegion = z.infer<typeof regionSchema>;
export type CompetitorVersion = {
  id: string; image: string; kind: "replicate" | "edit"; parent: string;
  prompt: string; regions: CompetitorRegion[]; createdAt: string;
};
export type CompetitorItem = {
  id: string; batchId: string; path: string; image: string;
  width: number; height: number; prompt: string; regions: CompetitorRegion[];
  versions: CompetitorVersion[]; activeVersion: string; revision: number;
  busy: boolean; createdAt: string;
};
export const draftSchema = z.object({
  revision: z.number().int().nonnegative(),
  prompt: z.string().max(8000), regions: regionsSchema,
  activeVersion: z.string().max(80),
});
export const actionSchema = draftSchema.extend({
  action: z.enum(["analyze", "replicate", "edit"]),
  productId: z.string().uuid().optional(),
  degree: z.enum(["layout", "style"]).default("layout"),
});
export function currentImage(item: CompetitorItem): string {
  return item.versions.find(v => v.id === item.activeVersion)?.image || item.image;
}
export function normalizeImportPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  if (!path || path.length > 600 || parts.some(p => !p || p === "." || p === ".." || /[\x00-\x1f]/.test(p))) {
    throw new Error("文件路径无效");
  }
  return parts.join("/");
}
export const REGION_LABELS: Record<CompetitorRegion["kind"], string> = {
  color: "颜色", text: "文字", product: "产品", component: "组件", background: "背景",
};

/** crypto.randomUUID requires HTTPS; self-hosted IP deployments may still use HTTP. */
export function competitorClientId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
