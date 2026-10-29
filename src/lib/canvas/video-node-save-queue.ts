import type {CanvasVideoNode, VideoNodeWrite} from './video-node-schema';
import {browserRandomUUID} from '../browser-crypto';
import {sameVideoSnapshot} from '../video/polling-state';

type Patch = Partial<Omit<VideoNodeWrite, 'id' | 'operationId'>>;
type Attempt = {body: string; url: string; method: string; revision: number; projectKey?: string};
type Entry = {journalId: string; patch: Patch; attempt?: Attempt; baseRevision: number; uncertain?: boolean; promise: Promise<CanvasVideoNode>};
export class VideoNodeClientError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

/** One node's distinct edits remain ordered. Only its identical tail is shared:
 * A -> B -> A must not collapse to A -> B. An ambiguous response keeps the exact
 * operation ID, expected revision and body for a bounded/manual retry. */
export class VideoNodeSaveQueue {
  private tails = new Map<string, Entry>();
  private failed = new Map<string, Entry>();
  private pending = new Map<string, Entry[]>();
  private lifetime = new AbortController();
  constructor(private options: {
    request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    current: () => boolean;
    getNode: (id: string) => CanvasVideoNode | undefined;
    accept: (node: CanvasVideoNode) => void;
    changed: (error: Error | null) => void;
    conflict: () => void;
    workspace: string;
    journal?: {key: string; storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>};
    pendingChanged?: (count: number) => void;
  }) {
    try {
      const raw = options.journal?.storage.getItem(options.journal.key);
      if (raw) for (const [id, keys] of JSON.parse(raw) as [string, string[]][]) {
        if (!Array.isArray(keys)) continue;
        const entries = keys.filter(key => /^[0-9a-f-]{36}$/i.test(key)).map(key => {
          const record = options.journal!.storage.getItem(`${options.journal!.key}:${key}`);
          return record ? {...JSON.parse(record), journalId: key} as Entry : null;
        }).filter((entry): entry is Entry => {
          if (!entry) return false;
          if (!entry.patch || !Number.isSafeInteger(entry.baseRevision) || entry.baseRevision < 0) return false;
          if (!entry.attempt) return true;
          const attempt = entry.attempt, body = JSON.parse(attempt.body);
          return body.id === id && body.expectedRevision === entry.baseRevision && attempt.revision === entry.baseRevision &&
            (attempt.method === 'PATCH' && attempt.url === `/api/canvas/video-nodes/${encodeURIComponent(id)}` ||
             attempt.method === 'POST' && attempt.url === '/api/canvas/video-nodes');
        }).map(entry => ({...entry, promise: Promise.resolve(null as unknown as CanvasVideoNode)}));
        if (entries.length) { this.pending.set(id, entries); this.failed.set(id, entries[0]); }
      }
    } catch { options.changed(new Error('本地保存草稿读取失败，请保留此页面')); }
    this.options.pendingChanged?.(this.pendingCount);
  }

  get pendingCount() { return [...this.pending.values()].reduce((sum, entries) => sum + entries.length, 0); }
  private journal(entry?: Entry) {
    if (this.lifetime.signal.aborted) return;
    this.options.pendingChanged?.(this.pendingCount);
    const target = this.options.journal;
    if (!target) return;
    try {
      // Only this edit's payload is encoded. The small index contains IDs, never
      // the whole queue's prompts/configs again on each keystroke or ACK.
      if (entry) {
        const {patch, attempt, baseRevision, uncertain} = entry;
        target.storage.setItem(`${target.key}:${entry.journalId}`, JSON.stringify({patch, attempt, baseRevision, uncertain}));
      }
      if (this.pending.size) target.storage.setItem(target.key, JSON.stringify([...this.pending].map(([id, entries]) =>
        [id, entries.map(entry => entry.journalId)])));
      else target.storage.removeItem(target.key);
    } catch { this.options.changed(new Error('本地保存草稿空间不足，请等待服务器保存后再关闭页面')); }
  }
  private removePending(id: string, entry: Entry) {
    const records = (this.pending.get(id) || []).filter(record => record !== entry);
    if (records.length) this.pending.set(id, records); else this.pending.delete(id);
    this.journal();
    try { this.options.journal?.storage.removeItem(`${this.options.journal.key}:${entry.journalId}`); } catch { /* A retained ACKed draft still replays the same operation. */ }
  }

  private assertCurrent() {
    if (this.lifetime.signal.aborted || !this.options.current()) throw new Error('画布账号或编辑状态已改变');
  }

