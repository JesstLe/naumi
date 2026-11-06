/** Browser storage upkeep and recovery, against an in-memory Storage that
 * enforces a character quota (like the browser's ~5M-char localStorage) and
 * fake-indexeddb. Run: npx tsx scripts/verify-browser-storage-hygiene.ts */
import "fake-indexeddb/auto";
import assert from "node:assert/strict";

class QuotaStorage implements Storage {
  private map = new Map<string, string>();
  constructor(private quota = Infinity) {}
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  removeItem(key: string) { this.map.delete(key); }
  clear() { this.map.clear(); }
  used() { let n = 0; for (const [k, v] of this.map) n += k.length + v.length; return n; }
  setItem(key: string, value: string) {
    const next = this.used() - (this.map.has(key) ? key.length + this.map.get(key)!.length : 0) + key.length + value.length;
    if (next > this.quota) throw Object.assign(new Error("quota"), { name: "QuotaExceededError", code: 22 });
    this.map.set(key, String(value));
  }
  [name: string]: unknown;
}

const local = new QuotaStorage();
const session = new QuotaStorage();
Object.assign(globalThis, { localStorage: local, sessionStorage: session, window: globalThis });

let checks = 0;
const check = (name: string, run: () => void | Promise<void>) => Promise.resolve(run()).then(() => { checks++; console.log("PASS", name); });

