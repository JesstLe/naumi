import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";

// ── Agent 任务会话 ──────────────────────────────────────────────────────────
export type AgentSessionRow = {
  id: string;
  email: string;
  title: string;
  messages: unknown;
  steps: unknown;
  created_at: string;
  updated_at: string;
};

export async function saveAgentSession(
  email: string,
  id: string,
  title: string,
  messages: unknown,
  steps: unknown
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO app_agent_sessions (id, email, title, messages, steps, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (email, id) DO UPDATE SET
       title = EXCLUDED.title,
       messages = EXCLUDED.messages,
       steps = EXCLUDED.steps,
       updated_at = now()`,
    [id, email.toLowerCase(), title.slice(0, 120), JSON.stringify(messages ?? []), JSON.stringify(steps ?? [])]
  );
}

export async function getAgentSession(
  email: string,
  id: string
): Promise<AgentSessionRow | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, email, title, messages, steps, created_at, updated_at
       FROM app_agent_sessions WHERE id = $1 AND email = $2`,
    [id, email.toLowerCase()]
  );
  return (rows[0] as AgentSessionRow) ?? null;
}

export async function listAgentSessions(
  email: string,
  limit = 20,
  excludeCanvas = false
): Promise<AgentSessionRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, email, title, messages, steps, created_at, updated_at
       FROM app_agent_sessions WHERE email = $1 AND ($3::boolean=false OR id NOT LIKE 'cv-%')
      ORDER BY updated_at DESC LIMIT $2`,
    [email.toLowerCase(), limit, excludeCanvas]
  );
  return rows as AgentSessionRow[];
}

export async function renameAgentSession(
  email: string,
  id: string,
  title: string
): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE app_agent_sessions
        SET title = $3, updated_at = now()
      WHERE id = $1 AND email = $2`,
    [id, email.toLowerCase(), title.slice(0, 120)]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteAgentSession(email: string, id: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `DELETE FROM app_agent_sessions WHERE id = $1 AND email = $2`,
    [id, email.toLowerCase()]
  );
}
