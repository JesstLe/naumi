import "server-only";
import { getPool } from "@/platform/db/pool";
import { databaseSchemaReadiness } from "@/platform/db/schema-readiness";
import { ensureSchema } from "@/lib/persistence/schema";

// Additive-only DDL owned by the agent gateway module (personal API tokens and their call ledger).
const DDL = `
CREATE TABLE IF NOT EXISTS app_agent_tokens(
  id uuid PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  scopes text[] NOT NULL,
  daily_credit_limit integer CHECK (daily_credit_limit IS NULL OR daily_credit_limit >= 0),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS app_agent_tokens_owner ON app_agent_tokens(email, created_at DESC);
CREATE TABLE IF NOT EXISTS app_agent_gateway_calls(
  token_id uuid NOT NULL REFERENCES app_agent_tokens(id),
  operation_id uuid NOT NULL,
  email text NOT NULL,
  tool text NOT NULL,
  args_sha256 text NOT NULL,
  state text NOT NULL CHECK (state IN ('running','succeeded','failed','rejected')),
  credits integer NOT NULL DEFAULT 0 CHECK (credits >= 0),
  timeout_ms integer NOT NULL,
  result jsonb,
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  PRIMARY KEY(token_id, operation_id)
);
CREATE INDEX IF NOT EXISTS app_agent_gateway_calls_budget ON app_agent_gateway_calls(token_id, created_at);
`;

/** Start of the current budget day (Asia/Shanghai), as a SQL expression. */
export const DAY_START = "(date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')";

export async function ensureAgentGatewaySchema(): Promise<void> {
  const state = databaseSchemaReadiness(getPool(), "agent-gateway");
  await ensureSchema();
  if (!state.pending) state.pending = getPool().query(DDL).then(() => undefined).catch(error => { state.pending = null; throw error; });
  await state.pending;
}
