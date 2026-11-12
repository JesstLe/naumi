import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {withTransaction} from "@/platform/db/transaction";
import type {PoolClient} from "pg";
import {releaseRuntimeEnabled} from "../release-runtime/identity";
import {ensureReleaseSchema, assertIdleAgentSessionTx} from "../release-runtime/store";

async function mutateHistory<T>(email:string,id:string,localIdle:()=>void,write:(tx:PoolClient)=>Promise<T>) {
  await ensureSchema();
  const global=releaseRuntimeEnabled();
  if(global)await ensureReleaseSchema();
  return withTransaction(getPool(),async tx=>{
    if(global)await assertIdleAgentSessionTx(tx,email,id,id.startsWith("cv-")?"canvas":"workbench");
    localIdle();
    return write(tx);
  });
}

// Session data and monotonic revision CAS share one owner; schema migration belongs to startup.
export type AgentSessionRow = {
  id: string;
  email: string;
  title: string;
  messages: unknown;
  steps: unknown;
  created_at: string;
  updated_at: string;
  pinned?: boolean;
  last_image_url?: string | null;
  message_count?: number;
  /** Exact database timestamp, not a JS Date rounded to milliseconds. */
  revision?: string;
};

/** Sidebar thumbnail: the last inline markdown image of the latest message that
 * has one. Content is already media-sanitized at admission; this only picks the
 * URL and keeps a cheap shape guard, never parses the whole conversation. */
function extractLastSessionImage(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = (messages[i] as { content?: unknown } | null)?.content;
    if (typeof content !== "string" || !content.includes("!(")) continue;
    const matches = content.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g);
    let url: string | undefined;
    for (const match of matches) url = match[1];
    if (url && /^(https?:\/\/|\/)/.test(url)) return url.slice(0, 500);
  }
  return null;
}

export async function saveAgentSession(
  email: string,
  id: string,
  title: string,
  messages: unknown,
  steps: unknown,
  expectedRevision?: string | null
): Promise<string> {
  await ensureSchema();
  const values = [id, email.toLowerCase(), title.slice(0, 120), JSON.stringify(messages ?? []), JSON.stringify(steps ?? []), extractLastSessionImage(messages)];
  // UPDATE must never become INSERT: a deleted session cannot be resurrected by
  // a late cached writer, including a delete racing this statement.
  const saved = typeof expectedRevision === "string" ? await getPool().query(
    `UPDATE app_agent_sessions SET title=$3,messages=$4,steps=$5,last_image_url=$6,
       updated_at=GREATEST(clock_timestamp(),updated_at + interval '1 microsecond')
     WHERE id=$1 AND email=$2 AND updated_at=$7::timestamptz
     RETURNING updated_at::text AS revision`, [...values, expectedRevision]
  ) : await getPool().query(
    `INSERT INTO app_agent_sessions (id, email, title, messages, steps, last_image_url, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp())
     ON CONFLICT (email, id) DO UPDATE SET
       title = EXCLUDED.title,
       messages = EXCLUDED.messages,
       steps = EXCLUDED.steps,
       last_image_url = EXCLUDED.last_image_url,
       updated_at = GREATEST(clock_timestamp(),app_agent_sessions.updated_at + interval '1 microsecond')
     WHERE $7::boolean
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
    `SELECT id, title, created_at, updated_at, pinned, last_image_url,
            jsonb_array_length(messages) AS message_count
       FROM app_agent_sessions WHERE email = $1 AND ($3::boolean=false OR id NOT LIKE 'cv-%')
      ORDER BY pinned DESC, updated_at DESC LIMIT $2`,
    [email.toLowerCase(), limit, excludeCanvas]
  );
  return rows as AgentSessionRow[];
}

export async function pinAgentSession(
  email: string,
  id: string,
  pinned: boolean,
  localIdle:()=>void=()=>{}
): Promise<boolean> {
  return mutateHistory(email,id,localIdle,async tx=>{
    const result = await tx.query(
      `UPDATE app_agent_sessions SET pinned = $3 WHERE id = $1 AND email = $2`,
      [id, email.toLowerCase(), pinned]
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function renameAgentSession(
  email: string,
  id: string,
  title: string,
  localIdle:()=>void=()=>{}
): Promise<boolean> {
  return mutateHistory(email,id,localIdle,async tx=>{
  const result = await tx.query(
    `UPDATE app_agent_sessions
        SET title = $3, updated_at = GREATEST(clock_timestamp(),updated_at + interval '1 microsecond')
      WHERE id = $1 AND email = $2`,
    [id, email.toLowerCase(), title.slice(0, 120)]
  );
  return (result.rowCount ?? 0) > 0;
  });
}

export async function deleteAgentSession(email: string, id: string, localIdle:()=>void=()=>{}): Promise<void> {
  await mutateHistory(email,id,localIdle,async tx=>{await tx.query(
    `DELETE FROM app_agent_sessions WHERE id = $1 AND email = $2`,
    [id, email.toLowerCase()]
  );});
}
