import type {
  CanvasShare, CanvasShareChange, CanvasShareCreate, CanvasShareSource,
  CollaborationAttachment, CollaborationBootstrap, CollaborationConversation,
  CollaborationMember, CollaborationMessage, CollaborationOpen, CollaborationPage,
  CollaborationSend, CollaborationShareIntent, CollaborationUpload,
} from "@/lib/collaboration/contracts";
import { aborted, attachmentPath, CollaborationError, errorText, isAbort, newOperationId, readEvents } from "./transport";

export type Draft = { body: string; replyTo?: string; mentionIds: string[]; attachments: CollaborationAttachment[] };
export type UploadTask = { id: string; clientId: string; conversationId: string; file: File; upload?: CollaborationUpload; progress: number; status: "uploading" | "paused" | "error" | "complete" | "cancelled" | "cancelling" | "cancel-failed"; error?: string };
export type Outgoing = { conversationId: string; payload: CollaborationSend; status: "sending" | "uncertain" | "error"; error?: string };
export type MessagePage = CollaborationPage<CollaborationMessage> & { loading: boolean; error?: string };
export type CollaborationState = {
  account: string | null; bootstrap: CollaborationBootstrap | null; status: "signed-out" | "loading" | "ready" | "error";
  error: string; streamError: string; connected: boolean; visible: boolean; expanded: boolean;
  section: NonNullable<CollaborationOpen["section"]>; activeId: string | null;
  members: CollaborationMember[]; memberCursor: string | null; memberQuery: string;
  conversations: CollaborationConversation[]; conversationCursor: string | null;
  messages: Record<string, MessagePage>; files: Record<string, MessagePage>;
  drafts: Record<string, Draft>; uploads: UploadTask[]; outbox: Outgoing[];
  shares: CanvasShare[]; shareCursors: Record<"received" | "sent", string | null>;
  shareDirections: Record<"received" | "sent", string[]>;
  sharesRevision: number;
  pendingShare: CollaborationShareIntent | null; approval: CanvasShare | null;
};
const empty = (account: string | null = null): CollaborationState => ({ account, bootstrap: null, status: account ? "loading" : "signed-out", error: "", streamError: "", connected: false, visible: false, expanded: false, section: "conversations", activeId: null, members: [], memberCursor: null, memberQuery: "", conversations: [], conversationCursor: null, messages: {}, files: {}, drafts: {}, uploads: [], outbox: [], shares: [], shareCursors: { received: null, sent: null }, shareDirections: { received: [], sent: [] }, sharesRevision: 0, pendingShare: null, approval: null });
const blankDraft = (): Draft => ({ body: "", mentionIds: [], attachments: [] });
const merge = <T extends { id: string }>(old: T[], fresh: T[]) => Array.from(new Map([...old, ...fresh].map(item => [item.id, item])).values());
const messageOrder = (items: CollaborationMessage[]) => [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
const prefix = "naumi:collaboration:draft:v1:";
type AuthHeaders = () => Promise<Record<string, string>>;

/** Owns account/enterprise epochs and all I/O. Pages only render projections.
 * Never compare account strings alone: A -> B -> A still invalidates A's work. */
export class CollaborationClient {
  state = empty();
  private listeners = new Set<() => void>();
  private entry = { available: false, unread: 0, open: (intent?: CollaborationOpen) => this.open(intent), share: (intent: CollaborationShareIntent) => this.share(intent) };
  private epoch = 0;
  private requests = new Set<AbortController>();
  private uploadControllers = new Map<string, AbortController>();
  private urls = new Set<string>();
  private stream: AbortController | null = null;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private presenceCleanup: (() => void) | null = null;
  private eventCursor: string | null = null;
  private seenEvents = new Set<string>();
  private sessionId = "";
  private retries = 0;
  private disposed = false;
  private memberSequence = 0;
  private requestsSequence = new Map<string, number>();
  private historyPages = new Map<string, number>();
  private conversationSequence = 0;
  private conversationPages = 1;
  private operations = new Map<string, { id: string; payload: string }>();
  constructor(private headers: AuthHeaders) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  entrySnapshot = () => this.entry;
  get generation() { return this.epoch; }
  private update(patch: Partial<CollaborationState>) {
    this.state = { ...this.state, ...patch };
    const available = this.state.status === "ready" && !!this.state.bootstrap?.enterpriseId, unread = this.state.conversations.reduce((n, c) => n + c.unread, 0);
    if (available !== this.entry.available || unread !== this.entry.unread) this.entry = { ...this.entry, available, unread };
    this.listeners.forEach(fn => fn());
  }
  private current(epoch: number) { if (epoch !== this.epoch) aborted(); }
  private draftKey(id: string) { return prefix + JSON.stringify([this.state.account, this.state.bootstrap?.enterpriseId, id]); }
  private clearPrivateDrafts(account: string) {
    try { for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) { const scope = JSON.parse(key.slice(prefix.length)); if (scope[0] === account) localStorage.removeItem(key); } } catch { /* private storage unavailable */ }
  }
  private stop() {
    this.epoch++;
    for (const controller of this.requests) controller.abort(); this.requests.clear();
    for (const controller of this.uploadControllers.values()) controller.abort(); this.uploadControllers.clear();
    this.stream?.abort(); this.stream = null;
    if (this.reconnect) clearTimeout(this.reconnect); this.reconnect = null;
    if (this.heartbeat) clearInterval(this.heartbeat); this.heartbeat = null;
    this.presenceCleanup?.(); this.presenceCleanup = null;
    for (const url of this.urls) URL.revokeObjectURL(url); this.urls.clear();
    this.operations.clear(); this.seenEvents.clear(); this.eventCursor = null; this.retries = 0; this.memberSequence++; this.requestsSequence.clear(); this.historyPages.clear(); this.conversationSequence++; this.conversationPages = 1;
  }
  setAccount(account: string | null) {
    if (account === this.state.account && !this.disposed) return;
    if (this.state.account && account !== this.state.account) this.clearPrivateDrafts(this.state.account);
    this.disposed = false;
    this.stop(); this.state = empty(account); this.update({});
    if (account) void this.bootstrap();
  }
  dispose() { this.stop(); this.disposed = true; }
  resume() { if (this.disposed) this.setAccount(this.state.account); }
  report(error: unknown) { if (!isAbort(error)) this.update({ error: errorText(error) }); }
  dismissError() { this.update({ error: "" }); }
  private url(path: string, query: Record<string, string | undefined> = {}, enterprise = this.state.bootstrap?.enterpriseId) {
    const params = new URLSearchParams(); if (enterprise) params.set("enterpriseId", enterprise);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, value);
    return `/api/collaboration${path}${params.size ? "?" + params : ""}`;
  }
  async request<T>(path: string, init: RequestInit = {}, query: Record<string, string | undefined> = {}, enterprise?: string | null): Promise<T> {
    if (path !== "/bootstrap" && !this.state.bootstrap?.enterpriseId) throw new CollaborationError("请先连接企业通讯");
    const epoch = this.epoch, controller = new AbortController(), caller = init.signal;
    const abort = () => controller.abort(); caller?.addEventListener("abort", abort, { once: true });
    if (caller?.aborted) controller.abort(); this.requests.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort(); }, 45_000);
    try {
      const headers = new Headers(await this.headers()); this.current(epoch);
      new Headers(init.headers).forEach((v, k) => headers.set(k, v));
      if (typeof init.body === "string") headers.set("Content-Type", "application/json");
      if (controller.signal.aborted) aborted();
      const response = await fetch(this.url(path, query, enterprise), { ...init, headers, credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const raw = await response.text(); this.current(epoch);
      let data: T & { error?: string; uncertain?: boolean };
      try { data = JSON.parse(raw); } catch { throw new CollaborationError(`响应格式异常 (${response.status})`, response.status, init.method !== undefined && init.method !== "GET"); }
      if (!response.ok) throw new CollaborationError(data.error || `请求失败 (${response.status})`, response.status, data.uncertain);
      if (!data || typeof data !== "object") throw new CollaborationError("响应内容异常");
      return data;
    } catch (error) {
      this.current(epoch);
      if (timedOut) throw new CollaborationError("请求超时，状态待确认", 0, true);
      throw error;
    } finally { clearTimeout(timer); caller?.removeEventListener("abort", abort); this.requests.delete(controller); }
  }
  private async page<T>(path: string, query: Record<string, string | undefined> = {}) {
    const data = await this.request<CollaborationPage<T>>(path, {}, query);
    if (!Array.isArray(data.items) || !(data.nextCursor === null || typeof data.nextCursor === "string")) throw new CollaborationError("分页响应格式异常");
    return data;
  }
  async bootstrap(enterpriseId?: string) {
    const epoch = this.epoch;
    this.update({ status: "loading", error: "" });
    try {
      const data = await this.request<CollaborationBootstrap>("/bootstrap", {}, {}, enterpriseId || null);
      this.current(epoch);
      if (data.actorId !== this.state.account || !Array.isArray(data.enterprises) || !Array.isArray(data.members) || !Array.isArray(data.conversations) || !data.limits || !Number.isFinite(data.limits.chunkBytes)) throw new CollaborationError("通讯身份或数据异常，请重新登录");
      this.eventCursor = data.cursor;
      this.update({ bootstrap: data, members: data.members, conversations: data.conversations, status: "ready" });
      if (data.enterpriseId) {
        this.startPresence(); this.connect();
        // Bootstrap's cursor belongs to events, never use it as a members cursor.
        await Promise.all([this.loadMembers(), this.loadConversations()]);
      }
    } catch (error) { if (epoch === this.epoch && !isAbort(error)) this.update({ status: "error", error: errorText(error) }); }
  }
  switchEnterprise(id: string) {
    if (id === this.state.bootstrap?.enterpriseId) return;
    const { account, visible, expanded, bootstrap } = this.state;
    if (!bootstrap?.enterprises.some(e => e.id === id)) return;
    this.stop(); this.state = { ...empty(account), visible, expanded }; this.update({}); void this.bootstrap(id);
  }
  retryBootstrap() {
    const { account, visible, expanded } = this.state;
    const enterpriseId = this.state.bootstrap?.enterpriseId || undefined;
    this.stop(); this.state = { ...empty(account), visible, expanded }; this.update({}); void this.bootstrap(enterpriseId);
  }
  open(intent: CollaborationOpen = {}) {
    this.update({ visible: true, section: intent.section || "conversations" });
    if (intent.memberId) void this.createConversation([intent.memberId], "direct").catch(e => this.report(e));
    else if (intent.conversationId) this.selectConversation(intent.conversationId);
    else if ((!intent.section || intent.section === "conversations") && this.state.activeId) void this.loadMessages(this.state.activeId).catch(e => this.report(e));
    if (intent.section === "requests") void this.loadShares().catch(e => this.report(e));
  }
  close() { this.update({ visible: false }); }
  expand() { this.update({ expanded: !this.state.expanded }); }
  share(intent: CollaborationShareIntent) {
    if (!intent.projectKey || intent.nodeIds?.some(id => !id)) throw new CollaborationError("请选择已保存的画布内容");
    this.update({ visible: true, section: "requests", pendingShare: intent });
  }
  clearShare() { this.update({ pendingShare: null, approval: null }); }
  chooseApproval(share: CanvasShare) { this.update({ approval: share, pendingShare: null, visible: true }); }
  async loadMembers(query = this.state.memberQuery, more = false) {
    const seq = ++this.memberSequence;
    const data = await this.page<CollaborationMember>("/members", { q: query || undefined, cursor: more ? this.state.memberCursor || undefined : undefined });
    if (seq !== this.memberSequence) return;
    this.update({ members: more ? merge(this.state.members, data.items) : data.items, memberCursor: data.nextCursor, memberQuery: query });
  }
  async loadConversations(more = false) {
    const sequence = ++this.conversationSequence;
    let data = await this.page<CollaborationConversation>("/conversations", { cursor: more ? this.state.conversationCursor || undefined : undefined });
    let items = data.items;
    if (!more) {
      // Reconcile only pages the user actually loaded, not the entire tenant.
      // Missing memberships must remove cached conversations, not linger forever.
      for (let page = 1; page < this.conversationPages && data.nextCursor; page++) {
        data = await this.page<CollaborationConversation>("/conversations", { cursor: data.nextCursor }); items = merge(items, data.items);
      }
    }
    if (sequence !== this.conversationSequence) return;
    if (more) { this.conversationPages++; items = merge(this.state.conversations, items); }
    else if (data.nextCursor) {
      // An id-ordered first page is not evidence that an older/newly-created
      // conversation was revoked. Retain explicitly opened rows until an
      // authenticated read denies them or the complete loaded range excludes them.
      items = merge(this.state.conversations, items);
    } else for (const old of this.state.conversations) if (!items.some(c => c.id === old.id)) this.forgetConversation(old.id);
    this.update({ conversations: items, conversationCursor: data.nextCursor });
  }
  private operation(key: string, payload: unknown) {
    const json = JSON.stringify(payload), previous = this.operations.get(key);
    if (previous && previous.payload === json) return previous.id;
    const id = newOperationId(); this.operations.set(key, { id, payload: json }); return id;
  }
  async createConversation(memberIds: string[], kind: "direct" | "group", title?: string) {
    const body = { kind, memberIds: [...memberIds].sort(), ...(title ? { title } : {}) }, key = `conversation:${JSON.stringify(body)}`;
    const result = await this.request<{ conversation: CollaborationConversation }>("/conversations", { method: "POST", body: JSON.stringify({ ...body, clientId: this.operation(key, body) }) });
    this.operations.delete(key); this.update({ conversations: merge(this.state.conversations, [result.conversation]), section: "conversations" }); this.selectConversation(result.conversation.id);
    return result.conversation;
  }
  async patchConversation(id: string, patch: { pinned?: boolean; muted?: boolean; title?: string; addMemberIds?: string[]; removeMemberIds?: string[]; leave?: boolean }) {
    const result = await this.request<{ conversation: CollaborationConversation }>(`/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (patch.leave) this.forgetConversation(id); else this.update({ conversations: merge(this.state.conversations, [result.conversation]) });
  }
  private forgetConversation(id: string) {
    const messages = { ...this.state.messages }, drafts = { ...this.state.drafts }, files = { ...this.state.files };
    delete messages[id]; delete drafts[id]; delete files[id]; try { localStorage.removeItem(this.draftKey(id)); } catch {}
    for (const task of this.state.uploads.filter(u => u.conversationId === id)) this.uploadControllers.get(task.id)?.abort();
    this.update({ messages, drafts, files, uploads: this.state.uploads.filter(u => u.conversationId !== id), outbox: this.state.outbox.filter(o => o.conversationId !== id), conversations: this.state.conversations.filter(c => c.id !== id), activeId: this.state.activeId === id ? null : this.state.activeId });
  }
  selectConversation(id: string) {
    this.update({ activeId: id, section: "conversations" });
    if (!this.state.drafts[id]) {
      let draft = blankDraft();
      try { const stored = JSON.parse(localStorage.getItem(this.draftKey(id)) || "null"); if (stored && typeof stored.body === "string") draft = { ...draft, body: stored.body, replyTo: typeof stored.replyTo === "string" ? stored.replyTo : undefined, mentionIds: Array.isArray(stored.mentionIds) ? stored.mentionIds.filter((s: unknown) => typeof s === "string") : [] }; } catch {}
      this.update({ drafts: { ...this.state.drafts, [id]: draft } });
    }
    void this.loadMessages(id).catch(e => this.report(e));
  }
  draft(id: string, patch: Partial<Draft>) {
    const draft = { ...(this.state.drafts[id] || blankDraft()), ...patch };
    this.update({ drafts: { ...this.state.drafts, [id]: draft } });
    try { if (draft.body || draft.replyTo) localStorage.setItem(this.draftKey(id), JSON.stringify({ body: draft.body, replyTo: draft.replyTo, mentionIds: draft.mentionIds })); else localStorage.removeItem(this.draftKey(id)); } catch { /* in-memory draft remains usable */ }
  }
  async loadMessages(id: string, more = false, files = false) {
    const field = files ? "files" : "messages", old = this.state[field][id], key = `${field}:${id}`;
    const sequence = (this.requestsSequence.get(key) || 0) + 1; this.requestsSequence.set(key, sequence);
    this.update({ [field]: { ...this.state[field], [id]: { items: old?.items || [], nextCursor: old?.nextCursor || null, loading: true } } });
    try {
      let page = await this.page<CollaborationMessage>(`/conversations/${encodeURIComponent(id)}/messages`, { cursor: more ? old?.nextCursor || undefined : undefined, kind: files ? "files" : undefined });
      let items = page.items;
      const loadedPages = this.historyPages.get(key) || 1;
      if (!more) for (let count = 1; count < loadedPages && page.nextCursor; count++) {
        page = await this.page<CollaborationMessage>(`/conversations/${encodeURIComponent(id)}/messages`, { cursor: page.nextCursor, kind: files ? "files" : undefined }); items = merge(items, page.items);
      }
      if (this.requestsSequence.get(key) !== sequence) return;
      const latest = this.state[field][id];
      this.historyPages.set(key, more ? loadedPages + 1 : loadedPages);
      this.update({ [field]: { ...this.state[field], [id]: { items: messageOrder(more ? merge(latest?.items || [], items) : items), nextCursor: page.nextCursor, loading: false } } });
    } catch (e) {
      if (isAbort(e)) throw e;
      if (e instanceof CollaborationError && [401, 403, 404].includes(e.status)) this.forgetConversation(id);
      else this.update({ [field]: { ...this.state[field], [id]: { items: old?.items || [], nextCursor: old?.nextCursor || null, loading: false, error: errorText(e) } } });
      throw e;
    }
  }
  async searchMessages(id: string, q: string, cursor?: string) { return this.page<CollaborationMessage>(`/conversations/${encodeURIComponent(id)}/messages`, { q, cursor }); }
  async markRead(id: string, messageId: string) {
    await this.request(`/conversations/${encodeURIComponent(id)}/read`, { method: "POST", body: JSON.stringify({ messageId }) }); await this.loadConversations();
  }
  private acceptMessage(message: CollaborationMessage) {
    const old = this.state.messages[message.conversationId];
    this.update({ messages: { ...this.state.messages, [message.conversationId]: { items: messageOrder(merge(old?.items || [], [message])), nextCursor: old?.nextCursor || null, loading: false } } });
  }
  async send(id: string, supplied?: CollaborationSend) {
    const draft = this.state.drafts[id] || blankDraft();
    const payload: CollaborationSend = supplied || { clientId: newOperationId(), body: draft.body.trim(), replyTo: draft.replyTo, attachmentIds: draft.attachments.map(a => a.id), mentionIds: draft.mentionIds };
    if (!payload.body && !payload.attachmentIds?.length && !payload.shareId) return;
    if (this.state.outbox.some(o => o.payload.clientId === payload.clientId && o.status === "sending")) return;
    this.update({ outbox: [...this.state.outbox.filter(o => o.payload.clientId !== payload.clientId), { conversationId: id, payload, status: "sending" }] });
    // Admission, not ACK, clears the editor; the immutable outbox owns retries.
    if (!supplied) this.draft(id, blankDraft());
    try {
      const { message } = await this.request<{ message: CollaborationMessage }>(`/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify(payload) });
      this.acceptMessage(message); this.update({ outbox: this.state.outbox.filter(o => o.payload.clientId !== payload.clientId) }); await this.loadConversations();
    } catch (e) {
      if (isAbort(e)) return;
      const uncertain = !(e instanceof CollaborationError) || e.uncertain || e.status >= 500 || e.status === 0;
      this.update({ outbox: this.state.outbox.map(o => o.payload.clientId === payload.clientId ? { ...o, status: uncertain ? "uncertain" : "error", error: errorText(e) } : o) });
    }
  }
  async withdraw(id: string) {
    const { message } = await this.request<{ message: CollaborationMessage }>(`/messages/${encodeURIComponent(id)}/withdraw`, { method: "POST" }); this.acceptMessage(message);
    const files = this.state.files[message.conversationId];
    if (files) this.update({ files: { ...this.state.files, [message.conversationId]: { ...files, items: files.items.filter(m => m.id !== id) } } });
  }
  async forward(messageIds: string[], conversationIds: string[]) {
    const body = { messageIds: [...messageIds].sort(), conversationIds: [...conversationIds].sort() }, key = `forward:${JSON.stringify(body)}`;
    const data = await this.request<{ messages: CollaborationMessage[] }>("/forward", { method: "POST", body: JSON.stringify({ ...body, clientId: this.operation(key, body) }) });
    this.operations.delete(key); data.messages.forEach(m => this.acceptMessage(m)); await this.loadConversations();
  }
  addFiles(id: string, files: File[]) {
    for (const file of files) {
      if (file.size > (this.state.bootstrap?.limits.attachmentBytes || 0)) { this.report(new Error(`${file.name} 超出附件大小限制`)); continue; }
      const task: UploadTask = { id: newOperationId(), clientId: newOperationId(), conversationId: id, file, progress: 0, status: "paused" };
      this.update({ uploads: [...this.state.uploads, task] }); void this.resumeUpload(task.id);
    }
  }
  private patchUpload(id: string, patch: Partial<UploadTask>) { this.update({ uploads: this.state.uploads.map(u => u.id === id ? { ...u, ...patch } : u) }); }
  pauseUpload(id: string) { this.uploadControllers.get(id)?.abort(); this.uploadControllers.delete(id); this.patchUpload(id, { status: "paused" }); }
  async cancelUpload(id: string) {
    const task = this.state.uploads.find(u => u.id === id); if (!task) return;
    this.uploadControllers.get(id)?.abort(); this.uploadControllers.delete(id); this.patchUpload(id, { status: "cancelling", error: undefined });
    try {
      // Lost create ACK: recover the SAME upload identity before cancellation.
      const upload = task.upload || (await this.request<{ upload: CollaborationUpload }>("/uploads", { method: "POST", body: JSON.stringify({ clientId: task.clientId, conversationId: task.conversationId, name: task.file.name, bytes: task.file.size, mime: task.file.type }) })).upload;
      await this.request(`/uploads/${encodeURIComponent(upload.id)}`, { method: "DELETE" });
      this.patchUpload(id, { status: "cancelled", upload: undefined, progress: 0 });
    } catch (e) { if (!isAbort(e)) this.patchUpload(id, { status: "cancel-failed", error: `取消未确认：${errorText(e)}` }); }
  }
  async resumeUpload(id: string) {
    let task = this.state.uploads.find(u => u.id === id); if (!task || this.uploadControllers.has(id) || ["complete", "cancelling", "cancel-failed"].includes(task.status)) return;
    if (task.status === "cancelled") { this.patchUpload(id, { clientId: newOperationId(), upload: undefined }); task = this.state.uploads.find(u => u.id === id)!; }
    const controller = new AbortController(), epoch = this.epoch; this.uploadControllers.set(id, controller); this.patchUpload(id, { status: "uploading", error: undefined });
    const init = { signal: controller.signal };
    try {
      let { upload } = task.upload ? await this.request<{ upload: CollaborationUpload }>(`/uploads/${encodeURIComponent(task.upload.id)}`, init) : await this.request<{ upload: CollaborationUpload }>("/uploads", { ...init, method: "POST", body: JSON.stringify({ clientId: task.clientId, conversationId: task.conversationId, name: task.file.name, bytes: task.file.size, mime: task.file.type }) });
      if (!Number.isInteger(upload.chunkBytes) || upload.chunkBytes <= 0 || upload.chunkBytes > 64 * 1024 * 1024 || !Array.isArray(upload.uploadedParts)) throw new Error("上传分块参数异常");
      this.patchUpload(id, { upload });
      const total = Math.ceil(task.file.size / upload.chunkBytes);
      for (let part = 0; part < total; part++) {
        if (controller.signal.aborted) aborted();
        if (!upload.uploadedParts.includes(part)) ({ upload } = await this.request<{ upload: CollaborationUpload }>(`/uploads/${encodeURIComponent(upload.id)}`, { ...init, method: "PUT", body: task.file.slice(part * upload.chunkBytes, Math.min(task.file.size, (part + 1) * upload.chunkBytes)), headers: { "Content-Type": "application/octet-stream" } }, { part: String(part) }));
        this.patchUpload(id, { upload, progress: Math.min(99, Math.round(upload.uploadedParts.length / Math.max(total, 1) * 100)) });
      }
      const { attachment } = upload.attachment ? { attachment: upload.attachment } : await this.request<{ attachment: CollaborationAttachment }>(`/uploads/${encodeURIComponent(upload.id)}/complete`, { ...init, method: "POST" });
      if (controller.signal.aborted) aborted();
      const draft = this.state.drafts[task.conversationId] || blankDraft(); this.draft(task.conversationId, { attachments: merge(draft.attachments, [attachment]) });
      // The confirmed attachment metadata now owns the draft. Release File bytes
      // rather than retaining every completed upload for the whole root lifetime.
      this.update({ uploads: this.state.uploads.filter(u => u.id !== id) });
    } catch (e) { if (epoch === this.epoch && !isAbort(e)) this.patchUpload(id, { status: "error", error: errorText(e) }); }
    finally { if (this.uploadControllers.get(id) === controller) this.uploadControllers.delete(id); }
  }
  async attachment(attachment: CollaborationAttachment, preview = false, signal?: AbortSignal) {
    const epoch = this.epoch, controller = new AbortController(); this.requests.add(controller);
    const abort = () => controller.abort(); signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) controller.abort();
    const deadline = setTimeout(() => controller.abort(), 120_000);
    try {
      const headers = await this.headers(); this.current(epoch);
      const response = await fetch(attachmentPath(attachment.id, this.state.bootstrap!.enterpriseId!, preview), { headers, credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new CollaborationError(`文件${preview ? "预览" : "下载"}失败 (${response.status})`, response.status);
      const blob = await response.blob(); this.current(epoch); if (controller.signal.aborted) aborted();
      if (preview && !/^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm|ogg))$/.test(blob.type.split(";")[0])) throw new Error("此文件不支持内联预览");
      const url = URL.createObjectURL(blob); this.urls.add(url); return url;
    } finally { clearTimeout(deadline); signal?.removeEventListener("abort", abort); this.requests.delete(controller); }
  }
  releaseUrl(url: string) { URL.revokeObjectURL(url); this.urls.delete(url); }
  async loadShares(direction?: "received" | "sent", more = false) {
    const directions = direction ? [direction] : ["received", "sent"] as const;
    for (const side of directions) {
      const page = await this.page<CanvasShare>("/shares", { direction: side, cursor: more ? this.state.shareCursors[side] || undefined : undefined });
      this.update({ shares: merge(this.state.shares, page.items), shareCursors: { ...this.state.shareCursors, [side]: page.nextCursor }, shareDirections: { ...this.state.shareDirections, [side]: [...new Set([...(more ? this.state.shareDirections[side] : []), ...page.items.map(s => s.id)])] } });
    }
    this.update({ sharesRevision: this.state.sharesRevision + 1 });
  }
  async getShare(id: string) { return (await this.request<{ share: CanvasShare }>(`/shares/${encodeURIComponent(id)}`)).share; }
  async shareCover(share: CanvasShare, signal: AbortSignal) {
    if (!share.previewUrl) return null;
    const epoch = this.epoch, controller = new AbortController();
    const url = new URL(share.previewUrl, location.origin);
    if (url.origin !== location.origin) throw new CollaborationError("分享预览地址异常");
    const abort = () => controller.abort(); signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) controller.abort();
    this.requests.add(controller); const deadline = setTimeout(abort, 45_000);
    try {
      const headers = await this.headers(); this.current(epoch);
      const response = await fetch(url, { headers, credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new CollaborationError(`分享预览失败 (${response.status})`, response.status);
      const blob = await response.blob(); this.current(epoch);
      // Never display JSON containing private node parameters, SVG, or raw HTML.
      if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(blob.type.split(";")[0])) throw new CollaborationError("分享预览格式异常");
      const objectUrl = URL.createObjectURL(blob); this.urls.add(objectUrl); return objectUrl;
    } finally { clearTimeout(deadline); signal.removeEventListener("abort", abort); this.requests.delete(controller); }
  }
  async createShare(input: Omit<Extract<CanvasShareCreate, { action: "request" }>, "operationId"> | Omit<Extract<CanvasShareCreate, { action: "offer" }>, "operationId">) {
    if (input.action === "offer") input = { ...input, source: this.sourceWire(input.source) };
    const key = `share:${JSON.stringify(input)}`;
    const { share } = await this.request<{ share: CanvasShare }>("/shares", { method: "POST", body: JSON.stringify({ ...input, operationId: this.operation(key, input) }) });
    this.operations.delete(key); this.update({ shares: merge(this.state.shares, [share]), pendingShare: null, approval: null }); return share;
  }
  async changeShare(share: CanvasShare, action: CanvasShareChange["action"], source?: CanvasShareSource) {
    const body = { action, expectedVersion: share.version, ...(source ? { source: this.sourceWire(source) } : {}) }, key = `share-change:${share.id}:${JSON.stringify(body)}`;
    try {
      const { share: updated } = await this.request<{ share: CanvasShare }>(`/shares/${encodeURIComponent(share.id)}`, { method: "POST", body: JSON.stringify({ ...body, operationId: this.operation(key, body) }) });
      this.operations.delete(key); this.update({ shares: merge(this.state.shares, [updated]), pendingShare: null, approval: null }); return updated;
    } catch (e) { if (e instanceof CollaborationError && e.status === 409) await this.loadShares(); throw e; }
  }
  async sendShareCard(share: CanvasShare) {
    const peer = share.authorId === this.state.bootstrap?.actorId ? share.requesterId : share.authorId;
    const conversation = await this.createConversation([peer], "direct");
    const payload = { body: "", shareId: share.id };
    await this.send(conversation.id, { ...payload, clientId: this.operation(`card:${conversation.id}:${share.id}`, payload) });
  }
  private sourceWire(source: CanvasShareSource): CanvasShareSource { return { projectKey: source.projectKey, kind: source.kind, ...(source.nodeIds ? { nodeIds: source.nodeIds } : {}) }; }
  private startPresence() {
    this.sessionId = newOperationId();
    let lastActivity = Date.now();
    const activity = () => { lastActivity = Date.now(); };
    const heartbeat = () => {
      const state = document.hidden || Date.now() - lastActivity > 120_000 ? "away" : "online";
      void this.request("/presence", { method: "POST", body: JSON.stringify({ sessionId: this.sessionId, state }) }).catch(e => { if (!isAbort(e)) this.update({ streamError: errorText(e) }); });
    };
    const visibility = () => { heartbeat(); };
    window.addEventListener("pointerdown", activity, { passive: true }); window.addEventListener("keydown", activity); document.addEventListener("visibilitychange", visibility);
    this.presenceCleanup = () => { window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity); document.removeEventListener("visibilitychange", visibility); };
    heartbeat(); this.heartbeat = setInterval(heartbeat, 30_000);
  }
  private connect() {
    const epoch = this.epoch, controller = new AbortController(); this.stream?.abort(); this.stream = controller;
    void (async () => {
      try {
        const headers = await this.headers(); this.current(epoch); if (controller.signal.aborted) aborted();
        const response = await fetch(this.url("/events", { cursor: this.eventCursor || undefined }), { headers, credentials: "same-origin", cache: "no-store", signal: controller.signal }); this.current(epoch);
        if (response.ok && response.headers.get("content-type")?.includes("text/event-stream")) this.update({ connected: true, streamError: "" });
        await readEvents(response, controller.signal, async event => {
          this.current(epoch); if (this.seenEvents.has(event.id)) return;
          const reset = event.type === "reset";
          if (reset || event.topics.includes("conversations")) await this.loadConversations();
          if (reset || event.topics.includes("members")) await this.loadMembers();
          if ((reset || event.topics.includes("messages")) && this.state.visible && this.state.section === "conversations" && this.state.activeId && (!event.conversationId || event.conversationId === this.state.activeId)) {
            await this.loadMessages(this.state.activeId);
            if (this.state.files[this.state.activeId]) await this.loadMessages(this.state.activeId, false, true);
          }
          if (reset || event.topics.includes("shares")) await this.loadShares();
          this.current(epoch); this.eventCursor = event.id; this.seenEvents.add(event.id); if (this.seenEvents.size > 512) this.seenEvents.delete(this.seenEvents.values().next().value!); this.retries = 0;
        });
      } catch (e) {
        if (controller.signal.aborted || epoch !== this.epoch) return;
        this.update({ connected: false, streamError: errorText(e) });
        // Denied membership/session must not leave cached private content visible.
        if (e instanceof CollaborationError && [401, 403].includes(e.status)) { if (this.state.account) this.clearPrivateDrafts(this.state.account); this.stop(); this.state = { ...empty(this.state.account), visible: this.state.visible, status: "error", error: errorText(e) }; this.update({}); return; }
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.retries++, 5));
        this.reconnect = setTimeout(() => { this.reconnect = null; if (epoch === this.epoch) this.connect(); }, delay);
      }
    })();
  }
}
