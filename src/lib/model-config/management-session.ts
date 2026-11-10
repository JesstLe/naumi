import { createManagementProviderDirectory } from "./management-provider-directory";
import { readManagementOperation, type ManagementState, type ManagementOperation, type ManagementRequest,
  type ManagementPublication, type ManagementProjection, type ManagementStorage } from "./management-session-contract";
import type { CatalogEntry } from "./catalog-store";

type Scope = { active: boolean };
type Receipt = { body: ManagementOperation; bytes: string };
type PublicationCallbacks = { onDispatch(): void; onSettled(): void };
export type ManagementSessionPorts = {
  read(request: ManagementRequest): Promise<ManagementState>;
  publish(operation: ManagementOperation, request: ManagementRequest): Promise<ManagementPublication>;
  discover(providerId: string, force: boolean, request: ManagementRequest): Promise<CatalogEntry>;
  storage: ManagementStorage;
  uuid(): string;
  refreshCatalog(): void;
  setState: ManagementProjection<ManagementState | null>;
  setLoading: ManagementProjection<boolean>;
  setBusy: ManagementProjection<boolean>;
  setPending: ManagementProjection<ManagementOperation | null>;
  setRefreshing: ManagementProjection<string[]>;
  setError(message: string): void;
  setNotice(message: string): void;
};

const refreshedActions = new Set(["video-capability-upgrade", "pricing", "parameters", "video-parameters", "resolutions", "channels", "order", "scope", "switch", "rename", "identity"]);
function appliedNotice(action: string) {
  return action === "identity" ? "名称与公开 ID 已更新。" : action === "video-capability-upgrade" ? "视频能力已更新。" : action === "video-parameters" ? "视频能力已生效。" : action === "channels" ? "供应通道已生效，新任务使用新策略，已接受任务保留原配置。" : action === "resolutions" ? "分辨率显示与供应通道映射已生效。新任务使用新配置，已接受任务保留原参数。" : action === "order" ? "模型排序已生效，前端各工具按此顺序展示可用模型。" : action === "parameters" ? "显示档位与上游映射已生效。新请求使用新参数，已接受的任务保留原映射。" : action === "pricing" ? "积分售价已生效。前端报价与实际扣费使用同一配置，已开始的任务保留原报价。" : action === "scope" ? "工具范围已生效。新请求使用新范围，已经开始的任务保留原配置。" : action === "rename" ? "显示名称已更新，前端刷新模型列表后生效。" : action === "switch" ? "实际模型已切换。新请求使用新配置，已经开始的任务保留原模型。" : action === "connect" ? "上游已接入，正在自动发现模型 ID。" : "模型已添加到可切换列表。";
}

/** One browser management session. It owns observation and original publication
 * identity; it never owns server authorization, CAS, drafts or applied config. */
