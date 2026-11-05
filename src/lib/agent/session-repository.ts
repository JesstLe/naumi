import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";

// Session data and monotonic revision CAS share one owner; schema migration belongs to startup.
export type AgentSessionRow = {
  id: string;
  email: string;
  title: string;
  messages: unknown;
  steps: unknown;
  created_at: string;
  updated_at: string;
  /** Exact database timestamp, not a JS Date rounded to milliseconds. */
  revision?: string;
};

export async function saveAgentSession(
  email: string,
  id: string,
  title: string,
  messages: unknown,
  steps: unknown,
  expectedRevision?: string | null
): Promise<string> {
  await ensureSchema();
  const values = [id, email.toLowerCase(), title.slice(0, 120), JSON.stringify(messages ?? []), JSON.stringify(steps ?? [])];
  // UPDATE must never become INSERT: a deleted session cannot be resurrected by
  // a late cached writer, including a delete racing this statement.
  const saved = typeof expectedRevision === "string" ? await getPool().query(
    `UPDATE app_agent_sessions SET title=$3,messages=$4,steps=$5,
       updated_at=GREATEST(clock_timestamp(),updated_at + interval '1 microsecond')
     WHERE id=$1 AND email=$2 AND updated_at=$6::timestamptz
     RETURNING updated_at::text AS revision`, [...values, expectedRevision]
  ) : await getPool().query(
    `INSERT INTO app_agent_sessions (id, email, title, messages, steps, updated_at)
     VALUES ($1,$2,$3,$4,$5,clock_timestamp())
     ON CONFLICT (email, id) DO UPDATE SET
       title = EXCLUDED.title,
       messages = EXCLUDED.messages,
       steps = EXCLUDED.steps,
       updated_at = GREATEST(clock_timestamp(),app_agent_sessions.updated_at + interval '1 microsecond')
     WHERE $6::boolean
     RETURNING updated_at::text AS revision`,
    [...values, expectedRevision === undefined]
  );
  if (!saved.rows[0]) throw Object.assign(new Error("会话已在其他连接更新，请重新打开会话；已有任务不会重新执行"), { code: "AGENT_SESSION_CONFLICT" });
  return saved.rows[0].revision as string;
}

export async function getAgentSession(
  email: string,
  id: string
): Promise<AgentSessionRow | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, email, title, messages, steps, created_at, updated_at, updated_at::text AS revision
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
        SET title = $3, updated_at = GREATEST(clock_timestamp(),updated_at + interval '1 microsecond')
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
