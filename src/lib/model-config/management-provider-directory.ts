import type { CatalogEntry } from "./catalog-store";
import type { ManagementProjection, ManagementRequest } from "./management-session-contract";

type DirectoryPorts = {
  discover(providerId: string, force: boolean, request: ManagementRequest): Promise<CatalogEntry>;
  setRefreshing: ManagementProjection<string[]>;
  onCatalog(catalog: CatalogEntry, current: () => boolean): void;
  onError(message: string): void;
};

/** Read-only discovery under the management session, never a publication lock.
 * A newly installed authoritative snapshot retires older directory results. */
export function createManagementProviderDirectory(ports: DirectoryPorts, active: () => boolean) {
  let revision = 0;
  const requests = new Map<string, { revision: number; controller: AbortController }>();
  const project = () => ports.setRefreshing(() => [...requests.keys()]);
  function cancel(projectState = true) {
    revision += 1;
    for (const owner of requests.values()) owner.controller.abort();
    requests.clear();
    if (projectState) project();
  }
  function pause(signal: AbortSignal) {
    return new Promise<void>(resolve => {
      if (signal.aborted) { resolve(); return; }
      const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
      const timer = setTimeout(finish, 1000);
      signal.addEventListener("abort", finish, { once: true });
    });
  }
  async function refresh(providerId: string, force = true) {
    if (!active() || requests.has(providerId)) return;
    const owner = { revision, controller: new AbortController() };
    requests.set(providerId, owner);
    const current = () => active() && revision === owner.revision && !owner.controller.signal.aborted;
    project();
    try {
      const request = { current, signal: owner.controller.signal };
      let catalog = await ports.discover(providerId, force, request);
      for (let attempt = 0; catalog.refreshing && attempt < 30; attempt++) {
        if (!current()) return;
        await pause(owner.controller.signal);
        if (!current()) return;
        catalog = await ports.discover(providerId, false, request);
      }
      if (current()) ports.onCatalog(catalog, current);
    } catch (error) {
      if (current()) ports.onError(error instanceof Error ? error.message : "目录查询失败");
    } finally {
      if (requests.get(providerId) === owner) requests.delete(providerId);
      if (current()) project();
    }
  }
  return { refresh, cancel };
}
