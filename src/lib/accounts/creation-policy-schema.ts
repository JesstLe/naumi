import type {PoolClient} from "pg";
/** Additive account-owned state. Audit is the existing management command log, in the same transaction. */
export async function applyAccountCreationPolicySchema(tx:Pick<PoolClient,"query">){
  await tx.query(`CREATE TABLE IF NOT EXISTS app_account_creation_policies(
    email text PRIMARY KEY REFERENCES app_users(email),policy jsonb NOT NULL,updated_by text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),CHECK(jsonb_typeof(policy)='object')
  )`);
}
