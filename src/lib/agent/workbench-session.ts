/** Browser application owner for observing an existing Agent session.
 * It owns observer identity, account epochs and read-only continuation, not the
 * backend task. Detaching observation never cancels or resubmits paid work. */
export type WorkbenchMessage = {
  role: "user" | "assistant";
  content: string;
  steps?: { tool: string; summary: string }[];
  pending?: boolean;
};
type SavedStep = { type?: string; tool?: string; summary?: string; items?: string[] };
export type WorkbenchAccountScope = { readonly account: string; active: boolean };
type Observation = {
  id: string;
  generation: number;
  scope: WorkbenchAccountScope;
  controller: AbortController;
  phase: "loading" | "observing" | "settled" | "unavailable";
  installed: boolean;
  previousUnavailable: boolean;
};

/** The view supplies authenticated transport and projects the owner's decisions.
 * Callback updates retain their original current-observer guards because React
 * can defer them until after another account or session has been selected. */
export type WorkbenchRecoveryContext = {
  ready: boolean;
  busy: boolean;
  unavailable: boolean;
  sessionId(): string;
  headers(): Promise<HeadersInit>;
  request: typeof fetch;
  setMessages(change: WorkbenchMessage[] | ((previous: WorkbenchMessage[]) => WorkbenchMessage[])): void;
  setBusy(value: boolean): void;
  setRunning(value: boolean): void;
  setLoadingId(value: string): void;
  setUnavailable(value: boolean): void;
  setError(value: string | null): void;
  setComposerError(value: string): void;
  setTitle(value: string): void;
  setInput(value: string): void;
  setAttachments(value: string[]): void;
  setSessionsOpen(value: boolean): void;
  installSession(id: string): void;
  resetAttachmentUploads(): void;
  refreshSessions(): Promise<void>;
  abortExplicitStream(): void;
};

function restoreMessages(rawMessages: WorkbenchMessage[], savedSteps: SavedStep[]) {
  const restored = rawMessages.map(message => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
  })) as WorkbenchMessage[];
  const visibleSteps = savedSteps.map(step => ({
    tool: step.type === "plan" ? "任务计划" : step.tool || "工具",
    summary: step.type === "plan" ? (step.items ?? []).join(" → ") : step.summary || "执行完成",
  }));
  if (visibleSteps.length && restored.at(-1)?.role === "assistant") {
    restored[restored.length - 1] = { ...restored[restored.length - 1], steps: visibleSteps };
  }
  return restored;
}

