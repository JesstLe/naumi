/**
 * Current automatic-quote / original-identity recovery contract.
 * Whole client modules are bundled unmodified. HTTP, auth and browser storage
 * are explicit fixtures; this does not prove a real wallet or supplier charge.
 * The legacy frozen-quote confirmation suite remains unchanged and retains its
 * historical confirmation expectations. This suite exercises today's contract.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
import path from "node:path";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
type Call = { path: string; method: string; body?: any; headers: Headers };
type Accepted = { operationId: string; quoteId: string; credits: number; prompt: string; request: any };
const root = path.resolve(process.env.IMAGEGEN_REQUOTE_ROOT || ".");
const override = process.env.IMAGEGEN_REQUOTE_OVERRIDE_ROOT;
const checks: string[] = [];
const sourcePaths = [
  "src/lib/imagegen/canvas-client.ts", "src/lib/imagegen/client.ts",
  "src/lib/imagegen/http.ts", "src/lib/imagegen/client-recovery.ts",
  "src/lib/saas/workspace-client.ts",
];
const plain = (value: any) => JSON.parse(JSON.stringify(value));
const eq = (actual: any, expected: any, label: string) => {
  assert.deepEqual(plain(actual), plain(expected), label); checks.push(label);
};
async function main() {
  const sourceHashes = await Promise.all(sourcePaths.map(async relative => {
    const file = path.resolve(override || root, relative);
    return { file, sha256: createHash("sha256").update(await readFile(file)).digest("hex") };
  }));
  const bundle = await build({
    stdin: { contents: "export * from './src/lib/imagegen/canvas-client';export * from './src/lib/imagegen/client';export * from './src/lib/saas/workspace-client';", resolveDir: root },
    bundle: true, platform: "node", format: "cjs", write: false,
    plugins: [{
      name: "declared-browser-and-auth-boundaries",
      setup(b) {
        if (override) b.onLoad({ filter: /[\\/]src[\\/]lib[\\/](?:imagegen[\\/](?:canvas-client|client|http|client-recovery)|saas[\\/]workspace-client)\.ts$/ },
          async args => ({ contents: await readFile(path.join(override, path.relative(root, args.path)), "utf8"), loader: "ts", resolveDir: path.dirname(args.path) }));
        b.onResolve({ filter: /^\.\.\/supabase$/ }, () => ({ path: "fixture-auth", namespace: "fixture" }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export async function authHeader(){return {}}", loader: "js" }));
      },
    }],
  });
  const storage = new MemoryStorage(), localStorage = new MemoryStorage();
  let calls: Call[] = [], plans = 0, confirms = 0, prices = [12], paidMode = "success";
  let receipt404 = false, accepted = new Map<string, Accepted>(), quotes = new Map<string, { request: any; credits: number }>();
  const acceptedOrder: string[] = [];
  const posts = () => calls.filter(x => x.path === "/api/imagegen" && x.method === "POST");
  const gets = () => calls.filter(x => x.method === "GET");
  const saved = () => JSON.parse([...storage.values.values()][0]);
  const planChanged = (acceptance?: boolean) => Response.json({
    error: "fixture stale quote", code: "IMAGEGEN_PLAN_CHANGED", ...(acceptance === undefined ? {} : { accepted: acceptance }),
  }, { status: 409 });
  async function fixtureFetch(input: unknown, init?: RequestInit) {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path: url, method, body, headers: new Headers(init?.headers) });
    if (url === "/api/imagegen/plan") {
      const id = "fixture-quote-" + (++plans), credits = prices[Math.min(plans - 1, prices.length - 1)];
      quotes.set(id, { request: plain(body), credits });
      return Response.json({
        request: plain(body), steps: [{ operation: "generate", credits }], intent: { background: null },
        warnings: [], confirmationRequired: false, modelVersion: 135 + plans, billingVersion: 8,
        totalCredits: credits, quote: { id, expiresAt: new Date(Date.now() + 900000).toISOString() },
      });
    }
    if (url === "/api/imagegen" && method === "POST") {
      const index = posts().length;
      if (paidMode === "always-changed") return planChanged(false);
      if (["changed-once", "changed-then-lost"].includes(paidMode) && index === 1) return planChanged(false);
      if (paidMode === "network" || paidMode === "changed-then-lost") throw Error("fixture lost acknowledgment");
      if (paidMode === "timeout") throw new DOMException("fixture timeout", "TimeoutError");
      if (paidMode === "html") return new Response("<html>gateway</html>", { status: 502 });
      if (paidMode === "accepted-error") return planChanged(true);
      if (paidMode === "unknown-error") return planChanged();
      const quote = quotes.get(body.quoteId); assert(quote, "submit uses existing opaque quote");
      eq(body.operationId, quote.request.operationId, "submitted ID equals frozen quote request");
      eq(saved().accepted, "unknown", "unknown persisted before paid network boundary");
      eq(saved().quoteId, body.quoteId, "quote persisted before paid network boundary");
      if (!accepted.has(body.operationId)) {
        accepted.set(body.operationId, { operationId: body.operationId, quoteId: body.quoteId, credits: quote.credits, prompt: quote.request.prompt, request: plain(quote.request) });
        acceptedOrder.push(body.operationId);
      }
      return Response.json({ jobId: "imagegen-" + body.operationId, operationId: body.operationId, status: "queued" });
    }
    assert(method === "GET" && url.startsWith("/api/imagegen?operationId="), "no uploads, cancellation, refunds or external calls");
    if (receipt404) return Response.json({ error: "not visible", accepted: false }, { status: 404 });
    const id = new URL(url, "http://fixture").searchParams.get("operationId")!;
    const entry = accepted.get(id);
    return Response.json({ jobId: "imagegen-" + id, operationId: id, status: "succeeded", chargedCredits: entry?.credits ?? saved().authorizedCredits, artifacts: [] });
  }
  function load(): Record<string, any> {
    const module = { exports: {} }, events = new EventTarget();
    vm.runInNewContext(bundle.outputFiles[0].text, {
      module, exports: module.exports, console, fetch: fixtureFetch, sessionStorage: storage,
      window: { localStorage, confirm: () => { confirms++; return true; },
        addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) },
      Event, CustomEvent, Response, Request, Headers, FormData, File, Blob, URL, AbortSignal, TextEncoder, Uint8Array, DOMException,
      crypto: webcrypto, setTimeout, clearTimeout,
    });
    return module.exports;
  }
  let client = load();
  const scope = { owner: "requote-fixture@example.test", project: "tree:fixture-node" };
  function form(prompt = "draw the frozen bottle") {
    const f = new FormData(); f.set("prompt", prompt); f.set("model", "image-a");
    f.set("quality", "high"); f.set("resolution", "4K"); f.set("ratio", "1:1"); f.set("imagegenNodeId", "fixture-node");
    return f;
  }
  const run = (prompt?: string) => client.submitCanvasImagegen(form(prompt), undefined, undefined, scope);
  function reset() {
    storage.clear(); localStorage.clear(); calls = []; plans = 0; confirms = 0; prices = [12]; paidMode = "success";
    receipt404 = false; accepted = new Map(); quotes = new Map(); acceptedOrder.length = 0; client = load();
  }

  await run();
  eq([plans, posts().length, accepted.size, confirms], [1, 1, 1, 0], "ordinary generation auto-quotes once without second confirmation");
  eq(Object.keys(posts()[0].body).sort(), ["confirmed", "operationId", "quoteId"], "paid POST is only opaque quote and original operation ID");
  eq(saved().request.parameters, { quality: "high", resolution: "4K", ratio: "1:1" }, "pending keeps original semantic selection");
  eq([saved().authorizedCredits, saved().accepted], [12, "accepted"], "ack retains original quote for subsequent delivery");

  for (const latestPrice of [10, 12, 20]) {
    reset(); prices = [12, latestPrice]; paidMode = "changed-once"; await run();
    const id = posts()[0].body.operationId;
    eq([plans, posts().length, accepted.size, confirms], [2, 2, 1, 0], "one explicit unaccepted stale quote permits one automatic requote at " + latestPrice);
    eq(posts().map(c => c.body.operationId), [id, id], "requote retains original operation identity");
    eq(posts().map(c => c.body.quoteId), ["fixture-quote-1", "fixture-quote-2"], "requote submits only latest opaque quote");
    eq([quotes.get("fixture-quote-1")!.credits, accepted.get(id)!.credits, saved().authorizedCredits], [12, latestPrice, latestPrice], "original quote immutable and newly accepted quote remains frozen");
    eq([accepted.get(id)!.prompt, saved().request.prompt], ["draw the frozen bottle", "draw the frozen bottle"], "requote never swaps in a different draft");
    const frozen = plain(accepted.get(id)); prices = [99]; await run("edited after accepted");
    eq([plans, posts().length, gets().length, confirms], [2, 2, 1, 0], "accepted attempt ignores new price and new draft and reads original ID");
    eq(accepted.get(id), frozen, "accepted price and request are unchanged by recovery");
  }

  reset(); prices = [12, 20]; paidMode = "always-changed";
  await assert.rejects(run(), (e: any) => e.code === "IMAGEGEN_PLAN_CHANGED" && e.accepted === false);
  eq([plans, posts().length, accepted.size, confirms], [2, 2, 0, 0], "repeated PLAN_CHANGED is bounded to two previews and two unaccepted submits per action");
  eq(saved().accepted, "unaccepted", "second explicit rejection retains unaccepted original receipt");
  eq(posts()[0].body.operationId, posts()[1].body.operationId, "bounded rejection attempts retain same operation");

  for (const mode of ["network", "timeout", "html", "accepted-error", "unknown-error"]) {
    reset(); paidMode = mode; await assert.rejects(run());
    const id = posts()[0].body.operationId; eq(saved().accepted, "unknown", mode + " retains uncertain acceptance");
    client = load(); receipt404 = true;
    await assert.rejects(run("new draft"), (e: any) => e.accepted === undefined);
    await assert.rejects(run("new draft"));
    eq([plans, posts().length, gets().length, storage.length], [1, 1, 2, 1], mode + " plus 404 never authorizes another POST or quote");
    eq(gets().every(c => c.path.includes(id)), true, mode + " recovery queries exact original identity");
    receipt404 = false; paidMode = "success"; const result = await (await run()).json();
    eq(result.jobId, "imagegen-" + id, mode + " eventually receives original receipt");
    eq([plans, posts().length, confirms], [1, 1, 0], mode + " eventual receipt adds no purchase or confirmation");
  }

  reset(); prices = [12, 20]; paidMode = "changed-then-lost"; await assert.rejects(run());
  const requotedId = posts()[1].body.operationId;
  eq([plans, posts().length, saved().quoteId, saved().authorizedCredits, saved().accepted], [2, 2, "fixture-quote-2", 20, "unknown"], "lost second ACK preserves the latest frozen quote as unknown");
  client = load(); receipt404 = true; await assert.rejects(run());
  eq([plans, posts().length, gets().length], [2, 2, 1], "lost requote ACK cannot cause a third paid POST");
  receipt404 = false; paidMode = "success"; await run();
  eq(saved().operationId, requotedId, "requoted recovery still uses original ID");

  reset(); await run(); const originalId = posts()[0].body.operationId, first = plain(accepted.get(originalId));
  prices = [99]; await run("edited but recovering");
  eq([plans, posts().length, accepted.size], [1, 1, 1], "editing during accepted recovery does not reprice");
  eq(accepted.get(originalId), first, "original accepted price remains fixed");
  client.completeCanvasImagegen("imagegen-" + originalId, { ...scope, workspace: "personal" });
  eq(storage.length, 0, "only completed attachment clears original attempt");
  await run("intentional next purchase");
  assert.notEqual(posts()[1].body.operationId, originalId); checks.push("intentional generation after completed attachment receives new ID");
  eq([plans, posts().length, accepted.size, accepted.get(posts()[1].body.operationId)!.credits], [2, 2, 2, 99], "new completed-followup purchase uses new quote rather than rewriting old quote");
  eq(accepted.get(originalId), first, "new purchase leaves previous accepted operation unchanged");

  reset(); await Promise.all([run(), run()]);
  eq([plans, posts().length, accepted.size], [1, 1, 1], "same in-flight action shares one quote and one POST");
  console.log("REQUOTING_RECOVERY=PASS CHECKS=" + checks.length +
    " AUTOMATIC_QUOTE=ONCE EXPLICIT_UNACCEPTED_REQUOTE_MAX=1 ORIGINAL_ID=PRESERVED UNKNOWN_REPOSTS=0 ACCEPTED_PRICE=FROZEN EXTERNAL_CALLS=0 REAL_WALLET=NOT_RUN");
  console.log("SOURCE_HASHES=" + JSON.stringify(sourceHashes));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
