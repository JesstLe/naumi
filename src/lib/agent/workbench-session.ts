/** Browser application owner for one Agent conversation: account epochs,
 * history observation, explicit send/SSE/save and interjection. It never owns
 * the backend paid task. Detaching a view drains rather than cancels its run. */
import type { WorkbenchMessage, WorkbenchAccountScope } from "./workbench-contract";
import { createWorkbenchSessionCatalog } from "./workbench-session-catalog";
import { createWorkbenchAttachments } from "./workbench-attachments";
export type { WorkbenchMessage, WorkbenchAccountScope } from "./workbench-contract";
export type { WorkbenchCatalogContext } from "./workbench-session-catalog";
export type { WorkbenchAttachmentContext } from "./workbench-attachments";
type SavedStep = { type?: string; tool?: string; summary?: string; items?: string[] };
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
};

export type WorkbenchSendContext = Pick<WorkbenchRecoveryContext,
  "ready" | "busy" | "unavailable" | "sessionId" | "request" | "setMessages" |
  "setBusy" | "setRunning" | "setError" | "setInput" | "setAttachments" |
  "installSession" | "refreshSessions"
> & {
  allowed: boolean;
  authenticated: boolean;
  uploading: boolean;
  input: string;
  attachments: string[];
  messages: WorkbenchMessage[];
  skill: { id: string; revision: number } | null;
  headers(): Promise<Record<string, string>>;
  requestSignIn(): void;
  invalidateAccount(): void;
};
export type WorkbenchInterjectionContext = Pick<WorkbenchRecoveryContext, "sessionId" | "request"> & {
  running: boolean;
  headers(): Promise<Record<string, string>>;
  clear(): void;
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

export function createWorkbenchSession() {
  let accountScope: WorkbenchAccountScope | null = null;
  let generation = 0;
  let observer: Observation | null = null;
  let explicitStream: { scope: WorkbenchAccountScope; controller: AbortController } | null = null;

  function ownsAccount(scope: WorkbenchAccountScope | null): scope is WorkbenchAccountScope {
    return Boolean(scope?.active && accountScope === scope);
  }
  const account = { current: () => accountScope, owns: ownsAccount };
  const catalog = createWorkbenchSessionCatalog(account);
  const attachments = createWorkbenchAttachments(account);
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
        if (data.reset) {
          const snapshot=await read(owner,`/api/agent/session?id=${encodeURIComponent(owner.id)}`,context);
          if(!ownsObservation(owner))return;
          if(!Array.isArray(snapshot.session?.messages))throw new Error("Invalid session history");
          context.setMessages(previous=>ownsObservation(owner)?restoreMessages(snapshot.session.messages,snapshot.session.steps||[]):previous);
        }
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
    catalog.cancel();
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
    if (!previous) explicitStream?.controller.abort();
    context.setRunning(false);
    context.setBusy(false);
    context.setMessages(messages => messages.map(message => message.pending ? { ...message, pending: false } : message));
    if (recovery) recovery.phase = response?.ok ? "settled" : "unavailable";
    context.setUnavailable(!response?.ok);
    if (!response?.ok) context.setError("停止任务失败，请重试");
  }
  function blocksSend() { return Boolean(observer && observer.phase !== "settled"); }

  async function send(context: WorkbenchSendContext, text?: string, attachmentUrls?: string[], onAccepted?: () => void) {
    if (!context.allowed) return;
    const content = (text ?? context.input).trim();
    if (!content || context.busy || context.uploading || context.unavailable ||
        blocksSend()) return;
    const scope = accountScope;
    const entryGeneration = generation;
    if (!scope?.active) return;
    // 未登录:先确认登录态再弹登录框,避免发出去吃 401
    if (!context.authenticated) {
      if (!context.ready) return;
      const session = await context.request("/api/auth/session")
        .then((response) => response.json())
        .catch(() => null);
      if (!session?.user) {
        context.requestSignIn();
        return;
      }
    }
    if (!scope.active || accountScope !== scope || entryGeneration !== generation) return;
    cancel();
    const runGeneration = generation;
    const current = () => scope.active && accountScope === scope && generation === runGeneration;
    let runSessionId = context.sessionId();
    context.setError(null);
    const urls = attachmentUrls ?? context.attachments;
    const parts = [content, ...urls.map((u) => `[商品图] ${u}`)];
    const userMsg: WorkbenchMessage = { role: "user", content: parts.join("\n") };
    // Existing conversations are authoritative on the server; never echo a
    // potentially large model answer into the next bounded input request.
    const history = runSessionId ? [] : context.messages.filter(m=>!m.pending&&m.content).slice(-12).map(({role,content})=>({role,content}));
    const runSteps: { tool: string; summary: string }[] = [];
    context.setMessages((prev) => [
      ...prev,
      userMsg,
      { role: "assistant", content: "", pending: true },
    ]);
    context.setInput("");
    context.setAttachments([]);
    context.setBusy(true);
    context.setRunning(true);
    // The prompt is now retained in the conversation. A rejected entry must not
    // consume its caller's draft (this is local admission, not a server receipt).
    onAccepted?.();

    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let streamed = "", reply = "", receivedFinal = false, historyRequired = false;
    try {
      explicitStream = { scope, controller };
      const headers = await context.headers();
      if (!current()) return;
      const res = await context.request("/api/agent", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          message: userMsg.content,
          skill: context.skill,
          sessionId: runSessionId || undefined,
          history,
          // 视觉输入:服务端按模型自动判定,支持时随消息直喂模型
          images: urls,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        if (!current()) return;
        throw new Error(d.error || "Agent 执行失败");
      }
      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      for (;;) {
        const { done, value } = await reader.read().catch(error=>{if(receivedFinal)return {done:true,value:undefined};throw error;});
        if (done) break;
        // Do not cancel this SSE from observer cleanup: cancellation has an
        // existing server meaning. Detached sends drain without changing UI or
        // saving with a different account/session's identity.
        if (!current()) continue;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const evLine = chunk.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!evLine || !dataLine) continue;
          const type = evLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
          if (type === "open" && typeof data.sessionId === "string") {
            runSessionId = data.sessionId;
            context.installSession(data.sessionId);
          } else if (type === "delta") {
            // 流式正文:逐段追加,工具状态文案不再覆盖已流出的内容
            streamed += (data.text as string) || "";
            context.setMessages((prev) => {
              if (!current()) return prev;
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.pending) {
                copy[copy.length - 1] = { ...last, content: streamed };
              }
              return copy;
            });
          } else if (type === "plan") {
            const items = Array.isArray(data.items) ? data.items.map(String) : [];
            runSteps.push({ tool: "任务计划", summary: items.join(" → ") });
            // React may defer this update until a later tool_end has already
            // extended runSteps. Project this event's snapshot, not that array.
            const plannedSteps = [...runSteps];
            context.setMessages((prev) => {
              if (!current()) return prev;
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.pending) {
                copy[copy.length - 1] = { ...last, steps: plannedSteps };
              }
              return copy;
            });
          } else if (type === "tool_start") {
            context.setMessages((prev) => {
              if (!current()) return prev;
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.pending && !streamed) {
                copy[copy.length - 1] = {
                  ...last,
                  content: `🔧 正在调用 ${data.tool || "工具"}…`,
                };
              }
              return copy;
            });
          } else if (type === "tool_end") {
            context.invalidateAccount();
            const step = {
              tool: (data.tool as string) || "",
              summary: (data.summary as string) || "执行完成",
            };
            runSteps.push(step);
            context.setMessages((prev) => {
              if (!current()) return prev;
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.pending) {
                copy[copy.length - 1] = {
                  ...last,
                  ...(streamed
                    ? {}
                    : { content: `✓ ${step.tool} ${step.summary}` }),
                  steps: [...(last.steps ?? []), step],
                };
              }
              return copy;
            });
          } else if (type === "history_required") {
            historyRequired = true;
          } else if (type === "final") {
            receivedFinal = true;
            reply = (data.reply as string) || streamed;
          } else if (type === "error") {
            throw new Error((data.message as string) || "执行失败");
          }
        }
      }
      if (!current()) return;
      if (!receivedFinal) throw new Error("任务连接已中断，已输出内容保留，请从历史核对原任务；不要重复提交");
      context.setMessages((prev) => {
        if (!current()) return prev;
        const copy = [...prev];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = {
          role: "assistant",
          content: reply || streamed,
          steps: last?.steps ?? runSteps,
        };
        return copy;
      });
      // The server persists before final. Client autosave must not re-upload
      // long history or become another writer of a model-owned conversation.
      if (historyRequired && runSessionId) {
        const headers=await context.headers();if(!current())return;
        const response=await context.request(`/api/agent/session?id=${encodeURIComponent(runSessionId)}`,{headers,cache:"no-store"});
        if(!response.ok)throw new Error("回复已保留，历史轨迹同步失败，请从历史重新打开");
        const data=await response.json();if(!current())return;
        if(!Array.isArray(data.session?.messages))throw new Error("历史轨迹尚未同步");
        context.setMessages(previous=>current()?restoreMessages(data.session.messages,data.session.steps||[]):previous);
      }
    } catch (e) {
      if (!current()) return;
      if ((e as { name?: string })?.name !== "AbortError") {
        context.setError(e instanceof Error ? e.message : "Agent 执行失败");
      }
      context.setMessages((prev) => {
        if (!current()) return prev;
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], role: "assistant", pending:false, content: reply || streamed || "(回复未完成，请从历史核对结果)", steps:copy.at(-1)?.steps ?? runSteps };
        return copy;
      });
    } finally {
      reader?.releaseLock();
      if (explicitStream?.controller === controller) explicitStream = null;
      if (current()) {
        context.setBusy(false);
        context.setRunning(false);
        void context.refreshSessions();
      }
    }
  }


  async function interject(input: string, context: WorkbenchInterjectionContext) {
    const text = input.trim();
    if (!text || !context.running || !context.sessionId()) return;
    const id = context.sessionId();
    const scope = accountScope;
    const runGeneration = generation;
    const current = () => scope?.active && scope === accountScope && runGeneration === generation;
    const headers = await context.headers();
    if (!current()) return;
    await context.request("/api/agent", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        sessionId: id,
        message: text,
      }),
    }).catch(() => {});
    if (current()) context.clear();
  }


  return {
    get accountScope() { return accountScope; },
    get generation() { return generation; },
    ownsAccount,
    catalog, attachments,
    activateAccount(account: string) {
      const previous = accountScope;
      if (previous?.active) {
        previous.active = false;
        catalog.cancel(); attachments.reset(); attachments.resetIndex();
      }
      const scope: WorkbenchAccountScope = { account, active: true };
      accountScope = scope;
      return { previous, scope };
    },
    deactivateAccount(scope: WorkbenchAccountScope) {
      scope.active = false;
      if (accountScope === scope) {
        catalog.cancel(); attachments.reset(); attachments.resetIndex();
      }
      // Clear only the UI handle; the old request keeps draining independently.
      if (explicitStream?.scope === scope) explicitStream = null;
    },
    hasObserver: () => observer !== null,
    blocksSend,
    snapshot: () => observer ? { id: observer.id, generation: observer.generation, phase: observer.phase } : null,
    cancel, load, readinessLost, stop, send, interject,
  };
}