export function createWorkbenchSessionRecovery() {
  let accountScope: WorkbenchAccountScope | null = null;
  let generation = 0;
  let observer: Observation | null = null;

  function ownsAccount(scope: WorkbenchAccountScope | null): scope is WorkbenchAccountScope {
    return Boolean(scope?.active && accountScope === scope);
  }
  function cancel() {
    generation += 1;
    const previous = observer;
    observer = null;
    previous?.controller.abort();
  }
  function ownsObservation(owner: Observation) {
    return ownsAccount(owner.scope) && observer === owner && generation === owner.generation && !owner.controller.signal.aborted;
  }
  async function read(owner: Observation, url: string, context: WorkbenchRecoveryContext) {
    const headers = await context.headers();
    if (!ownsObservation(owner)) throw new DOMException("Recovery detached", "AbortError");
    const response = await context.request(url, { headers, signal: owner.controller.signal, cache: "no-store" });
    if (!ownsObservation(owner) || !response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`历史会话读取失败 (${response.status})`);
    }
    const data = await response.json();
    if (!ownsObservation(owner)) throw new DOMException("Recovery detached", "AbortError");
    return data;
  }
  function delay(owner: Observation) {
    return new Promise<void>(resolve => {
      const signal = owner.controller.signal;
      if (signal.aborted) { resolve(); return; }
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, 1200);
      signal.addEventListener("abort", finish, { once: true });
    });
  }
  function failed(owner: Observation, context: WorkbenchRecoveryContext) {
    if (!ownsObservation(owner)) return;
    if (!owner.installed) {
      // A failed target read must not become the displayed session's send fence.
      context.setLoadingId("");
      cancel();
      context.setUnavailable(owner.previousUnavailable);
      context.setError("历史会话读取失败，请重试");
      if (!context.sessionId()) context.setComposerError("历史会话读取失败，请重试");
      return;
    }
    owner.phase = "unavailable";
    context.setUnavailable(true);
    context.setBusy(false);
    context.setRunning(false);
    context.setMessages(previous => ownsObservation(owner) ? previous.map(message => message.pending ? { ...message, pending: false } : message) : previous);
    context.setError("任务状态暂未确认，请从历史会话重新打开；不会重新提交任务");
  }
  async function observe(owner: Observation, since: number, context: WorkbenchRecoveryContext) {
    let cursor = since;
    try {
      for (;;) {
        await delay(owner);
        if (!ownsObservation(owner)) return;
        const data = await read(owner, `/api/agent?sessionId=${encodeURIComponent(owner.id)}&since=${cursor}`, context);
        if (!ownsObservation(owner)) return;
        if (typeof data?.running !== "boolean") throw new Error("Invalid recovery state");
        cursor = Number.isInteger(data.total) && data.total >= 0 ? data.total : cursor;
        const events = Array.isArray(data.events) ? data.events : [];
        const lastAssistant = [...events].reverse().find(event => event.type === "assistant");
        if (lastAssistant?.data?.text) {
          context.setMessages(previous => {
            if (!ownsObservation(owner)) return previous;
            const copy = [...previous];
            copy[copy.length - 1] = { role: "assistant", content: String(lastAssistant.data.text) };
            return copy;
          });
        }
        if (!data.running) break;
      }
      const data = await read(owner, `/api/agent/session?id=${encodeURIComponent(owner.id)}`, context);
      if (!ownsObservation(owner)) return;
      if (!Array.isArray(data?.session?.messages)) throw new Error("Invalid session history");
      context.setMessages(previous => ownsObservation(owner) ? restoreMessages(data.session.messages as WorkbenchMessage[], (data.session.steps ?? []) as SavedStep[]) : previous);
      owner.phase = "settled";
      context.setBusy(false);
      context.setRunning(false);
      void context.refreshSessions();
    } catch {
      failed(owner, context);
    }
  }
  async function load(id: string, context: WorkbenchRecoveryContext) {
    const existing = observer;
    if (!id || (existing?.id === id && (existing.phase === "loading" || existing.phase === "observing"))) {
      context.setSessionsOpen(false);
      return;
    }
    if (context.busy && !existing) {
      context.setError("当前会话正在执行，请先停止任务再切换");
      return;
    }
    const scope = accountScope;
    if (!context.ready || !scope?.active || !scope.account) return;
    const previousUnavailable = context.unavailable || Boolean(existing?.previousUnavailable) || Boolean(existing?.installed && existing.id === context.sessionId() && existing.phase !== "settled");
    context.resetAttachmentUploads();
    cancel();
    const owner: Observation = { id, generation, scope, controller: new AbortController(), phase: "loading", installed: false, previousUnavailable };
    observer = owner;
    context.setLoadingId(id);
    context.setUnavailable(previousUnavailable);
    context.setBusy(false);
    context.setRunning(false);
    context.setError(null);
    try {
      const data = await read(owner, `/api/agent/session?id=${encodeURIComponent(id)}`, context);
      if (!ownsObservation(owner)) return;
      if (!Array.isArray(data?.session?.messages)) throw new Error("Invalid session history");
      const messages = restoreMessages(data.session.messages as WorkbenchMessage[], (data.session.steps ?? []) as SavedStep[]);
      context.installSession(id);
      owner.installed = true;
      owner.previousUnavailable = false;
      context.setUnavailable(false);
      context.setTitle(((data.session?.title as string) || "").slice(0, 60) || "历史会话");
      context.setMessages(messages);
      context.setAttachments([]);
      context.setInput("");
      const state = await read(owner, `/api/agent?sessionId=${encodeURIComponent(id)}&since=0`, context);
      if (!ownsObservation(owner)) return;
      if (typeof state?.running !== "boolean") throw new Error("Invalid recovery state");
      context.setSessionsOpen(false);
      if (state.running) {
        owner.phase = "observing";
        context.setBusy(true);
        context.setRunning(true);
        context.setMessages(previous => ownsObservation(owner) ? [...previous, { role: "assistant", content: "正在恢复运行中的任务…", pending: true }] : previous);
        void observe(owner, Number(state.total) || 0, context);
      } else {
        owner.phase = "settled";
        context.setBusy(false);
        context.setRunning(false);
      }
    } catch {
      failed(owner, context);
    } finally {
      if (ownsObservation(owner)) context.setLoadingId("");
    }
  }
  function readinessLost(context: WorkbenchRecoveryContext) {
    const owner = observer;
    if (!owner) return;
    failed(owner, context);
    cancel();
    context.setLoadingId("");
    context.setMessages(previous => previous.map(message => message.pending ? { ...message, pending: false } : message));
  }
  async function stop(context: WorkbenchRecoveryContext) {
    const id = context.sessionId();
    if (!id) return;
    const scope = accountScope, previous = observer;
    cancel();
    const recovery: Observation | null = previous ? { ...previous, generation, controller: new AbortController(), phase: "unavailable" } : null;
    if (recovery) observer = recovery;
    const capturedGeneration = generation;
    const current = () => ownsAccount(scope) && generation === capturedGeneration;
    const headers = await context.headers();
    if (!current()) return;
    const response = await context.request(`/api/agent?sessionId=${encodeURIComponent(id)}`, { method: "DELETE", headers }).catch(() => null);
    if (!current()) return;
    if (!previous) context.abortExplicitStream();
    context.setRunning(false);
    context.setBusy(false);
    context.setMessages(messages => messages.map(message => message.pending ? { ...message, pending: false, ...(!previous ? { content: "(执行失败)" } : {}) } : message));
    if (recovery) recovery.phase = response?.ok ? "settled" : "unavailable";
    context.setUnavailable(!response?.ok);
    if (!response?.ok) context.setError("停止任务失败，请重试");
  }
  return {
    get accountScope() { return accountScope; },
    get generation() { return generation; },
    ownsAccount,
    activateAccount(account: string) {
      const previous = accountScope;
      const scope: WorkbenchAccountScope = { account, active: true };
      accountScope = scope;
      return { previous, scope };
    },
    deactivateAccount(scope: WorkbenchAccountScope) { scope.active = false; },
    hasObserver: () => observer !== null,
    blocksSend: () => Boolean(observer && observer.phase !== "settled"),
    snapshot: () => observer ? { id: observer.id, generation: observer.generation, phase: observer.phase } : null,
    cancel, load, readinessLost, stop,
  };
}
