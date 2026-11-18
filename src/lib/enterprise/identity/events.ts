import "server-only";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { ensureIdentitySchema } from "./schema";
export async function prepareIdentityEvents() {
  if (process.env.NAUMI_IDENTITY_AUTHORITY_ENABLED === "1")
    await ensureIdentitySchema();
}
/** Called with the original account/enterprise command transaction. */
export async function identityAccountEvent(
  tx: PoolClient,
  email: string,
  kind: string,
  enterpriseId?: string,
) {
  if (process.env.NAUMI_IDENTITY_AUTHORITY_ENABLED !== "1") return;
  const rows = (
    await tx.query(
      `SELECT i.subject_id,o.enterprise_id FROM app_identity_subjects i JOIN app_identity_organizations o ON o.subject_id=i.subject_id WHERE i.account_email=$1 AND ($2::uuid IS NULL OR o.enterprise_id=$2::uuid)`,
      [email, enterpriseId ?? null],
    )
  ).rows;
  for (const row of rows)
    await tx.query(
      "INSERT INTO app_identity_outbox(event_id,enterprise_id,subject_id,event_type) VALUES($1,$2,$3,$4)",
      [randomUUID(), row.enterprise_id, row.subject_id, kind],
    );
}
