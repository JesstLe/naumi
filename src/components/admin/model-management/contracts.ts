export type {ManagementState as State,ManagementOperation as Operation} from "@/lib/model-config/management-session-contract";

// Retain the legacy key for persisted ambiguous publications.
export const endpoint = "/api/admin/model-management", pendingKey = "naumi:admin:mvp:pending";

export const types: Record<string, string> = { image: "图片", text: "文字", video: "视频" };
