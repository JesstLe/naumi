/** P2: per-operation drafts of applied model-management operations are pruned; everything else is kept.
 * Isolated PostgreSQL schema via the model registry fixture; zero network, zero supplier calls. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  const f = await createModelFixture();
  const { pruneAppliedOperationDrafts } = await import("../src/lib/model-config/draft-retention");
  let checks = 0;
  const ok = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  try {
    const current = await f.repo.current();
    const op = () => randomUUID();
    const [applied, unknown, unstaged, fresh, extra1, extra2] = [op(), op(), op(), op(), op(), op()];
    const actor = (id: string) => `admin@example.test#mvp:${id}:0123456789abcdef0123`;
    const drafts: Record<string, string> = {};
    for (const id of [applied, unknown, unstaged, fresh, extra1, extra2]) drafts[id] = (await f.repo.draft(actor(id))).id;
    const ordinary = (await f.repo.draft("admin@example.test")).id;
    const publish = (id: string, phase: string) => f.sql.query("INSERT INTO app_model_publications(id,version,expected_version,request_fingerprint,phase) VALUES($1,$2,$2,'fixture',$3)", [id, current.version, phase]);
    await publish(applied, "applied"); await publish(unknown, "unknown"); await publish(fresh, "applied"); await publish(extra1, "applied"); await publish(extra2, "applied");
    await f.sql.query("UPDATE app_model_drafts SET updated_at=now()-interval '1 hour' WHERE id<>$1", [drafts[fresh]]);
    const children = async (draftId: string) => Number((await f.sql.query("SELECT (SELECT count(*) FROM app_model_upstreams WHERE draft_id=$1)+(SELECT count(*) FROM app_model_public_models WHERE draft_id=$1) AS n", [draftId])).rows[0].n);
    ok(await children(drafts[applied]) > 0, "fixture draft holds a full config copy");
    const exists = async (draftId: string) => (await f.sql.query("SELECT 1 FROM app_model_drafts WHERE id=$1", [draftId])).rowCount === 1;

    ok(await pruneAppliedOperationDrafts(f.sql, 2) === 2, "limit bounds one call");
    const removed = await pruneAppliedOperationDrafts(f.sql, 25);
    ok(removed === 1, `remaining old applied draft removed (got ${removed})`);
    for (const id of [applied, extra1, extra2]) ok(!(await exists(drafts[id])), "applied operation draft removed");
    ok(await children(drafts[applied]) === 0, "cascaded config rows removed");
    ok(await exists(drafts[unknown]), "unknown publication keeps its draft for reconciliation");
    ok(await exists(drafts[unstaged]), "operation without a publication keeps its draft");
    ok(await exists(drafts[fresh]), "just-applied draft kept by the age guard");
    ok(await exists(ordinary), "ordinary administrator draft untouched");
    ok((await f.repo.current()).version === current.version, "active version unchanged");
    ok(await pruneAppliedOperationDrafts(f.sql, 25) === 0, "idempotent");
  } finally { await f.cleanup(); }
  console.log(`MODEL_DRAFT_RETENTION=PASS CHECKS=${checks} APPLIED=PRUNED UNKNOWN=KEPT UNSTAGED=KEPT FRESH=KEPT ORDINARY=KEPT BOUNDED=PASS CASCADE=PASS SUPPLIER_CALLS=0`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
