import { identityConsumer } from "@/lib/enterprise/identity/service";
import { ensureIdentitySchema } from "@/lib/enterprise/identity/schema";
import { getPool } from "@/platform/db/pool";
import { teamJson, teamFailure } from "@/lib/teams/access";
import { z } from "zod";
const schema = z
  .object({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    sequence: z.string().regex(/^\d{1,18}$/),
    appliedMembers: z.number().int().min(0).max(100000),
    error: z
      .string()
      .regex(/^[A-Z0-9_]{1,80}$/)
      .nullable(),
  })
  .strict();
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const consumer = identityConsumer(request.headers.get("authorization"));
    const body = schema.safeParse(await request.json().catch(() => null));
    if (!body.success) return teamJson({ error: "同步回执参数无效" }, 400);
    await ensureIdentitySchema();
    const d = body.data;
    await getPool().query(
      `INSERT INTO app_identity_consumer_acks(enterprise_id,product_id,revision,last_sequence,applied_members,last_error,last_success_at)
    VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6 IS NULL THEN now() ELSE to_timestamp(0) END)
    ON CONFLICT(enterprise_id,product_id) DO UPDATE SET revision=EXCLUDED.revision,last_sequence=EXCLUDED.last_sequence,applied_members=EXCLUDED.applied_members,
    last_error=EXCLUDED.last_error,last_success_at=CASE WHEN EXCLUDED.last_error IS NULL THEN now() ELSE app_identity_consumer_acks.last_success_at END
    WHERE app_identity_consumer_acks.last_sequence<=EXCLUDED.last_sequence`,
      [
        consumer.enterpriseId,
        consumer.productId,
        d.revision,
        d.sequence,
        d.appliedMembers,
        d.error,
      ],
    );
    // Bounded expiry maintenance; persistent authorization rows are not an unbounded file cache.
    await getPool().query(
      "DELETE FROM app_identity_oidc_store WHERE ctid IN (SELECT ctid FROM app_identity_oidc_store WHERE expires_at<now()-interval '1 day' LIMIT 500)",
    );
    return teamJson({ ok: true });
  } catch (e) {
    return teamFailure(e);
  }
}