async function main() {
  const { boundedWorkbenchPrompts, WORKBENCH_PROMPTS_KEY } = await import("../src/lib/reference-workbench/local-prompts");
  const { setLocalItem, freeLocalStorageSpace, trimWorkbenchPromptStores } = await import("../src/lib/browser-storage/local");
  const { runBrowserStorageHygiene } = await import("../src/lib/browser-storage/hygiene");
  const { clearDisposableBrowserCaches, isStaleAssetError, isDisposableStorageKey } = await import("../src/lib/browser-storage/recovery");

  const prompt = (n: number) => "提示词".repeat(n);
  const promptObject = (count: number, size: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`ref-${i}`, prompt(size) + i]));

  await check("prompt object under budget is returned unchanged", () => {
    const raw = JSON.stringify(promptObject(3, 10));
    assert.equal(boundedWorkbenchPrompts(raw, 10_000), raw);
  });
  await check("prompt object over budget keeps the newest entries within budget", () => {
    const raw = JSON.stringify(promptObject(400, 300));
    const out = boundedWorkbenchPrompts(raw, 50_000), parsed = JSON.parse(out) as Record<string, string>, keys = Object.keys(parsed);
    assert.ok(out.length <= 50_000 && keys.length > 0 && keys.length < 400);
    assert.equal(keys.at(-1), "ref-399");
    assert.deepEqual(keys, Array.from({ length: keys.length }, (_, i) => `ref-${400 - keys.length + i}`));
    assert.equal(parsed["ref-399"], prompt(300) + 399);
  });
  await check("corrupt or non-object prompt store collapses to an empty object", () => {
    assert.equal(boundedWorkbenchPrompts("x".repeat(20), 10), "{}");
    assert.equal(boundedWorkbenchPrompts(JSON.stringify(["a".repeat(20)]), 10), "{}");
  });

  await check("full quota: write succeeds after releasing template cache and workbench prompt history", () => {
    const storage = new QuotaStorage(400_000);
    storage.setItem("naumi:templatesCacheV1", "t".repeat(60_000));
    storage.setItem(`naumi-reference:acct:${WORKBENCH_PROMPTS_KEY}`, JSON.stringify(promptObject(200, 400)));
    storage.setItem("naumi:billing-intent:abc", "11111111-1111-1111-1111-111111111111");
    storage.setItem("naumi:video-generation:abc", JSON.stringify({ ids: ["x"], completed: {} }));
    const big = "r".repeat(400_000 - storage.used() + 50_000);
    assert.throws(() => storage.setItem("naumi:video-retry:v1:a:b", big));
    setLocalItem("naumi:video-retry:v1:a:b", big, storage);
    assert.equal(storage.getItem("naumi:video-retry:v1:a:b"), big);
    assert.equal(storage.getItem("naumi:templatesCacheV1"), null);
    assert.equal(storage.getItem("naumi:billing-intent:abc"), "11111111-1111-1111-1111-111111111111");
    assert.ok(storage.getItem("naumi:video-generation:abc"));
    assert.ok(JSON.parse(storage.getItem(`naumi-reference:acct:${WORKBENCH_PROMPTS_KEY}`)!)["ref-199"], "newest prompt kept");
  });
  await check("full quota with nothing releasable still throws (fail-closed receipts)", () => {
    const storage = new QuotaStorage(1_000);
    storage.setItem("naumi:billing-intent:keep", "k".repeat(900));
    assert.throws(() => setLocalItem("naumi:video-generation:x", "v".repeat(500), storage), (e: Error) => e.name === "QuotaExceededError");
    assert.equal(freeLocalStorageSpace(storage), false);
    assert.equal(storage.getItem("naumi:billing-intent:keep"), "k".repeat(900));
  });
  await check("non-quota storage errors are rethrown unchanged", () => {
    const storage = new QuotaStorage();
    storage.setItem = () => { throw Object.assign(new Error("blocked"), { name: "SecurityError" }); };
    assert.throws(() => setLocalItem("a", "b", storage), (e: Error) => e.name === "SecurityError");
  });

  await check("hygiene: oversized prompt stores trimmed, other accounts' small stores untouched", () => {
    local.clear();
    const big = JSON.stringify(promptObject(2_000, 200)), small = JSON.stringify(promptObject(2, 5));
    local.setItem(`naumi-reference:a:${WORKBENCH_PROMPTS_KEY}`, big);
    local.setItem(`naumi-reference:b:${WORKBENCH_PROMPTS_KEY}`, small);
    const result = runBrowserStorageHygiene(local);
    assert.ok(result.trimmedChars > 0);
    assert.ok(local.getItem(`naumi-reference:a:${WORKBENCH_PROMPTS_KEY}`)!.length <= 300_000);
    assert.equal(local.getItem(`naumi-reference:b:${WORKBENCH_PROMPTS_KEY}`), small);
    assert.equal(trimWorkbenchPromptStores(local), 0, "idempotent");
  });
  await check("hygiene: orphan tool receipt pointers removed, live receipts and their indexes kept", () => {
    local.clear();
    const p = "naumi:tool-generation-receipt:v1:";
    const live = `${p}input:live`, orphan = `${p}input:orphan`;
    local.setItem(live, "job-live");
    local.setItem(`${live}:job:job-live`, JSON.stringify({ version: 1 }));
    local.setItem(orphan, "job-done");
    local.setItem(`${p}latest:["a","personal","fusion"]`, live);
    local.setItem(`${p}latest:["a","personal","variation"]`, orphan);
    local.setItem("naumi:billing-intent:x", "id");
    const result = runBrowserStorageHygiene(local);
    assert.equal(result.orphanReceipts, 2);
    assert.equal(local.getItem(live), "job-live");
    assert.ok(local.getItem(`${live}:job:job-live`));
    assert.equal(local.getItem(orphan), null);
    assert.equal(local.getItem(`${p}latest:["a","personal","fusion"]`), live);
    assert.equal(local.getItem(`${p}latest:["a","personal","variation"]`), null);
    assert.equal(local.getItem("naumi:billing-intent:x"), "id");
  });

  function openDb(name: string) {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("s");
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  const databaseNames = async () => (await indexedDB.databases()).map(d => d.name).sort();

  await check("recovery clears only rebuildable caches; drafts, receipts, preferences and user databases stay", async () => {
    local.clear();
    const keep: Record<string, string> = {
      "naumi:billing-intent:x": "id", "naumi:tool-generation-receipt:v1:input:x": "job-1", "naumi:video-generation:y": "{}",
      "theme": "dark", "naumi:text-model": "m", "naumi:last-email": "a@b.c", "naumi:user:a@b.c": "{}",
      [`naumi-reference:a:${WORKBENCH_PROMPTS_KEY}`]: "{}", "naumi:packaging-strategy:draft:a": "{}",
    };
    const drop = ["naumi:templatesCacheV1", "naumi:cache-account", "naumi:cache-revision:a@b.c", "naumi-image-bytes-v1:account", "naumi-image-bytes-v1:logout"];
    for (const [k, v] of Object.entries(keep)) local.setItem(k, v);
    for (const k of drop) local.setItem(k, "x");
    for (const name of ["naumi-image-bytes-v1", "naumi-business-cache-v1", "naumi-studio3d-v1", "naumi-reference-workbench-history-v1-acct"]) (await openDb(name)).close();
    const result = await clearDisposableBrowserCaches(500);
    assert.equal(result.keys, drop.length);
    for (const k of drop) assert.equal(local.getItem(k), null, k);
    for (const [k, v] of Object.entries(keep)) assert.equal(local.getItem(k), v, k);
    assert.deepEqual(await databaseNames(), ["naumi-reference-workbench-history-v1-acct", "naumi-studio3d-v1"]);
    assert.ok(drop.every(isDisposableStorageKey) && Object.keys(keep).every(k => !isDisposableStorageKey(k)));
  });
  await check("recovery does not hang on a database another tab keeps open", async () => {
    const held = await openDb("naumi-image-bytes-v1"); // no versionchange handler: delete stays blocked
    const started = Date.now();
    await clearDisposableBrowserCaches(300);
    assert.ok(Date.now() - started < 2_000);
    held.close();
  });
  await check("stale asset errors are recognised; ordinary errors are not", () => {
    assert.ok(isStaleAssetError(Object.assign(new Error("Loading chunk 123 failed."), { name: "ChunkLoadError" })));
    assert.ok(isStaleAssetError(new TypeError("Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js")));
    assert.ok(isStaleAssetError(new Error("Loading CSS chunk 9 failed")));
    assert.ok(!isStaleAssetError(new TypeError("Cannot read properties of undefined (reading 'toLowerCase')")));
    assert.ok(!isStaleAssetError(null));
  });

  console.log(`BROWSER_STORAGE_HYGIENE=PASS CHECKS=${checks}`);
}
main().catch(error => { console.error(error); process.exit(1); });
