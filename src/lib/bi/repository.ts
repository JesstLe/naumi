import {ensureBiSchema} from "@/lib/bi/schema";
export {ensureBiSchema};
import "server-only";

import {MODEL_CALL_EVIDENCE_SQL,modelChainPresentation,type ModelCallEvidence} from "./model-chain";
import {randomUUID} from "node:crypto";
import type {PoolClient} from "pg";

import {getPool} from "@/platform/db/pool";
import type {BiOverview,BiQuery,BiResponse,BiRow} from "./contracts";
import {ARTWORK_INPUT_COLUMNS,ARTWORK_INPUT_JOINS,artworkInputPresentation} from "./artwork-inputs";
import {artworkBiPresentation} from "@/lib/artwork-provenance";



export async function logBiAccess(
  actor: string,
  action: string,
  section: string,
  email = "",
) {
  await ensureBiSchema();
  await getPool().query(
    "INSERT INTO app_bi_access_log(id,actor,action,target_email,section) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), actor, action, email, section],
  );
}

// All source tables are independently aggregated. Joining raw ledger/artwork/job rows
// would multiply amounts. Parameters are shared across every view and count query.
// Type every shared bind even when a section does not use a particular filter.
// Filter each source directly: assembling all historical email rows first is both
// unnecessary and expensive. Correlated metadata lookups preserve orphan accounts.
const scopeSql = () => `WITH query_window AS (SELECT $1::timestamptz AS starts, $2::timestamptz AS ends,
  $3::text AS email,$4::text AS keyword,$5::text AS account_type),
  enterprise_directory AS MATERIALIZED (
    SELECT email,string_agg(DISTINCT company,'、' ORDER BY company) AS company FROM (
      SELECT t.owner_email AS email,t.name AS company FROM app_account_teams t JOIN app_enterprise_settings s ON s.team_id=t.id
      UNION ALL SELECT m.email,t.name FROM app_enterprise_members m JOIN app_account_teams t ON t.id=m.enterprise_id
        JOIN app_enterprise_settings s ON s.team_id=t.id
    ) memberships GROUP BY email
  ), account_directory AS MATERIALIZED (
    SELECT i.email,COALESCE(u.name,'') AS name,COALESCE(e.company,p.company,'') AS company,
      CASE WHEN e.company IS NOT NULL THEN 'enterprise' ELSE COALESCE(p.account_type,'unknown') END AS account_type
    FROM (SELECT email FROM app_users UNION SELECT email FROM app_bi_account_profiles UNION SELECT email FROM enterprise_directory) i
    LEFT JOIN app_users u ON u.email=i.email LEFT JOIN app_bi_account_profiles p ON p.email=i.email
    LEFT JOIN enterprise_directory e ON e.email=i.email
  ), matching_accounts AS MATERIALIZED (
    SELECT email FROM account_directory WHERE ($4::text='' OR position(lower($4) in lower(email||' '||name||' '||company))>0)
      AND ($5::text='' OR account_type=$5)
  )`;
const scope = scopeSql();
// Current membership enriches the account directory only; it does not rewrite
// the enterprise attribution of any historical task or monetary event.
// Directory predicates become hashed membership checks instead of per-event
// user/profile/team queries. Historical emails absent from the directory still
// participate with their original empty name/company and unknown account type.
const accountFilter = (email: string, authorizedEmployees = false, scopeBind = 8) => `
  (${email} IS NOT NULL AND ($3::text='' OR ${email}=$3)
  AND (($4::text='' AND $5::text='') OR ${email} IN (SELECT email FROM matching_accounts)
    OR (${email} NOT IN (SELECT email FROM account_directory) AND $5::text IN ('','unknown')
      AND ($4::text='' OR position(lower($4) in lower(${email}||'  '))>0)))
  ${authorizedEmployees ? `AND ${email}=ANY($${scopeBind}::text[])` : ''})`;
const inRange = (alias: string) =>
  `${alias}.created_at >= $1::timestamptz AND ${alias}.created_at < $2::timestamptz`;
const values = (q: BiQuery) => [q.start, q.end, q.email, q.q, q.accountType];
const imageOperationStatus = "COALESCE(j.snapshot#>>'{result,status}',j.snapshot->>'status','unknown')";
// Compare indexed raw state to a constant alias set; wrapping the column in a
// CASE forced a detoast/normalization of every historical image snapshot.
const creationStatusFilter = (value:string) => `(${value}=ANY(CASE $6::text
  WHEN 'creation:succeeded' THEN ARRAY['done','completed','success','succeeded']
  WHEN 'creation:failed' THEN ARRAY['error','rejected','failed']
  WHEN 'creation:queued' THEN ARRAY['pending','reviewing','queued']
  WHEN 'creation:running' THEN ARRAY['processing','generating','running']
  WHEN 'creation:partial' THEN ARRAY['partial'] WHEN 'creation:cancel_requested' THEN ARRAY['cancel_requested']
  WHEN 'creation:cancelled' THEN ARRAY['cancelled'] ELSE ARRAY[]::text[] END)
  OR ($6='creation:needs_review' AND COALESCE(${value} NOT IN ('done','completed','success','error','rejected','pending','reviewing','processing','generating','queued','running','succeeded','partial','failed','cancel_requested','cancelled'),true)))`;