export function createModelManagementSession(ports: ManagementSessionPorts) {
  let scope: Scope | null = null, sequence = 0;
  let readController: AbortController | null = null;
  let pending: Receipt | null = null;
  let attempt: { scope: Scope; receipt: Receipt } | null = null;
  const owns = (owner: Scope | null): owner is Scope => Boolean(owner?.active && scope === owner);
  const directory = createManagementProviderDirectory({
    discover: ports.discover, setRefreshing: ports.setRefreshing, onError: ports.setError,
    onCatalog: (catalog, current) => ports.setState(old => current() && old ? {
      ...old, catalogs: [...old.catalogs.filter(item => item.providerId !== catalog.providerId), catalog],
    } : old),
  }, () => owns(scope));

  async function load(discover = false): Promise<ManagementState | null> {
    const owner = scope;
    if (!owns(owner)) return null;
    readController?.abort();
    const controller = new AbortController(), capturedSequence = ++sequence;
    readController = controller;
    const current = () => owns(owner) && capturedSequence === sequence && !controller.signal.aborted;
    ports.setLoading(previous => current() ? true : previous);
    let loaded: ManagementState | null = null, providers: ManagementState["providers"] = [];
    try {
      const data = await ports.read({ current, signal: controller.signal });
      if (!current()) return null;
      directory.cancel();
      ports.setState(previous => current() ? data : previous);
      loaded = data;
      if (discover) providers = data.providers.filter(provider => provider.enabled && provider.configured &&
        (!data.catalogs.find(catalog => catalog.providerId === provider.id) || data.catalogs.find(catalog => catalog.providerId === provider.id)!.stale));
    } catch (error) {
      if (current()) ports.setError(error instanceof Error ? error.message : "读取失败");
    } finally {
      if (current()) { readController = null; ports.setLoading(previous => current() ? false : previous); }
    }
    void (async () => { for (const provider of providers) if (current()) await directory.refresh(provider.id, false); })();
    return loaded;
  }
  function clearPending(receipt: Receipt) {
    if (pending === receipt) { pending = null; ports.setPending(null); }
    // Another mounted owner may have persisted a newer receipt under the legacy
    // key. Completing this operation does not authorize deleting that identity.
    try { if (ports.storage.read() === receipt.bytes) ports.storage.remove(); } catch { /* In-memory receipt remains authoritative for this view. */ }
  }
  async function publish(operation: ManagementOperation, callbacks: PublicationCallbacks) {
    const owner = scope;
    if (attempt || !owns(owner)) return;
    // Snapshot exactly what will cross the wire before auth or editor awaits.
    const bytes = JSON.stringify(operation), receipt: Receipt = { bytes, body: JSON.parse(bytes) };
    if (pending && pending.bytes !== bytes) return;
    const request = { scope: owner, receipt };
    attempt = request; pending = receipt;
    const current = () => owns(owner);
    ports.setBusy(true); ports.setError(""); ports.setNotice(""); ports.setPending(receipt.body);
    callbacks.onDispatch();
    try { ports.storage.write(bytes); } catch { /* Keep the same body in memory when storage is unavailable. */ }
    try {
      // No AbortSignal: once dispatched, an accepted publication keeps draining.
      const result = await ports.publish(receipt.body, { current });
      if (!current()) return;
      if (result.publication.phase !== "applied") {
        callbacks.onSettled(); ports.setNotice("发布结果待核对。请点击“核对并继续”，系统会沿用同一操作，不重复创建发布。"); return;
      }
      clearPending(receipt); callbacks.onSettled();
      if (refreshedActions.has(receipt.body.action)) ports.refreshCatalog();
      ports.setNotice(appliedNotice(receipt.body.action));
      const refreshed = await load(true);
      if (!current()) return;
      if (receipt.body.action === "imagegen-parameters") { ports.refreshCatalog(); ports.setNotice("图像高级能力与实际参数已发布，新任务使用新映射。"); }
      return refreshed;
    } catch (error) {
      if (!current()) return;
      const failure = error as Error & { code?: string; operationNotStaged?: boolean; publication?: { phase: string } };
      if (failure.operationNotStaged || failure.publication?.phase === "failed") clearPending(receipt);
      else callbacks.onSettled();
      ports.setError(failure.message || "操作失败，请重试");
      if (failure.code === "METADATA_CHANGED") await load(false);
    } finally {
      if (attempt === request) attempt = null;
      if (current()) ports.setBusy(false);
    }
  }
  function mount() {
    if (scope) scope.active = false;
    readController?.abort(); directory.cancel(false);
    const owner = { active: true }; scope = owner; sequence += 1; attempt = null;
    let restored: ManagementOperation | null = null;
    try { restored = readManagementOperation(ports.storage.read()); } catch { /* Storage may be unavailable. */ }
    pending = restored ? { body: restored, bytes: JSON.stringify(restored) } : null;
    ports.setPending(restored); ports.setBusy(false); ports.setRefreshing([]);
    void load(true);
    return () => {
      owner.active = false;
      if (scope === owner) { sequence += 1; readController?.abort(); readController = null; directory.cancel(false); }
    };
  }
  function operation(action: string, fields: Record<string, unknown>, state: ManagementState): ManagementOperation {
    return { ...fields, action, id: ports.uuid(), expectedVersion: state.version, ...(action === "pricing" ? { expectedBillingVersion: state.billingVersion } : {}) };
  }
  return { mount, load, publish, operation, refreshProvider: directory.refresh };
}
