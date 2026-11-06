import { projectSchema, type StudioProject } from "./project";

// Browser-local engineering assets, partitioned by current account. No claim of cloud sync.
const DB = "naumi-studio3d-v1";
type Row = { key: string; owner: string; project: StudioProject };
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () =>
      request.result
        .createObjectStore("projects", { keyPath: "key" })
        .createIndex("owner", "owner");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(Error("本机工程存储打开失败，请导出工程备份"));
    request.onblocked = () => reject(Error("请关闭旧版工作台标签后重试"));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", mode);
    let request: IDBRequest<T>;
    try {
      request = work(tx.objectStore("projects"));
    } catch (error) {
      tx.abort();
      db.close();
      reject(error);
      return;
    }
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(Error("本机保存失败，可能空间不足；请导出工程备份"));
    };
  });
}
export async function listProjects(owner: string): Promise<StudioProject[]> {
  const rows = await transaction<Row[]>("readonly", (store) =>
    store.index("owner").getAll(owner),
  );
  // One project saved by an older schema must not hide every other project.
  // Unreadable rows stay in IndexedDB untouched; they are only left out of the list.
  const projects: StudioProject[] = [];
  for (const row of rows) {
    const parsed = projectSchema.safeParse(row.project);
    if (parsed.success) projects.push(parsed.data);
    else console.warn("studio3d: skipped unreadable local project", row.key);
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveProject(owner: string, project: StudioProject) {
  if (!owner) throw Error("请先登录后保存工程");
  const value = projectSchema.parse(project);
  await transaction("readwrite", (store) =>
    store.put({ key: `${owner}:${value.id}`, owner, project: value }),
  );
}
export async function deleteProject(owner: string, id: string) {
  await transaction("readwrite", (store) => store.delete(`${owner}:${id}`));
}
