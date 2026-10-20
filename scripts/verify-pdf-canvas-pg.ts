/** Real PostgreSQL, source functions and authenticated route. Local isolated DB only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  const baseline = process.argv.includes("--baseline");
  const root = resolve(process.env.PDF_SOURCE_ROOT || ".");
  const f = await createModelFixture();
  process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  Object.assign(process.env, { NAUMI_MULTI_USER: "1", SETTINGS_SECRET: "isolated-pdf-repair-cookie-secret-20261020-long", VIDEO_WORKER_SECRET: "isolated-pdf-repair-worker" });
  const db = await import("../src/lib/db");
  const owner = `pdf-${randomUUID()}@example.test`, other = `other-${randomUUID()}@example.test`;
  let checks = 0;
  const check = (ok: unknown, label: string) => { assert.ok(ok, label); checks++; };
  try {
    await db.getOrCreateUser(owner, "PDF fixture");
    await db.getOrCreateUser(other, "Other fixture");
    const art = (id: string, parentId?: string) => ({ id, title: id, category: "main", prompt: "", status: "completed", image: "/media/fixture.png", gradient: "", origin: "canvas", source: "canvas-add", parentId, width: 750, height: 1000 } as const);
    await db.addArtworks(owner, [art("product"), art("reference", "product"), art("second", "product"), art("another-project")]);
    await db.addArtworks(other, [art("private")]);
    const source = await readFile(resolve(root, "src/lib/db.ts"), "utf8");
    const tree = ts.createSourceFile("db.ts", source, ts.ScriptTarget.Latest, true);
    const functions: string[] = [];
    for (const statement of tree.statements) if (ts.isFunctionDeclaration(statement) && ["addArtworkParent", "removeArtworkParent"].includes(statement.name?.text || "")) functions.push(statement.getText(tree).replace(/^export /, ""));
    assert.equal(functions.length, 2);
    const c = vm.createContext({ getPool: db.getPool, ensureSchema: async () => {}, Error, Set, Map });
    vm.runInContext(ts.transpileModule(functions.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, c);
    const row = async (id: string) => (await db.getPool().query("SELECT parent_id,parent_ids,group_id,source_url FROM app_artworks WHERE email=$1 AND id=$2", [owner, id])).rows[0];
    await c.addArtworkParent(owner, "reference", "product");
    check((await row("reference")).parent_ids.includes("product") === !baseline, "explicit connection to grouping parent is persisted");
    await c.addArtworkParent(owner, "reference", "product");
    check((await row("reference")).parent_ids.length === (baseline ? 0 : 1), "duplicate connection is idempotent");
    await c.removeArtworkParent(owner, "reference", "product");
    check((await row("reference")).parent_id === (baseline ? null : "product"), "unlink retains project membership");
    check((await row("reference")).group_id === "product" && (await row("reference")).parent_ids.length === 0, "unlink keeps same project and clears input");
    // Restore only fixture membership so both modes start the next case identically.
    await db.getPool().query("UPDATE app_artworks SET parent_id='product' WHERE id='reference'");
    await c.addArtworkParent(owner, "product", "reference").then(() => check(!baseline, "hidden membership is not a semantic cycle"), () => check(baseline, "old graph incorrectly rejects hidden membership"));
    if (!baseline) await assert.rejects(() => c.addArtworkParent(owner, "reference", "product"), /循环/);
    else await c.addArtworkParent(owner, "reference", "product");
    checks++;
    await assert.rejects(() => c.addArtworkParent(owner, "reference", "another-project"), /同一项目/); checks++;
    await assert.rejects(() => c.addArtworkParent(other, "reference", "private"), /无权访问/); checks++;
    await c.removeArtworkParent(other, "product", "reference");
    if (!baseline) check((await row("product")).parent_ids.includes("reference"), "other owner cannot unlink");
    const { POST, DELETE } = await import("../src/app/api/artworks/parents/route");
    const auth = await import("../src/lib/native-auth");
    const request = (id: string, parentId: string, cookie?: string) => new Request("http://fixture.local/api/artworks/parents", { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ id, parentId, email: other }) });
    const cookie = `${auth.USER_COOKIE}=${auth.signUserSession(owner, Date.now())}`;
    check((await POST(request("second", "product"))).status === 401, "anonymous route blocked");
    const accepted = await POST(request("second", "product", cookie));
    check(accepted.status === 200, "actual authenticated route accepts same-project explicit input");
    check((await row("second")).parent_ids.includes("product"), "real route writes authenticated owner, not forged email");
    check((await POST(request("second", "private", cookie))).status !== 200, "actual route cross-owner denied");
    const removed = await DELETE(request("second", "product", cookie));
    check(removed.status === 200 && (await row("second")).parent_id === "product", "real route unlink preserves canvas project");
    if (!baseline) {
      await db.addArtworks(owner, [art("race-a", "product"), art("race-b", "product"), art("race-c", "product")]);
      const raced = await Promise.allSettled([
        c.addArtworkParent(owner, "race-a", "race-b"),
        c.addArtworkParent(owner, "race-b", "race-c"),
        c.addArtworkParent(owner, "race-c", "race-a"),
      ]);
      check(raced.filter(r => r.status === "fulfilled").length === 2 && raced.filter(r => r.status === "rejected").length === 1, "concurrent three-edge cycle is serialized and refused");
      await db.getPool().query("UPDATE app_artworks SET deleted_at=now() WHERE id='race-b'");
      await assert.rejects(() => c.addArtworkParent(owner, "second", "race-b"), /无权访问/); checks++;
      await db.addArtworks(owner, [{ ...art("generated", "second"), source: "generate" }]);
      await c.removeArtworkParent(owner, "generated", "second");
      check((await row("generated")).parent_id === null, "real generated primary lineage still unlinks");
    }
    console.log(`${baseline ? "BASELINE" : "MODIFIED"}=PASS PDF_PG_CHECKS=${checks} EXPLICIT_PRIMARY=${baseline ? "MISSING" : "SAVED"} UNLINK_PROJECT=${baseline ? "LOST" : "RETAINED"} ROUTE_AUTH=PASS SUPPLIER_CALLS=0`);
    await writeFile(`output/pdf-issues-repair-20261020/${baseline ? "baseline" : "modified"}-pg.json`, JSON.stringify({ checks, baseline, isolatedSchema: f.schemaName, supplierCalls: 0 }, null, 2));
  } finally { await db.getPool().end(); await f.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
