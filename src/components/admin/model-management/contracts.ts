import type {ModelManagementState} from "@/lib/model-config/management";
import type {CatalogEntry} from "@/lib/model-config/catalog-store";

export type State = ModelManagementState & { catalogs: CatalogEntry[] };

export type Operation = Record<string, unknown> & { action: string; id: string; expectedVersion: number };

// Retain the legacy key for persisted ambiguous publications.
export const endpoint = "/api/admin/model-management", pendingKey = "naumi:admin:mvp:pending";

export const types: Record<string, string> = { image: "图片", text: "文字", video: "视频" };