// Only page keys enter this projection. In particular, UNION ALL + an outer
// LIMIT can otherwise evaluate JSON and correlated billing for every candidate.
const operationPageSource = `SELECT 'app_image_jobs'::text AS source_table,EXISTS(SELECT 1 FROM app_ledger WHERE email=j.email AND id='led-image-'||j.id AND kind='consume') AS has_ledger_charge,j.id,j.email,j.kind,j.created_at,j.updated_at,
  ${imageOperationStatus} AS status,COALESCE(j.snapshot#>>'{result,stage}',j.snapshot->>'stage','') AS stage,
  COALESCE(j.payload->'p'->>'userPrompt',j.payload->'p'->>'prompt',j.payload->>'extra',j.snapshot->>'extra','') AS content,
  COALESCE(j.payload->'p'->>'model',j.payload->>'model',j.snapshot->>'model','') AS requested_model,
  COALESCE(j.snapshot->'quality'->>'requested','') AS requested_quality,
  COALESCE(j.payload->'p'->>'resolution','') AS resolution,j.cost AS quoted_credits,
  COALESCE((SELECT -sum(l.delta) FROM app_ledger l WHERE l.email=j.email AND l.id='led-image-'||j.id),0) AS billed_credits,
  CASE WHEN j.billing_settled THEN 0 ELSE j.reserved_cost END AS reserved_credits,j.billing_settled AS settled,
  COALESCE(j.snapshot#>>'{result,error,message}',j.snapshot->>'error','') AS error
 FROM app_image_jobs j JOIN selected k ON k.source_table='app_image_jobs' AND k.id=j.id AND k.email=j.email
 UNION ALL SELECT 'app_canvas_image_tasks',EXISTS(SELECT 1 FROM app_ledger WHERE email=c.email AND id='led-canvas-image-'||c.id AND kind='consume'),c.id,c.email,'canvas-'||c.kind,c.created_at,c.updated_at,c.status,'' AS stage,
  COALESCE(c.parameters->>'newText',c.parameters->>'prompt','') AS content,'' AS requested_model,
  COALESCE(c.parameters->'qualityAudit'->>'requested','') AS requested_quality,
  COALESCE(c.parameters->>'billingResolution','') AS resolution,c.cost,
  COALESCE((SELECT -sum(l.delta) FROM app_ledger l WHERE l.email=c.email AND l.id='led-canvas-image-'||c.id),0),
  COALESCE((SELECT r.cost FROM app_gen_reservations r WHERE r.job_id=c.id AND r.email=c.email),0),
  c.status='completed' OR c.credits_refunded,COALESCE(c.error,'') FROM app_canvas_image_tasks c JOIN selected k ON k.source_table='app_canvas_image_tasks' AND k.id=c.id AND k.email=c.email
 UNION ALL SELECT 'app_video_tasks',EXISTS(SELECT 1 FROM app_ledger WHERE email=v.email AND id='led-video-'||v.id AND kind='consume'),v.id,v.email,'video',v.created_at,v.updated_at,v.status,'' AS stage,v.prompt,v.model,'' AS requested_quality,
  v.size,v.cost,COALESCE((SELECT -sum(l.delta) FROM app_ledger l WHERE l.email=v.email AND l.id='led-video-'||v.id),0),
  COALESCE((SELECT r.cost FROM app_gen_reservations r WHERE r.job_id=v.id AND r.email=v.email),0),
  v.status='completed' OR v.credits_refunded,v.error FROM app_video_tasks v JOIN selected k ON k.source_table='app_video_tasks' AND k.id=v.id AND k.email=v.email`;

/** Expand display JSON and billing only for the selected page. A nonempty image
 * status filter still reads snapshot before paging; it needs an indexed state
 * projection to avoid that work, not an early LIMIT that drops matching rows. */
function operationKeys(authorizedEmployees = false) {
  const status = (value: string, review: string) => `($6::text='' OR ${value}=$6 OR ${creationStatusFilter(value)} OR ($6='review' AND (${review})))`;
  return `SELECT 'app_image_jobs'::text AS source_table,j.id,j.email,j.created_at
    FROM app_image_jobs j WHERE ${accountFilter("j.email", authorizedEmployees, 9)} AND (${inRange("j")} OR $7::text<>'') AND ($7='' OR j.id=$7) AND ($8::text='' OR $8='app_image_jobs')
      AND ${status(imageOperationStatus, "j.snapshot->>'status'='needs_attention' OR j.snapshot->>'stage' IN ('checking','reviewing') OR j.snapshot->>'error' LIKE '%核查%'")}
    UNION ALL SELECT 'app_canvas_image_tasks',c.id,c.email,c.created_at
    FROM app_canvas_image_tasks c WHERE ${accountFilter("c.email", authorizedEmployees, 9)} AND (${inRange("c")} OR $7::text<>'') AND ($7='' OR c.id=$7) AND ($8::text='' OR $8='app_canvas_image_tasks')
      AND ${status("c.status", "c.status='needs_attention' OR c.error LIKE '%核查%'")}
    UNION ALL SELECT 'app_video_tasks',v.id,v.email,v.created_at
    FROM app_video_tasks v WHERE ${accountFilter("v.email", authorizedEmployees, 9)} AND (${inRange("v")} OR $7::text<>'') AND ($7='' OR v.id=$7) AND ($8::text='' OR $8='app_video_tasks')
      AND ${status("v.status", "v.status='needs_attention' OR v.error LIKE '%核查%'")}`;
}

