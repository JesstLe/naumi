/** TEST-ONLY external contract fixture. Production never imports this file.
 * This exercises current membership/account changes in real PG, not the enterprise implementation's entitlement rules.
 */
import type { PoolClient } from "pg";
import { getPool } from "../src/lib/db";
import { CanvasShareError, type ShareScope } from "../src/lib/canvas-sharing/domain";
export type CollaborationScope = ShareScope;
export async function withCollaborationScope<T>(email: string, enterpriseId: string, run: (tx: PoolClient, scope: ShareScope) => Promise<T>): Promise<T> {
  const tx = await getPool().connect();
  try {
    await tx.query("BEGIN");
    const rows = (await tx.query("SELECT email FROM fixture_share_members WHERE enterprise_id=$1 AND active AND NOT banned FOR SHARE", [enterpriseId])).rows;
    const memberIds = new Set<string>(rows.map(r => r.email));
    if (!memberIds.has(email)) throw new CanvasShareError("FIXTURE_MEMBERSHIP_DENIED", "成员不可用", 403);
    const result = await run(tx, { actorId: email, enterpriseId, ownerId: "author@fixture.invalid", memberIds });
    await tx.query("COMMIT"); return result;
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
}
export async function authorizeCollaborationRequest(request: Request): Promise<{ email: string } | Response> {
  const email = request.headers.get("x-fixture-actor"); return email ? { email } : Response.json({ error: "fixture authentication required" }, { status: 401 });
}
export function collaborationFailure(error: unknown): Response {
  return Response.json({ error: error instanceof CanvasShareError ? error.message : "fixture internal error", code: error instanceof CanvasShareError ? error.code : "FIXTURE_INTERNAL" }, { status: error instanceof CanvasShareError ? error.status : 503, headers: { "cache-control": "private, no-store" } });
}