  save(id: string, patch: Patch, restored?: Entry): Promise<CanvasVideoNode> {
    try { this.assertCurrent(); } catch (error) { return Promise.reject(error); }
    const tail = this.tails.get(id);
    if (tail && sameVideoSnapshot(tail.patch, patch)) return tail.promise;
    const previous = this.failed.get(id);
    const reused = !tail && previous && sameVideoSnapshot(previous.patch, patch) ? previous : undefined;
    const entry: Entry = restored || reused || {
      journalId: browserRandomUUID(),
      patch: structuredClone(patch),
      baseRevision: patch.expectedRevision ?? (tail ? tail.baseRevision + 1 : this.options.getNode(id)?.revision ?? 0),
      promise: Promise.resolve(null as unknown as CanvasVideoNode),
    };
    if (!(this.pending.get(id) || []).includes(entry)) this.pending.set(id, [...(this.pending.get(id) || []), entry]);
    this.journal(entry);
    entry.promise = (tail?.promise || Promise.resolve()).catch(() => {}).then(async () => {
      this.assertCurrent();
      const unresolved = this.failed.get(id);
      // Already queued edits are not additional retry budgets for one outage.
      if (unresolved && unresolved !== previous) throw new Error('前一修改尚未保存，请重试当前修改');
      // Do not let a later edit replace an unknown committed write with a fresh
      // nonce. First reconcile its real receipt; no added DB lock is required.
      if (unresolved?.attempt && unresolved.uncertain) {
        if (sameVideoSnapshot(unresolved.patch, entry.patch)) entry.attempt = unresolved.attempt;
        else {
          const recovered = await this.send(id, unresolved.attempt);
          this.assertCurrent();
          this.options.accept(recovered);
          this.failed.delete(id);
          this.removePending(id, unresolved);
        }
      }
      const old = this.options.getNode(id);
      if (!entry.attempt) {
        const revision = entry.baseRevision;
        entry.attempt = {
          body: JSON.stringify({...entry.patch, id, expectedRevision: revision, operationId: browserRandomUUID()}),
          url: old ? `/api/canvas/video-nodes/${encodeURIComponent(id)}` : '/api/canvas/video-nodes',
          method: old ? 'PATCH' : 'POST', revision, projectKey: entry.patch.projectKey ?? old?.projectKey,
        };
        // The exact nonce/body must survive navigation before a POST is sent.
        entry.uncertain = true;
        this.journal(entry);
      }
      try {
        const node = await this.send(id, entry.attempt);
        this.assertCurrent();
        this.failed.delete(id);
        this.options.accept(node);
        this.removePending(id, entry);
        if (previous && previous !== entry && previous.uncertain === false) this.removePending(id, previous);
        this.options.changed(this.failed.size ? new Error('视频节点仍有未保存的修改，请重试') : null);
        return node;
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error('视频节点保存失败');
        entry.uncertain = !(error instanceof VideoNodeClientError) || [408, 500, 502, 503, 504].includes(error.status);
        this.failed.set(id, entry);
        this.journal(entry);
        if (!this.lifetime.signal.aborted && this.options.current()) {
          this.options.changed(error);
          if (error instanceof VideoNodeClientError && error.status === 409) this.options.conflict();
        }
        throw error;
      }
    });
    this.tails.set(id, entry);
    void entry.promise.finally(() => { if (this.tails.get(id) === entry) this.tails.delete(id); }).catch(() => {});
    return entry.promise;
  }

  private async send(id: string, attempt: Attempt): Promise<CanvasVideoNode> {
    for (let retry = 0; ; retry++) {
      this.assertCurrent();
      const controller = new AbortController();
      const abort = () => controller.abort();
      this.lifetime.signal.addEventListener('abort', abort, {once: true});
      const timeout = setTimeout(abort, 20_000);
      try {
        const response = await this.options.request(attempt.url, {
          method: attempt.method,
          headers: {'content-type': 'application/json', 'x-naumi-workspace': this.options.workspace},
          body: attempt.body, signal: controller.signal,
        });
        const data = await response.json().catch(() => {
          throw new VideoNodeClientError('保存回执未核实，请重试', response.ok ? 502 : response.status);
        });
        if (!response.ok) throw new VideoNodeClientError(data.error || '视频节点保存失败', response.status, data.code);
        const node = data.node as CanvasVideoNode | undefined;
        // An HTTP success (including a no-DB fallback) is not a persistence ACK.
        if (!node || node.id !== id || !Number.isSafeInteger(node.revision) || node.revision !== attempt.revision + 1 ||
            (attempt.projectKey !== undefined && node.projectKey !== attempt.projectKey)) {
          throw new VideoNodeClientError('保存回执未核实，请重试', 502);
        }
        return node;
      } catch (error) {
        this.assertCurrent();
        // Do not retry auth, validation or CAS conflicts, and never silently rebase.
        if (retry >= 2 || error instanceof VideoNodeClientError && ![408, 502, 503, 504].includes(error.status)) throw error;
      } finally {
        clearTimeout(timeout);
        this.lifetime.signal.removeEventListener('abort', abort);
      }
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new Error('画布账号或编辑状态已改变')); };
        const timer = setTimeout(() => { this.lifetime.signal.removeEventListener('abort', abort); resolve(); }, retry === 0 ? 500 : 1500);
        this.lifetime.signal.addEventListener('abort', abort, {once: true});
        if (this.lifetime.signal.aborted) abort();
      });
    }
  }

  async flush(retryingNodeId?: string) {
    if (retryingNodeId !== undefined) {
      // An explicit save drains only this node and can retry its failed attempt.
      // The global barrier below still rejects unresolved failures.
      while (this.tails.has(retryingNodeId)) await this.tails.get(retryingNodeId)!.promise;
      return;
    }
    // Drain edits appended during a save as well as the initial queue snapshot.
    while (this.tails.size) await Promise.all([...this.tails.values()].map(entry => entry.promise));
    if (this.failed.size || this.pending.size) throw new Error('视频节点仍有未保存的修改，请重试');
  }
  async retryPending() {
    // Explicit user recovery, not a background retry loop. Preserve original CAS.
    for (const [id, entries] of [...this.pending]) {
      for (const entry of [...entries]) {
        if (!(this.pending.get(id) || []).includes(entry)) continue;
        await this.save(id, entry.patch, entry);
      }
    }
  }
  dispose() { this.lifetime.abort(); }
}
