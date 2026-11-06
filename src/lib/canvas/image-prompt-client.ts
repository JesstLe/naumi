import { browserRandomUUID } from '../browser-crypto';
import type { ImagePromptDocument } from './image-prompt-schema';

export type ImagePromptAddress = { projectKey: string; nodeId: string; workspace: string };
export type ImagePromptReceipt = { document: ImagePromptDocument | null; revision: number; workspace?:string; persisted?:boolean };
type Request = (input: string, init?: RequestInit) => Promise<Response>;
type Attempt = { document: ImagePromptDocument; operationId: string; expectedRevision: number };
type Entry = {
  address: ImagePromptAddress; receipt?: ImagePromptReceipt; desired?: ImagePromptDocument;
  loading?: Promise<ImagePromptReceipt>; reloading?: Promise<ImagePromptReceipt>; saving?: Promise<void>; attempt?: Attempt;
  timer?: ReturnType<typeof setTimeout>; error?: Error;
};
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const fingerprint = (document: ImagePromptDocument | null | undefined) => JSON.stringify(canonical(document ?? null));

/** A node owns its queue. An uncertain ACK retains the same operation until
 * reconciled, even if a newer edit is already waiting behind it. No paid work. */
export class ImagePromptClient {
  private entries = new Map<string, Entry>();
  private disposed = false;
  constructor(private request: Request, private current: () => boolean, private notify: () => void = () => {}, private delay = 650,
    private storage: () => DraftStorage | null = () => null) {}
  private storageKey(key:string) { return `naumi:image-prompt-pending:v1:${key}`; }
  private persist(key:string,entry:Entry){
    try{
      const storage=this.storage();
      if(!entry.attempt&&(!entry.desired||fingerprint(entry.desired)===fingerprint(entry.receipt?.document)))storage?.removeItem(this.storageKey(key));
      else storage?.setItem(this.storageKey(key),JSON.stringify({desired:entry.desired,attempt:entry.attempt,revision:entry.receipt?.revision}));
    }catch{/* Browser storage failure keeps the in-memory draft. */}
  }
  private assertCurrent() {
    if (this.disposed || !this.current()) throw new Error('账号或工作空间已切换，提示词保留在原草稿');
  }
  private headers(address: ImagePromptAddress) {
    return { 'content-type': 'application/json', 'x-naumi-workspace': address.workspace, 'x-naumi-project-context': address.projectKey };
  }
  private async body(response: Response): Promise<ImagePromptReceipt> {
    const value = await response.json();
    if (!response.ok) {
      const error = new Error(value.error || '提示词尚未保存，请重试');
      Object.assign(error, { status: response.status, code: value.code });
      throw error;
    }
    if (!Number.isSafeInteger(value.revision) || value.revision < 0 || !('document' in value)) throw new Error('提示词保存回执不完整');
    return { document: value.document, revision: value.revision,...(typeof value.workspace==='string'?{workspace:value.workspace}:{}),...(value.persisted===false?{persisted:false}:{}) };
  }
  private async read(address:ImagePromptAddress):Promise<ImagePromptReceipt>{
    const query = new URLSearchParams({ projectKey: address.projectKey, nodeId: address.nodeId });
    this.assertCurrent();
    // Existing projects own their scope, not the desktop's current default.
    const headers:Record<string,string>={...this.headers(address)};delete headers['x-naumi-workspace'];
    const response=await this.request(`/api/canvas/image-prompts?${query}`,{cache:'no-store',headers,signal:AbortSignal.timeout(15_000)});
    const receipt=await this.body(response);this.assertCurrent();return receipt;
  }
  open(key: string, address: ImagePromptAddress): Promise<ImagePromptReceipt> {
    this.assertCurrent();
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { address }; this.entries.set(key, entry);
      try{
        const saved=JSON.parse(this.storage()?.getItem(this.storageKey(key))||'null');
        if(saved?.desired?.version===1&&typeof saved.desired.prompt==='string'&&Array.isArray(saved.desired.bindings)&&Array.isArray(saved.desired.activeKeys)&&Number.isSafeInteger(saved.revision)){
          entry.desired=saved.desired;
          entry.attempt=saved.attempt?.operationId&&saved.attempt?.document?saved.attempt:{document:saved.desired,operationId:browserRandomUUID(),expectedRevision:saved.revision};
        }
      }catch{/* Ignore malformed tab-local cache; server validates any saved body. */}
    }
    if (entry.receipt) return Promise.resolve({ ...entry.receipt, document: entry.desired ?? entry.receipt.document });
    if (entry.loading) return entry.loading;
    const target = entry;
    target.loading = (async () => {
      const receipt=await this.read(address);
      if(receipt.workspace)target.address={...target.address,workspace:receipt.workspace};
      target.receipt = receipt; target.error = undefined; return { ...receipt, document:target.desired??receipt.document };
    })().catch(error => { target.error = error instanceof Error ? error : new Error('提示词读取失败'); throw error; })
      .finally(() => { target.loading = undefined; if (!this.disposed) this.notify(); });
    return target.loading;
  }
  edit(key: string, document: ImagePromptDocument) {
    this.assertCurrent();
    const entry = this.entries.get(key);
    if (!entry?.receipt) return;
    entry.desired = structuredClone(document);
    this.persist(key,entry);
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.error || entry.saving || fingerprint(entry.desired) === fingerprint(entry.receipt.document)) return;
    entry.timer = setTimeout(() => { entry.timer = undefined; void this.flushKey(key).catch(() => {}); }, this.delay);
  }
  error(key?: string | null) { return key ? this.entries.get(key)?.error?.message ?? null : null; }
  workspace(key?:string|null){return key?this.entries.get(key)?.address.workspace:undefined;}
  persisted(key?:string|null){return key?this.entries.get(key)?.receipt?.persisted!==false:true;}
  activate() { this.disposed = false; }
  async flushKey(key: string): Promise<void> {
    this.assertCurrent(); const entry = this.entries.get(key); if (!entry) return;
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = undefined; }
    if(entry.reloading){await entry.reloading;return this.flushKey(key);}
    if (entry.loading) await entry.loading;
    if(entry.receipt?.persisted===false)return;
    if (entry.saving) { await entry.saving; return this.flushKey(key); }
    if (!entry.receipt || !entry.desired || !entry.attempt && fingerprint(entry.desired) === fingerprint(entry.receipt.document)) return;
    entry.saving = (async () => {
      entry.error = undefined;
      while (entry.attempt || entry.desired && fingerprint(entry.desired) !== fingerprint(entry.receipt!.document)) {
        this.assertCurrent();
        const attempt = entry.attempt ??= { document: structuredClone(entry.desired!), operationId: browserRandomUUID(), expectedRevision: entry.receipt!.revision };
        this.persist(key,entry);
        const response = await this.request('/api/canvas/image-prompts', {
          method: 'POST', headers: this.headers(entry.address), signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({ ...entry.address, workspace: undefined, ...attempt }),
        });
        const receipt = await this.body(response); this.assertCurrent();
        // A response for another body must not acknowledge the user's queued edit.
        if (fingerprint(receipt.document) !== fingerprint(attempt.document)) throw new Error('提示词保存回执不匹配');
        entry.receipt = receipt; entry.attempt = undefined;
        this.persist(key,entry);
      }
    })().catch(error => { entry.error = error instanceof Error ? error : new Error('提示词保存失败'); throw error; })
      .finally(() => { entry.saving = undefined; if (!this.disposed) this.notify(); });
    await entry.saving;
  }
  async flush() {
    // Await all started saves, retaining the first failure instead of hiding it.
    const results = await Promise.allSettled([...this.entries.keys()].map(key => this.flushKey(key)));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  async reloadSaved(key:string,address:ImagePromptAddress){
    this.assertCurrent();
    let entry=this.entries.get(key);
    if(!entry){entry={address};this.entries.set(key,entry);}
    if(entry.reloading)return entry.reloading;
    const target=entry,desired=target.desired;
    if(target.timer){clearTimeout(target.timer);target.timer=undefined;}
    // "Use saved" only discards the queue after an authoritative read succeeds.
    // A rejected GET must retain even an uncertain original operation and its ID.
    target.reloading=(async()=>{
      if(target.saving)await target.saving.catch(()=>{});
      if(target.loading)await target.loading.catch(()=>{});
      const receipt=await this.read(address);
      if(this.entries.get(key)!==target||target.desired!==desired)throw new Error('提示词已继续编辑，当前草稿已保留');
      const nextAddress=receipt.workspace?{...address,workspace:receipt.workspace}:address;
      this.entries.set(key,{address:nextAddress,receipt});
      try{this.storage()?.removeItem(this.storageKey(key));}catch{/* The accepted read still replaces only the in-memory queue. */}
      return receipt;
    })().catch(error=>{
      if(this.entries.get(key)===target)target.error=error instanceof Error?error:new Error('提示词读取失败');
      throw error;
    }).finally(()=>{target.reloading=undefined;if(!this.disposed)this.notify();});
    return target.reloading;
  }
  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) if (entry.timer) clearTimeout(entry.timer);
    this.entries.clear();
  }
}
