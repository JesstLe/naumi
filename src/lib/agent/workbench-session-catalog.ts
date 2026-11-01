import type { WorkbenchAccountOwner, WorkbenchSessionSummary, WorkbenchTransport } from "./workbench-contract";

export type WorkbenchCatalogContext = WorkbenchTransport & {
  ready: boolean;
  setSessions(change: WorkbenchSessionSummary[] | ((previous: WorkbenchSessionSummary[]) => WorkbenchSessionSummary[])): void;
  setLoading(change: boolean | ((previous: boolean) => boolean)): void;
  setError(value: string | null): void;
  sessionId(): string;
  setTitle(value: string): void;
  deletedCurrent(): void;
};

/** Owns list observation and mutations, not a second copy of the visible rows.
 * Successful mutations retire older reads, including already parsed bodies. */
export function createWorkbenchSessionCatalog(account: WorkbenchAccountOwner) {
  let revision = 0;
  let read: AbortController | null = null;
  function cancel() {
    revision += 1;
    read?.abort();
    read = null;
  }
  async function refresh(context: WorkbenchCatalogContext) {
    const scope = account.current();
    if (!context.ready || !account.owns(scope) || !scope.account) return;
    cancel();
    const controller = new AbortController(), capturedRevision = revision;
    read = controller;
    const current = () => account.owns(scope) && revision === capturedRevision && !controller.signal.aborted;
    context.setLoading(previous => current() ? true : previous);
    try {
      const headers = await context.headers();
      if (!current()) return;
      const response = await context.request("/api/agent/session", { headers, signal: controller.signal, cache: "no-store" });
      if (!response.ok || !current()) {
        await response.body?.cancel().catch(() => {});
        if (current()) throw new Error("Session list read failed");
        return;
      }
      const data = await response.json();
      if (!current()) return;
      context.setSessions(previous => current() ? (data.sessions ?? []) as WorkbenchSessionSummary[] : previous);
    } catch {
      if (current()) context.setError("历史会话列表读取失败，请重试");
    } finally {
      if (current()) {
        read = null;
        context.setLoading(previous => current() ? false : previous);
      }
    }
  }
  async function rename(id: string, title: string, context: WorkbenchCatalogContext): Promise<boolean> {
    const clean = title.trim().replace(/\s+/g, " ");
    const scope = account.current();
    if (!clean || !account.owns(scope)) return false;
    try {
      const headers = await context.headers();
      if (!account.owns(scope)) return false;
      const response = await context.request("/api/agent/session", {
        method: "PATCH", headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ id, title: clean }),
      });
      if (!account.owns(scope)) { await response.body?.cancel().catch(() => {}); return false; }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (account.owns(scope)) context.setError(data.error || "会话重命名失败");
        return false;
      }
      await response.body?.cancel().catch(() => {});
      if (!account.owns(scope)) return false;
      cancel();
      context.setLoading(previous => account.owns(scope) && !read ? false : previous);
      context.setSessions(previous => account.owns(scope) ? previous.map(session => session.id === id ? { ...session, title: clean } : session) : previous);
      if (id === context.sessionId()) context.setTitle(clean);
      return true;
    } catch {
      if (account.owns(scope)) context.setError("会话重命名失败");
      return false;
    }
  }
  async function remove(id: string, context: WorkbenchCatalogContext) {
    const scope = account.current();
    if (!account.owns(scope)) return;
    try {
      const headers = await context.headers();
      if (!account.owns(scope)) return;
      const response = await context.request(`/api/agent/session?id=${encodeURIComponent(id)}`, { method: "DELETE", headers });
      if (!account.owns(scope)) { await response.body?.cancel().catch(() => {}); return; }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (account.owns(scope)) context.setError(data.error || "会话删除失败");
        return;
      }
      await response.body?.cancel().catch(() => {});
      if (!account.owns(scope)) return;
      cancel();
      context.setLoading(previous => account.owns(scope) && !read ? false : previous);
      context.setSessions(previous => account.owns(scope) ? previous.filter(session => session.id !== id) : previous);
      if (id === context.sessionId()) context.deletedCurrent();
    } catch {
      if (account.owns(scope)) context.setError("会话删除失败");
    }
  }
  return { refresh, rename, remove, cancel };
}