const artworkFilter = (scoped: boolean) => `${accountFilter("a.email", scoped)} AND (${inRange("a")} OR $7::text<>'') AND ($7::text='' OR a.id=$7) AND (($6::text='' AND a.deleted_at IS NULL) OR ($6='deleted' AND a.deleted_at IS NOT NULL) OR $6='all')`;
// Users section appends the position bind last (filterBinds keeps $1-$6 stable),
// so $7 is reserved for it in both count and page statements below.
const userFilter = () => `${accountFilter("u.email")} AND ($6::text='' OR CASE WHEN u.banned THEN 'banned' ELSE 'active' END=$6) AND ($7::text='' OR u.position=CASE WHEN $7='unassigned' THEN '' ELSE $7 END)`;
const modelFilter = () => `${accountFilter("c.email")} AND ${inRange("c")} AND ($6::text='' OR ($6='fallback' AND (c.requested_quality<>'' AND c.executed_quality<>'' AND c.requested_quality<>c.executed_quality OR c.reason IN ('provider-fallback','quality-downgrade','upstream-unsupported'))))`;
// Keep session JSON out of the count/sort input: only the selected page needs
// entry counts. Agent IDs are email-scoped and may also overlap genchat IDs.
const conversationKeys = () => `SELECT s.id,s.email,'agent'::text AS source,s.updated_at
  FROM app_agent_sessions s WHERE ${accountFilter("s.email")} AND s.updated_at >= $1::timestamptz AND s.updated_at < $2::timestamptz AND ($6::text='' OR $6='agent')
  UNION ALL SELECT s.id,s.email,'genchat',s.updated_at
  FROM app_genchat_sessions s WHERE ${accountFilter("s.email")} AND s.updated_at >= $1::timestamptz AND s.updated_at < $2::timestamptz AND ($6::text='' OR $6='genchat')`;
// These predicates match the optional failed/review partial indexes. Without
// those indexes (or when PG chooses another plan), state counts can detoast
// candidate snapshots. No raw JSON is returned. See scripts/ops/admin-query-indexes.ts.
const failedImage = `snapshot->>'status' IN ('error','failed')`;
const reviewImage = `snapshot->>'status'='needs_attention' OR snapshot->>'stage' IN ('checking','reviewing') OR snapshot->>'error' LIKE '%核查%'`;
const operationSummary = `SELECT count(*)::int AS tasks,
  (SELECT count(*) FROM app_image_jobs j WHERE ${accountFilter("j.email")} AND ${inRange("j")} AND (${failedImage}))::int AS failed,
  (SELECT count(*) FROM app_image_jobs j WHERE ${accountFilter("j.email")} AND ${inRange("j")} AND (${reviewImage}))::int AS review
 FROM app_image_jobs j WHERE ${accountFilter("j.email")} AND ${inRange("j")}
 UNION ALL SELECT count(*)::int,count(*) FILTER(WHERE c.status IN ('error','failed'))::int,
 count(*) FILTER(WHERE c.status='needs_attention' OR c.error LIKE '%核查%')::int
 FROM app_canvas_image_tasks c WHERE ${accountFilter("c.email")} AND ${inRange("c")}
 UNION ALL SELECT count(*)::int,count(*) FILTER(WHERE v.status IN ('error','failed'))::int,
 count(*) FILTER(WHERE v.status='needs_attention' OR v.error LIKE '%核查%')::int
 FROM app_video_tasks v WHERE ${accountFilter("v.email")} AND ${inRange("v")}`;

/** Narrow enterprise port: reuses operation SQL but does NOT widen the artworks-only scoped BI API. */
export async function queryEnterpriseOperations(q:BiQuery,access:{client:PoolClient;allowedEmails:readonly string[]},exact?:{kind:'image-job'|'canvas-task'|'video-task';id:string}):Promise<BiResponse>{
  if(q.section!=='operations')throw new Error('Enterprise operation query required');
  // Keep the existing exact-record/date, raw-status and authorization semantics.
  // Both count and page use these same keys on the caller's authorization snapshot.
  // An exact ID bypasses the date window, never the source or allowed-email gate.
  const keys = ([['app_image_jobs','j',imageOperationStatus],['app_canvas_image_tasks','c','c.status'],['app_video_tasks','v','v.status']] as const)
    .map(([table,alias,status]) => `SELECT '${table}'::text AS source_table,${alias}.id,${alias}.email,${alias}.created_at
      FROM ${table} ${alias} WHERE ${alias}.email=ANY($5::text[])
        AND (($6::text<>'' AND ${alias}.id=$6 AND '${table}'=$7) OR ($6='' AND ${inRange(alias)}))
        AND ($3::text='' OR ${alias}.email=$3) AND ($4::text='' OR ${status}=$4)`)
    .join(' UNION ALL ');
  const tables={'image-job':'app_image_jobs','canvas-task':'app_canvas_image_tasks','video-task':'app_video_tasks'};
  const params=[q.start,q.end,q.email,q.status,access.allowedEmails,exact?.id??'',exact?tables[exact.kind]:''];
  const total=Number((await access.client.query(`SELECT count(*)::int AS n FROM (${keys}) s`,params)).rows[0].n);
  const rows=(await access.client.query(`WITH selected AS MATERIALIZED (
      SELECT * FROM (${keys}) k ORDER BY created_at DESC,source_table,id LIMIT $8 OFFSET $9)
    SELECT source_table,has_ledger_charge,id,email,kind,created_at,status,content,quoted_credits,billed_credits,reserved_credits,settled
    FROM (${operationPageSource}) t ORDER BY created_at DESC,source_table,id`,[...params,q.size,(q.page-1)*q.size])).rows;
  return {section:'operations',rows:normalize(rows),total,page:q.page,size:q.size,generatedAt:new Date().toISOString(),query:{from:q.from,to:q.to}};
}
function normalize(rows: Record<string, unknown>[]): BiRow[] {
  return rows.map(
    (row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          value instanceof Date
            ? value.toISOString()
            : typeof value === "bigint"
              ? Number(value)
              : value === null ||
                  typeof value === "boolean" ||
                  typeof value === "number" ||
                  typeof value === "string"
                ? value
                : null,
        ]),
      ) as BiRow,
  );
}

