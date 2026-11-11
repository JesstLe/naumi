export const WORKSPACE_VIEWS = [
  { id: "models", label: "模型" },
  { id: "suppliers", label: "供应商" },
  { id: "pricing", label: "定价" },
  { id: "runtime", label: "运行" },
] as const;
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number]["id"];
export function workspaceView(value?: string | null): WorkspaceView {
  return value === "sources" ? "suppliers" : WORKSPACE_VIEWS.some(view => view.id === value) ? value as WorkspaceView : "models";
}
export function workspaceLocation(view: WorkspaceView, model?: string) {
  const query = new URLSearchParams();
  if (view !== "models") query.set("view", view);
  if (model) query.set("model", model);
  return `/admin/model-management${query.size ? `?${query}` : ""}`;
}