async function snapshot<T>(
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='5s'");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Scoped callers must supply a server-authorized member list and its transaction.
 * This path is artworks-only; it never grants enterprise users other BI sections. */
export async function queryBi(q: BiQuery, access?: { client: PoolClient; allowedEmails: readonly string[] }): Promise<BiResponse> {
  if (access && !["artworks", "operations"].includes(q.section)) throw new Error("Scoped BI supports artworks and operations only");
  // Scoped callers initialize schema before opening their authorization transaction.
  // Never acquire a second pool connection while holding that transaction.
  if (!access) await ensureBiSchema();
  const result: BiResponse = {
    section: q.section,
    rows: [],
    total: 0,
    page: q.page,
    size: q.size,
    generatedAt: new Date().toISOString(),
    query: { from: q.from, to: q.to },
  };
  if (q.section === "overview") {
    result.overview = await snapshot((client) => overview(q, client));
    return result;
  }
  const filterBinds = [...values(q), q.status, ...(q.section === "artworks" ? [q.recordId || ""] : []), ...(q.section==='operations'?[q.recordId||'',q.recordSource||'']:[]), ...(access ? [access.allowedEmails] : []), ...(q.section === "users" ? [q.position ?? ""] : [])];
  const scopedSql = scope;
  const binds = [...filterBinds, q.size, (q.page - 1) * q.size];
  let source = "";
  let countSource = "";
  let pagePrefix = "";
  switch (q.section) {
    case "management":
      source = `SELECT m.id,m.actor,m.email,m.action,m.reason,m.changes::text AS changes,m.ledger_id,m.created_at FROM app_bi_management_log m WHERE ${accountFilter("m.email")} AND ${inRange("m")} AND ($6::text='' OR m.action=$6)`;
      break;
    case "users":
      source = `SELECT u.email,u.name,u.phone,u.role,u.plan,u.banned,u.position,u.joined_at,u.last_login_at,u.last_ip,u.note,u.management_version,
      CASE WHEN membership.company IS NOT NULL THEN 'enterprise' ELSE COALESCE(p.account_type,'unknown') END AS account_type,COALESCE(membership.company,p.company,'') AS company,p.agreed_pay_percent,
      CASE WHEN membership.company IS NOT NULL THEN 'enterprise-membership' ELSE 'manual-profile' END AS organization_source,
      COALESCE(p.account_type,'unknown') AS registered_account_type,COALESCE(p.company,'') AS registered_company,
      COALESCE(p.note,'') AS profile_note,p.updated_at AS profile_updated_at,
      COALESCE(b.principal,0)::float8 AS principal,u.credits_used AS reserved,
      GREATEST(0,COALESCE(b.principal,0)-u.credits_used)::float8 AS available,
      COALESCE(b.expiring,0)::float8 AS expiring_30d,COALESCE(l.consumed,0)::float8 AS consumed,
      COALESCE(l.refunded,0)::float8 AS refunded,COALESCE(l.events,0)::int AS ledger_events,
      COALESCE(a.artworks,0)::int AS artworks,COALESCE(o.received,0)::float8 AS received_cents,
      COALESCE(o.purchased_credits,0)::float8 AS purchased_credits
      FROM app_users u JOIN selected k ON k.email=u.email LEFT JOIN app_bi_account_profiles p ON p.email=u.email
      LEFT JOIN enterprise_directory membership ON membership.email=u.email
      LEFT JOIN LATERAL (SELECT sum(remaining) AS principal,sum(remaining) FILTER(WHERE expires_at<now()+interval '30 days') AS expiring FROM app_credit_batches WHERE email=u.email AND expires_at>now() AND remaining>0) b ON true
      LEFT JOIN user_usage l ON l.email=u.email
      LEFT JOIN LATERAL (SELECT count(*) AS artworks FROM app_artworks a WHERE a.email=u.email AND a.deleted_at IS NULL AND ${inRange("a")}) a ON true
      LEFT JOIN LATERAL (SELECT sum(amount) AS received,sum(credits) AS purchased_credits FROM app_orders o WHERE o.email=u.email AND o.status='paid' AND o.provider IN ('wechat','alipay') AND o.paid_at >= $1::timestamptz AND o.paid_at < $2::timestamptz) o ON true
      WHERE ${userFilter()}`;
      countSource = `SELECT u.email FROM app_users u WHERE ${userFilter()}`;
      pagePrefix = `, filtered_users AS MATERIALIZED (${countSource}), user_usage AS MATERIALIZED (
        SELECT l.email,sum(-delta) FILTER(WHERE kind='consume' AND delta<0 AND reason<>'管理员调整积分') AS consumed,
        sum(delta) FILTER(WHERE kind='refund' AND delta>0) AS refunded,count(*) AS events
        FROM app_ledger l JOIN filtered_users f ON f.email=l.email WHERE ${inRange("l")} GROUP BY l.email),
        selected AS MATERIALIZED (SELECT f.email FROM filtered_users f LEFT JOIN user_usage l ON l.email=f.email
          ORDER BY COALESCE(l.consumed,0)::float8 DESC,f.email ASC LIMIT $8 OFFSET $9)`;
      break;
    case "ledger":
      source = `SELECT l.id,l.email,l.delta,l.kind,l.reason,l.expires_at,l.created_at,COALESCE(m.reason,'') AS management_reason,m.actor AS management_actor FROM app_ledger l LEFT JOIN app_bi_management_log m ON m.ledger_id=l.id WHERE ${accountFilter("l.email")} AND ${inRange("l")} AND ($6::text='' OR l.kind=$6)`;
      break;
    case "artworks":
      source = `SELECT a.id,a.email,a.title,a.category,a.prompt,a.status,a.ratio,a.resolution,a.image_width,a.image_height,a.origin,a.parent_id,a.batch_id,a.created_at,a.deleted_at,
      a.creation_provenance,a.source_url,a.image_url,a.template_id,${ARTWORK_INPUT_COLUMNS},
      j.id AS job_id,j.kind AS job_kind,COALESCE(j.payload->'p'->>'origin',j.payload->>'origin') AS job_origin,
      COALESCE(j.payload->'p'->>'entry',j.payload->>'entry') AS job_entry,
      c.id AS canvas_task_id,c.kind AS canvas_task_kind,v.id AS video_task_id,v.source AS video_task_source,
      (a.image_url<>'') AS has_image,(COALESCE(a.video_url,'')<>'') AS has_video
      FROM selected a ${ARTWORK_INPUT_JOINS}
      LEFT JOIN LATERAL (SELECT id,source FROM app_video_tasks WHERE email=a.email AND artwork_id=a.id ORDER BY created_at,id LIMIT 1) v ON true
      WHERE ${artworkFilter(!!access)}`;
      countSource = `SELECT a.id FROM app_artworks a WHERE ${artworkFilter(!!access)}`;
      pagePrefix = `, selected AS MATERIALIZED (SELECT a.* FROM app_artworks a WHERE ${artworkFilter(!!access)}
        ORDER BY a.created_at DESC,a.id DESC LIMIT $${filterBinds.length + 1} OFFSET $${filterBinds.length + 2})`;
      break;
    case "operations":
      // Count/page are built from operationKeys below; never expand an unpaged source.
      break;
    case "models":
      source = `SELECT c.id,c.job_id,c.email,c.requested_quality,c.executed_quality,c.upstream,c.images,c.billed_credits,c.reason,c.created_at,c.billing_config_version,c.cost_currency,c.cost_amount_micros::text,c.cost_source,c.cost_actual,
      COALESCE(j.payload->'p'->>'model',j.payload->>'model',j.snapshot->>'model','') AS requested_model,
      COALESCE(j.payload->'p'->>'resolution',a.resolution,'') AS resolution,
      COALESCE(a.title,'') AS title,CASE WHEN a.id IS NOT NULL THEN a.id ELSE '' END AS artwork_id
      FROM selected c LEFT JOIN app_image_jobs j ON j.id=c.job_id AND j.email=c.email
      LEFT JOIN app_artworks a ON a.id=substring(c.id from length('cst-'||c.job_id||'-')+1) AND a.email=c.email
      WHERE ${modelFilter()}`;
      countSource = `SELECT c.id FROM app_image_cost_audit c WHERE ${modelFilter()}`;
      pagePrefix = `, selected AS MATERIALIZED (SELECT c.* FROM app_image_cost_audit c WHERE ${modelFilter()}
        ORDER BY c.created_at DESC,c.id DESC LIMIT $7 OFFSET $8)`;
      break;
    case "orders":
      source = `SELECT o.id,o.email,o.kind,o.title,o.item_id,o.credits,o.amount AS amount_cents,o.status,o.provider,o.created_at,o.paid_at,
      CASE WHEN o.credits>0 AND o.status='paid' THEN o.amount::float8/o.credits ELSE NULL END AS cents_per_credit
      FROM app_orders o WHERE ${accountFilter("o.email")} AND (CASE WHEN $6::text='paid' THEN o.paid_at ELSE o.created_at END) >= $1 AND (CASE WHEN $6::text='paid' THEN o.paid_at ELSE o.created_at END) < $2 AND ($6::text='' OR o.status=$6)`;
      break;
    case "calls":
      source = `SELECT c.id,c.email,c.operation,c.operation_id,c.public_model_id,c.frontend_model_id,c.frontend_model_label,c.provider_id,c.model_version,c.billing_version,c.config_digest,c.wire_model,c.response_model,c.state,c.duration_ms,c.input_tokens,c.output_tokens,c.created_at FROM app_bi_model_calls c WHERE ${accountFilter("c.email")} AND ${inRange("c")} AND ($6::text='' OR c.state=$6)`;
      break;
    case "conversations":
      countSource = conversationKeys();
      pagePrefix = `, selected AS MATERIALIZED (SELECT * FROM (${countSource}) k ORDER BY updated_at DESC,id DESC LIMIT $7 OFFSET $8)`;
      source = `SELECT s.id,s.email,s.title,k.source,s.created_at,s.updated_at,
        jsonb_array_length(CASE WHEN jsonb_typeof(s.messages)='array' THEN s.messages ELSE '[]'::jsonb END) AS entries
        FROM selected k JOIN app_agent_sessions s ON k.source='agent' AND s.id=k.id AND s.email=k.email
        UNION ALL SELECT s.id,s.email,s.title,k.source,s.created_at,s.updated_at,
        jsonb_array_length(CASE WHEN jsonb_typeof(s.turns)='array' THEN s.turns ELSE '[]'::jsonb END)
        FROM selected k JOIN app_genchat_sessions s ON k.source='genchat' AND s.id=k.id AND s.email=k.email`;
      break;
    case "access":
      source = `SELECT a.id,a.actor,a.action,a.target_email,a.section,a.created_at FROM app_bi_access_log a WHERE ${inRange("a")} AND ($3::text='' OR a.target_email=$3) AND ($4::text='' OR position(lower($4) in lower(a.actor||' '||a.target_email))>0) AND ($6::text='' OR a.action=$6)`;
      break;
  }
  const order =
    q.section === "users"
      ? "consumed DESC,email ASC"
      : q.section === "conversations"
        ? "updated_at DESC,id DESC"
        : "created_at DESC,id DESC";
  // Parameter indices remain valid in both statements; use a LIMIT/OFFSET-free
  // one-row count result so empty pages still report the real total.
  const keys = q.section === "operations" ? operationKeys(!!access) : "";
  const countSql = `${scopedSql} SELECT count(*)::int AS total FROM (${keys || countSource || source}) result`;
  const pageSql = keys
    ? `${scopedSql}, selected AS MATERIALIZED (SELECT * FROM (${keys}) k ORDER BY created_at DESC,id DESC,source_table LIMIT $${filterBinds.length + 1} OFFSET $${filterBinds.length + 2})
       SELECT * FROM (${operationPageSource}) result ORDER BY created_at DESC,id DESC,source_table`
    : pagePrefix ? `${scopedSql}${pagePrefix} SELECT * FROM (${source}) result ORDER BY ${order}`
    : `${scopedSql} SELECT * FROM (${source}) result ORDER BY ${order} LIMIT $${filterBinds.length + 1} OFFSET $${filterBinds.length + 2}`;
  const readPage = async (client: PoolClient) => [
    await client.query(countSql, filterBinds),
    await client.query(pageSql, binds),
  ];
  const [count, page] = access ? await readPage(access.client) : await snapshot(readPage);
  result.total = count.rows[0].total;
  result.rows = normalize(q.section === "artworks" ? page.rows.map(raw => {
    const presentation = artworkBiPresentation(raw);
    // Do not expose private/signed source URLs or raw JSON in the BI list/CSV.
    const { creation_provenance, source_url, image_url, job_kind, job_origin, job_entry, canvas_task_kind, video_task_source, input_params, input_images, input_request, input_source_id, ...row } = raw;
    return { ...row, ...presentation, ...artworkInputPresentation(raw) };
  }) : page.rows);
  if (["calls", "operations", "models"].includes(q.section) && result.rows.length) {
    const ids = result.rows.map(row => String(q.section === "models" ? row.job_id : row.id));
    const emails = result.rows.map(row => String(row.email));
    const pairs = [...new Map(ids.map((id,i) => [emails[i]+"\u0000"+id,{id,email:emails[i]}])).values()];
    const evidence = await (access?.client ?? getPool()).query(MODEL_CALL_EVIDENCE_SQL, [pairs.map(p=>p.id),pairs.map(p=>p.email),q.section === "calls"]);
    result.rows = result.rows.map((row,i) => {
      const calls = (evidence.rows as ModelCallEvidence[]).filter(call => call.email === emails[i] && call.root_id === ids[i] && (q.section !== "calls" || call.id === row.id));
      return { ...row, ...modelChainPresentation(calls), model_evidence_scope: q.section === "calls" ? "本次调用" : "任务内调用汇总" };
    });
  }
  return result;
}

async function overview(q: BiQuery, pool: PoolClient): Promise<BiOverview> {
  const params = values(q);
  const results = [
    await pool.query(
      `${scope} SELECT count(*)::int AS accounts,count(*) FILTER(WHERE membership.company IS NOT NULL OR p.account_type='enterprise')::int AS enterprises,
      COALESCE(sum(u.credits_used),0)::float8 AS reserved FROM app_users u LEFT JOIN app_bi_account_profiles p ON p.email=u.email
      LEFT JOIN enterprise_directory membership ON membership.email=u.email WHERE ${accountFilter("u.email")}`,
      params,
    ),
    await pool.query(
      `${scope} SELECT COALESCE(sum(-delta) FILTER(WHERE kind='consume' AND delta<0 AND reason<>'管理员调整积分'),0)::float8 AS consumed,
      COALESCE(sum(delta) FILTER(WHERE kind='refund' AND delta>0),0)::float8 AS refunded,
      count(DISTINCT email) FILTER(WHERE kind='consume' AND delta<0 AND reason<>'管理员调整积分')::int AS active_users
      FROM app_ledger l WHERE ${accountFilter("l.email")} AND ${inRange("l")}`,
      params,
    ),
    await pool.query(
      `${scope} SELECT COALESCE(sum(GREATEST(0,COALESCE(b.principal,0)-u.credits_used)),0)::float8 AS available FROM app_users u
      LEFT JOIN (SELECT email,sum(remaining) AS principal FROM app_credit_batches WHERE expires_at>now() AND remaining>0 GROUP BY email) b ON b.email=u.email WHERE ${accountFilter("u.email")}`,
      params,
    ),
    await pool.query(
      `${scope} SELECT count(*) FILTER(WHERE deleted_at IS NULL)::int AS artworks,count(*) FILTER(WHERE deleted_at IS NOT NULL)::int AS deleted_artworks FROM app_artworks a WHERE ${accountFilter("a.email")} AND ${inRange("a")}`,
      params,
    ),
    await pool.query(
      `${scope} SELECT sum(tasks)::int AS tasks,sum(failed)::int AS failed,sum(review)::int AS review FROM (${operationSummary}) t`,
      params,
    ),
    await pool.query(
      `${scope} SELECT COALESCE(sum(images),0)::int AS audit_images,COALESCE(sum(images) FILTER(WHERE requested_quality<>'' AND executed_quality<>'' AND requested_quality<>executed_quality),0)::int AS downgraded_images FROM app_image_cost_audit c WHERE ${accountFilter("c.email")} AND ${inRange("c")}`,
      params,
    ),
    await pool.query(
      `${scope} SELECT COALESCE(sum(amount) FILTER(WHERE provider IN ('wechat','alipay')),0)::float8 AS received_cents,COALESCE(sum(amount) FILTER(WHERE provider='mock'),0)::float8 AS mock_cents FROM app_orders o WHERE ${accountFilter("o.email")} AND status='paid' AND paid_at >= $1::timestamptz AND paid_at < $2::timestamptz`,
      params,
    ),
    await pool.query(
      `${scope}, days AS (SELECT d::date AS date FROM generate_series(($1::timestamptz AT TIME ZONE 'Asia/Shanghai')::date,(($2::timestamptz AT TIME ZONE 'Asia/Shanghai')::date-1),interval '1 day') d),
      usage AS (SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date AS date,sum(-delta) FILTER(WHERE kind='consume' AND delta<0 AND reason<>'管理员调整积分') AS consumed,sum(delta) FILTER(WHERE kind='refund' AND delta>0) AS refunded FROM app_ledger l WHERE ${accountFilter("l.email")} AND ${inRange("l")} GROUP BY 1),
      images AS (SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date AS date,count(*) AS artworks FROM app_artworks a WHERE ${accountFilter("a.email")} AND a.deleted_at IS NULL AND ${inRange("a")} GROUP BY 1)
      , payments AS (SELECT (paid_at AT TIME ZONE 'Asia/Shanghai')::date AS date,sum(amount) FILTER(WHERE provider IN ('wechat','alipay')) AS received,sum(amount) FILTER(WHERE provider='mock') AS mock FROM app_orders o WHERE ${accountFilter("o.email")} AND status='paid' AND paid_at >= $1 AND paid_at < $2 GROUP BY 1)
      SELECT to_char(d.date,'YYYY-MM-DD') AS date,COALESCE(u.consumed,0)::float8 AS consumed,COALESCE(u.refunded,0)::float8 AS refunded,COALESCE(i.artworks,0)::int AS artworks,COALESCE(p.received,0)::float8 AS "receivedCents",COALESCE(p.mock,0)::float8 AS "mockCents" FROM days d LEFT JOIN usage u USING(date) LEFT JOIN images i USING(date) LEFT JOIN payments p USING(date) ORDER BY d.date`,
      params,
    ),
    await pool.query(
      `${scope} SELECT upstream,cost_currency,sum(cost_amount_micros)::text AS cost_amount_micros,bool_and(COALESCE(cost_actual,false)) AS cost_actual,sum(images)::int AS images,sum(billed_credits)::float8 AS billed_credits,count(*) FILTER(WHERE requested_quality<>'' AND executed_quality<>'' AND requested_quality<>executed_quality)::int AS fallbacks FROM app_image_cost_audit c WHERE ${accountFilter("c.email")} AND ${inRange("c")} GROUP BY upstream,cost_currency ORDER BY images DESC,upstream,cost_currency LIMIT 12`,
      params,
    ),
  ];
  const row = (i: number) => results[i].rows[0];
  return {
    accounts: row(0).accounts,
    enterprises: row(0).enterprises,
    reserved: row(0).reserved,
    available: row(2).available,
    consumed: row(1).consumed,
    refunded: row(1).refunded,
    activeUsers: row(1).active_users,
    artworks: row(3).artworks,
    deletedArtworks: row(3).deleted_artworks,
    tasks: row(4).tasks,
    failed: row(4).failed,
    review: row(4).review,
    auditImages: row(5).audit_images,
    downgradedImages: row(5).downgraded_images,
    receivedCents: row(6).received_cents,
    mockCents: row(6).mock_cents,
    daily: results[7].rows,
    models: normalize(results[8].rows),
  };
}

export async function updateBiProfile(
  email: string,
  profile: {
    accountType: string;
    company: string;
    agreedPayPercent: number | null;
    note: string;
  },
  actor: string,
) {
  await ensureBiSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const user = await client.query(
      "SELECT email FROM app_users WHERE email=$1 FOR KEY SHARE",
      [email],
    );
    if (!user.rowCount) throw new Error("用户不存在");
    await client.query(
      `INSERT INTO app_bi_account_profiles(email,account_type,company,agreed_pay_percent,note,updated_by)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(email) DO UPDATE SET account_type=EXCLUDED.account_type,company=EXCLUDED.company,
      agreed_pay_percent=EXCLUDED.agreed_pay_percent,note=EXCLUDED.note,updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [
        email,
        profile.accountType,
        profile.company,
        profile.agreedPayPercent,
        profile.note,
        actor,
      ],
    );
    await client.query(
      "INSERT INTO app_bi_access_log(id,actor,action,target_email,section) VALUES($1,$2,'update-profile',$3,'users')",
      [randomUUID(), actor, email],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Return only model/state/operation IDs, never execution cache or credentials. */
export async function biJobTrace(id: string, email: string) {
  await ensureBiSchema();
  const result = await getPool().query(
    `SELECT jsonb_object_agg(e.key,jsonb_build_object('model',e.value->>'model','state',e.value->>'state','gateway',e.value->'replayable')) AS attempts
    FROM app_image_jobs j CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(j.snapshot->'paidOperations')='object' THEN j.snapshot->'paidOperations' ELSE '{}'::jsonb END) e WHERE j.id=$1 AND j.email=$2`,
    [id, email],
  );
  const attempts = result.rows[0]?.attempts as Record<
    string,
    { model: string; state: string; gateway: boolean }
  > | null;
  return Object.entries(attempts || {})
    .slice(0, 100)
    .map(([operationId, a]) => ({
      operationId,
      model: a.model,
      state: a.state,
      gateway: a.gateway === true,
    }));
}

export async function biConversation(
  id: string,
  email: string,
  kind: "agent" | "genchat",
  page: number,
) {
  await ensureBiSchema();
  const source =
    kind === "agent"
      ? `SELECT m.ordinality AS ordinal,m.value->>'role' AS role,m.value->'content' AS content
    FROM app_agent_sessions s CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.messages)='array' THEN s.messages ELSE '[]'::jsonb END) WITH ORDINALITY m
    WHERE s.email=$1 AND s.id=$2 AND m.value->>'role' IN ('user','assistant')
    AND CASE WHEN jsonb_typeof(m.value->'content')='string' THEN m.value->>'content'<>''
      WHEN jsonb_typeof(m.value->'content')='array' THEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(m.value->'content') p(value)
        WHERE p.value->>'type'='text' AND COALESCE(p.value->>'text','')<>'') ELSE false END`
      : `SELECT t.ordinal,t.role,to_jsonb(t.text) AS content
    FROM app_genchat_sessions s CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.turns)='array' THEN s.turns ELSE '[]'::jsonb END) WITH ORDINALITY m
    CROSS JOIN LATERAL (VALUES (m.ordinality*2,'user',m.value->>'you'),(m.ordinality*2+1,'assistant',m.value->>'line')) t(ordinal,role,text)
    WHERE s.email=$1 AND s.id=$2 AND COALESCE(t.text,'')<>''`;
  return snapshot(async (client) => {
    // Extract the owned session once. Nonempty text blocks are enough for the
    // count; concatenate/measure full text only for the selected 20 messages.
    const result = await client.query(
      `WITH extracted AS MATERIALIZED (${source}),
      selected AS MATERIALIZED (SELECT * FROM extracted ORDER BY ordinal LIMIT 20 OFFSET $3),
      rendered AS MATERIALIZED (SELECT ordinal,role,
        CASE WHEN jsonb_typeof(content)='string' THEN content#>>'{}'
        ELSE (SELECT string_agg(p.value->>'text','' ORDER BY p.ordinality)
          FROM jsonb_array_elements(content) WITH ORDINALITY p WHERE p.value->>'type'='text') END AS text FROM selected)
      SELECT (SELECT count(*)::int FROM extracted) AS total,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('role',role,'text',left(text,20000),'truncated',length(text)>20000) ORDER BY ordinal)
        FROM rendered),'[]'::jsonb) AS messages`,
      [email, id, (page - 1) * 20],
    );
    return { total: result.rows[0].total, messages: result.rows[0].messages, page, size: 20 };
  });
}
