import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ensureSchema, getPool } from "@/lib/db";
import type { BiOverview, BiQuery, BiResponse, BiRow } from "./contracts";
import { artworkBiPresentation } from "@/lib/artwork-provenance";

let ready: Promise<void> | null = null;
export async function ensureBiSchema() {
  if (!ready)
    ready = (async () => {
      await ensureSchema();
      await getPool()
        .query(`CREATE TABLE IF NOT EXISTS app_bi_account_profiles (
      email text PRIMARY KEY REFERENCES app_users(email) ON DELETE CASCADE,
      account_type text NOT NULL DEFAULT 'unknown' CHECK(account_type IN ('unknown','personal','enterprise')),
      company text NOT NULL DEFAULT '', agreed_pay_percent numeric(5,2) CHECK(agreed_pay_percent>0 AND agreed_pay_percent<=100),
      note text NOT NULL DEFAULT '', updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_bi_access_log (
      id text PRIMARY KEY, actor text NOT NULL, action text NOT NULL, target_email text NOT NULL DEFAULT '',
      section text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS app_bi_access_created ON app_bi_access_log(created_at DESC);`);
      await getPool().query(`CREATE TABLE IF NOT EXISTS app_bi_model_calls (
      id text PRIMARY KEY,email text NOT NULL,operation text NOT NULL,operation_id text NOT NULL DEFAULT '',
      wire_model text NOT NULL,response_model text NOT NULL DEFAULT '',state text NOT NULL,
      duration_ms integer NOT NULL,input_tokens integer,output_tokens integer,created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS app_bi_model_calls_email_created ON app_bi_model_calls(email,created_at DESC);
      CREATE INDEX IF NOT EXISTS app_bi_model_calls_created ON app_bi_model_calls(created_at DESC);`);
      await getPool().query(`ALTER TABLE app_bi_model_calls ADD COLUMN IF NOT EXISTS public_model_id text NOT NULL DEFAULT '';
        ALTER TABLE app_bi_model_calls ADD COLUMN IF NOT EXISTS provider_id text NOT NULL DEFAULT '';
        ALTER TABLE app_bi_model_calls ADD COLUMN IF NOT EXISTS model_version bigint;
        ALTER TABLE app_bi_model_calls ADD COLUMN IF NOT EXISTS billing_version bigint;
        ALTER TABLE app_bi_model_calls ADD COLUMN IF NOT EXISTS config_digest text NOT NULL DEFAULT '';`);
      await getPool().query(`CREATE TABLE IF NOT EXISTS app_bi_management_log (
        id text PRIMARY KEY,actor text NOT NULL,email text NOT NULL,action text NOT NULL,reason text NOT NULL,
        changes jsonb NOT NULL,request_fingerprint text NOT NULL,ledger_id text,created_at timestamptz NOT NULL DEFAULT now());
        CREATE INDEX IF NOT EXISTS app_bi_management_created ON app_bi_management_log(created_at DESC);
        CREATE INDEX IF NOT EXISTS app_bi_management_email ON app_bi_management_log(email,created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS app_bi_management_ledger ON app_bi_management_log(ledger_id) WHERE ledger_id IS NOT NULL;`);
    })().catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}
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
const scopeSql = (authorizedEmployees = false) => `WITH query_window AS (SELECT $1::timestamptz AS starts, $2::timestamptz AS ends), scoped AS (
  SELECT emails.email FROM (SELECT email FROM app_users UNION SELECT email FROM app_ledger UNION SELECT email FROM app_orders UNION SELECT email FROM app_artworks UNION SELECT email FROM app_image_jobs UNION SELECT email FROM app_bi_model_calls UNION SELECT email FROM app_bi_management_log UNION SELECT email FROM app_video_tasks UNION SELECT email FROM app_canvas_image_tasks UNION SELECT email FROM app_agent_sessions UNION SELECT email FROM app_genchat_sessions) emails
  LEFT JOIN app_users u ON u.email=emails.email LEFT JOIN app_bi_account_profiles p ON p.email=emails.email
  WHERE ($3::text='' OR emails.email=$3) AND ($4::text='' OR position(lower($4) in lower(emails.email||' '||COALESCE(u.name,'')||' '||COALESCE(p.company,'')))>0)
  ${authorizedEmployees ? 'AND emails.email=ANY($8::text[])' : ''} AND ($5::text='' OR COALESCE(p.account_type,'unknown')=$5)
)`;
const scope = scopeSql();
const inRange = (alias: string) =>
  `${alias}.created_at >= $1::timestamptz AND ${alias}.created_at < $2::timestamptz`;
const values = (q: BiQuery) => [q.start, q.end, q.email, q.q, q.accountType];
const operationSource = `SELECT j.id,j.email,j.kind,j.created_at,j.updated_at,
  COALESCE(j.snapshot->>'status','unknown') AS status,COALESCE(j.snapshot->>'stage','') AS stage,
  COALESCE(j.payload->'p'->>'userPrompt',j.payload->'p'->>'prompt',j.payload->>'extra',j.snapshot->>'extra','') AS content,
  COALESCE(j.payload->'p'->>'model',j.payload->>'model',j.snapshot->>'model','') AS requested_model,
  COALESCE(j.snapshot->'quality'->>'requested','') AS requested_quality,
  COALESCE(j.payload->'p'->>'resolution','') AS resolution,j.cost AS quoted_credits,
  COALESCE((SELECT -sum(l.delta) FROM app_ledger l WHERE l.email=j.email AND l.id='led-image-'||j.id),0) AS billed_credits,
  CASE WHEN j.billing_settled THEN 0 ELSE j.reserved_cost END AS reserved_credits,j.billing_settled AS settled,
  COALESCE(j.snapshot->>'error','') AS error
 FROM app_image_jobs j
 UNION ALL SELECT c.id,c.email,'canvas-'||c.kind,c.created_at,c.updated_at,c.status,'' AS stage,
  COALESCE(c.parameters->>'newText',c.parameters->>'prompt','') AS content,'' AS requested_model,
  COALESCE(c.parameters->'qualityAudit'->>'requested','') AS requested_quality,
  COALESCE(c.parameters->>'billingResolution','') AS resolution,c.cost,
  COALESCE((SELECT -sum(l.delta) FROM app_ledger l WHERE l.email=c.email AND l.id='led-canvas-image-'||c.id),0),
  COALESCE((SELECT r.cost FROM app_gen_reservations r WHERE r.job_id=c.id AND r.email=c.email),0),
  c.status='completed' OR c.credits_refunded,COALESCE(c.error,'') FROM app_canvas_image_tasks c
 UNION ALL SELECT v.id,v.email,'video',v.created_at,v.updated_at,v.status,'' AS stage,v.prompt,v.model,'' AS requested_quality,
  v.size,v.cost,COALESCE((SELECT -sum(l.delta) FROM app_ledger l WHERE l.email=v.email AND l.id='led-video-'||v.id),0),
  COALESCE((SELECT r.cost FROM app_gen_reservations r WHERE r.job_id=v.id AND r.email=v.email),0),
  v.status='completed' OR v.credits_refunded,v.error FROM app_video_tasks v`;

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
  if (access && q.section !== "artworks") throw new Error("Scoped BI supports artworks only");
  await ensureBiSchema();
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
  const filterBinds = [...values(q), q.status, ...(q.section === "artworks" ? [q.recordId || ""] : []), ...(access ? [access.allowedEmails] : [])];
  const scopedSql = access ? scopeSql(true) : scope;
  const binds = [...filterBinds, q.size, (q.page - 1) * q.size];
  let source = "";
  switch (q.section) {
    case "management":
      source = `SELECT m.id,m.actor,m.email,m.action,m.reason,m.changes::text AS changes,m.ledger_id,m.created_at FROM app_bi_management_log m WHERE m.email IN (SELECT email FROM scoped) AND ${inRange("m")} AND ($6::text='' OR m.action=$6)`;
      break;
    case "users":
      source = `SELECT u.email,u.name,u.phone,u.role,u.plan,u.banned,u.joined_at,u.last_login_at,u.last_ip,u.note,u.management_version,
      COALESCE(p.account_type,'unknown') AS account_type,COALESCE(p.company,'') AS company,p.agreed_pay_percent,
      COALESCE(p.note,'') AS profile_note,p.updated_at AS profile_updated_at,
      COALESCE(b.principal,0)::float8 AS principal,u.credits_used AS reserved,
      GREATEST(0,COALESCE(b.principal,0)-u.credits_used)::float8 AS available,
      COALESCE(b.expiring,0)::float8 AS expiring_30d,COALESCE(l.consumed,0)::float8 AS consumed,
      COALESCE(l.refunded,0)::float8 AS refunded,COALESCE(l.events,0)::int AS ledger_events,
      COALESCE(a.artworks,0)::int AS artworks,COALESCE(o.received,0)::float8 AS received_cents,
      COALESCE(o.purchased_credits,0)::float8 AS purchased_credits
      FROM app_users u LEFT JOIN app_bi_account_profiles p ON p.email=u.email
      LEFT JOIN LATERAL (SELECT sum(remaining) AS principal,sum(remaining) FILTER(WHERE expires_at<now()+interval '30 days') AS expiring FROM app_credit_batches WHERE email=u.email AND expires_at>now() AND remaining>0) b ON true
      LEFT JOIN LATERAL (SELECT sum(-delta) FILTER(WHERE kind='consume' AND delta<0 AND reason<>'管理员调整积分') AS consumed,sum(delta) FILTER(WHERE kind='refund' AND delta>0) AS refunded,count(*) AS events FROM app_ledger l WHERE l.email=u.email AND ${inRange("l")}) l ON true
      LEFT JOIN LATERAL (SELECT count(*) AS artworks FROM app_artworks a WHERE a.email=u.email AND a.deleted_at IS NULL AND ${inRange("a")}) a ON true
      LEFT JOIN LATERAL (SELECT sum(amount) AS received,sum(credits) AS purchased_credits FROM app_orders o WHERE o.email=u.email AND o.status='paid' AND o.provider IN ('wechat','alipay') AND o.paid_at >= $1::timestamptz AND o.paid_at < $2::timestamptz) o ON true
      WHERE u.email IN (SELECT email FROM scoped) AND ($6::text='' OR CASE WHEN u.banned THEN 'banned' ELSE 'active' END=$6)`;
      break;
    case "ledger":
      source = `SELECT l.id,l.email,l.delta,l.kind,l.reason,l.expires_at,l.created_at,COALESCE(m.reason,'') AS management_reason,m.actor AS management_actor FROM app_ledger l LEFT JOIN app_bi_management_log m ON m.ledger_id=l.id WHERE l.email IN (SELECT email FROM scoped) AND ${inRange("l")} AND ($6::text='' OR l.kind=$6)`;
      break;
    case "artworks":
      source = `SELECT a.id,a.email,a.title,a.category,a.prompt,a.status,a.ratio,a.resolution,a.image_width,a.image_height,a.origin,a.parent_id,a.batch_id,a.created_at,a.deleted_at,
      a.creation_provenance,a.source_url,a.image_url,a.template_id,
      j.id AS job_id,j.kind AS job_kind,COALESCE(j.payload->'p'->>'origin',j.payload->>'origin') AS job_origin,
      COALESCE(j.payload->'p'->>'entry',j.payload->>'entry') AS job_entry,
      c.id AS canvas_task_id,c.kind AS canvas_task_kind,v.id AS video_task_id,v.source AS video_task_source,
      (a.image_url<>'') AS has_image,(COALESCE(a.video_url,'')<>'') AS has_video
      FROM app_artworks a LEFT JOIN app_image_jobs j ON j.email=a.email AND j.id=CASE WHEN a.creation_provenance->>'operation' IN ('generate','suite','aplus') THEN a.creation_provenance->>'ref' WHEN a.batch_id LIKE 'b-job-%' THEN substring(a.batch_id from 3) ELSE a.batch_id END
      LEFT JOIN LATERAL (SELECT id,kind FROM app_canvas_image_tasks WHERE email=a.email AND result_artwork_id=a.id ORDER BY created_at,id LIMIT 1) c ON true
      LEFT JOIN LATERAL (SELECT id,source FROM app_video_tasks WHERE email=a.email AND artwork_id=a.id ORDER BY created_at,id LIMIT 1) v ON true
      WHERE a.email IN (SELECT email FROM scoped) AND (${inRange("a")} OR $7::text<>'') AND ($7::text='' OR a.id=$7) AND (($6::text='' AND a.deleted_at IS NULL) OR ($6='deleted' AND a.deleted_at IS NOT NULL) OR $6='all')`;
      break;
    case "operations":
      source = `SELECT t.* FROM (${operationSource}) t WHERE t.email IN (SELECT email FROM scoped) AND ${inRange("t")} AND ($6::text='' OR t.status=$6 OR ($6='review' AND (t.status='needs_attention' OR t.stage='checking' OR t.stage='reviewing' OR t.error LIKE '%核查%')))`;
      break;
    case "models":
      source = `SELECT c.id,c.job_id,c.email,c.requested_quality,c.executed_quality,c.upstream,c.images,c.billed_credits,c.reason,c.created_at,c.billing_config_version,c.cost_currency,c.cost_amount_micros::text,c.cost_source,c.cost_actual,
      COALESCE(j.payload->'p'->>'model',j.payload->>'model',j.snapshot->>'model','') AS requested_model,
      COALESCE(j.payload->'p'->>'resolution',a.resolution,'') AS resolution,
      COALESCE(a.title,'') AS title,CASE WHEN a.id IS NOT NULL THEN a.id ELSE '' END AS artwork_id
      FROM app_image_cost_audit c LEFT JOIN app_image_jobs j ON j.id=c.job_id AND j.email=c.email
      LEFT JOIN app_artworks a ON a.id=substring(c.id from length('cst-'||c.job_id||'-')+1) AND a.email=c.email
      WHERE c.email IN (SELECT email FROM scoped) AND ${inRange("c")} AND ($6::text='' OR ($6='fallback' AND (c.requested_quality<>'' AND c.executed_quality<>'' AND c.requested_quality<>c.executed_quality OR c.reason IN ('provider-fallback','quality-downgrade','upstream-unsupported'))))`;
      break;
    case "orders":
      source = `SELECT o.id,o.email,o.kind,o.title,o.item_id,o.credits,o.amount AS amount_cents,o.status,o.provider,o.created_at,o.paid_at,
      CASE WHEN o.credits>0 AND o.status='paid' THEN o.amount::float8/o.credits ELSE NULL END AS cents_per_credit
      FROM app_orders o WHERE o.email IN (SELECT email FROM scoped) AND (CASE WHEN $6::text='paid' THEN o.paid_at ELSE o.created_at END) >= $1 AND (CASE WHEN $6::text='paid' THEN o.paid_at ELSE o.created_at END) < $2 AND ($6::text='' OR o.status=$6)`;
      break;
    case "calls":
      source = `SELECT c.id,c.email,c.operation,c.operation_id,c.public_model_id,c.provider_id,c.model_version,c.billing_version,c.config_digest,c.wire_model,c.response_model,c.state,c.duration_ms,c.input_tokens,c.output_tokens,c.created_at FROM app_bi_model_calls c WHERE c.email IN (SELECT email FROM scoped) AND ${inRange("c")} AND ($6::text='' OR c.state=$6)`;
      break;
    case "conversations":
      source = `SELECT s.id,s.email,s.title,'agent' AS source,s.created_at,s.updated_at,jsonb_array_length(CASE WHEN jsonb_typeof(s.messages)='array' THEN s.messages ELSE '[]'::jsonb END) AS entries FROM app_agent_sessions s WHERE s.email IN (SELECT email FROM scoped) AND s.updated_at >= $1::timestamptz AND s.updated_at < $2::timestamptz AND ($6::text='' OR $6='agent')
      UNION ALL SELECT s.id,s.email,s.title,'genchat',s.created_at,s.updated_at,jsonb_array_length(CASE WHEN jsonb_typeof(s.turns)='array' THEN s.turns ELSE '[]'::jsonb END) FROM app_genchat_sessions s WHERE s.email IN (SELECT email FROM scoped) AND s.updated_at >= $1::timestamptz AND s.updated_at < $2::timestamptz AND ($6::text='' OR $6='genchat')`;
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
  const readPage = async (client: PoolClient) => [
    await client.query(
      `${scopedSql} SELECT count(*)::int AS total FROM (${source}) result`,
      filterBinds,
    ),
    await client.query(
      `${scopedSql} SELECT * FROM (${source}) result ORDER BY ${order} LIMIT $${filterBinds.length + 1} OFFSET $${filterBinds.length + 2}`,
      binds,
    ),
  ];
  const [count, page] = access ? await readPage(access.client) : await snapshot(readPage);
  result.total = count.rows[0].total;
  result.rows = normalize(q.section === "artworks" ? page.rows.map(raw => {
    const presentation = artworkBiPresentation(raw);
    // Do not expose private/signed source URLs or raw JSON in the BI list/CSV.
    const { creation_provenance, source_url, image_url, job_kind, job_origin, job_entry, canvas_task_kind, video_task_source, ...row } = raw;
    return { ...row, ...presentation };
  }) : page.rows);
  return result;
}

async function overview(q: BiQuery, pool: PoolClient): Promise<BiOverview> {
  const params = values(q);
  const results = [
    await pool.query(
      `${scope} SELECT count(*)::int AS accounts,count(*) FILTER(WHERE p.account_type='enterprise')::int AS enterprises,
      COALESCE(sum(u.credits_used),0)::float8 AS reserved FROM app_users u LEFT JOIN app_bi_account_profiles p ON p.email=u.email WHERE u.email IN (SELECT email FROM scoped)`,
      params,
    ),
    await pool.query(
      `${scope} SELECT COALESCE(sum(-delta) FILTER(WHERE kind='consume' AND delta<0 AND reason<>'管理员调整积分'),0)::float8 AS consumed,
      COALESCE(sum(delta) FILTER(WHERE kind='refund' AND delta>0),0)::float8 AS refunded,
      count(DISTINCT email) FILTER(WHERE kind='consume' AND delta<0 AND reason<>'管理员调整积分')::int AS active_users
      FROM app_ledger l WHERE l.email IN (SELECT email FROM scoped) AND ${inRange("l")}`,
      params,
    ),
    await pool.query(
      `${scope} SELECT COALESCE(sum(GREATEST(0,b.principal-u.credits_used)),0)::float8 AS available FROM app_users u
      JOIN LATERAL (SELECT COALESCE(sum(remaining),0) AS principal FROM app_credit_batches WHERE email=u.email AND expires_at>now() AND remaining>0) b ON true WHERE u.email IN (SELECT email FROM scoped)`,
      params,
    ),
    await pool.query(
      `${scope} SELECT count(*) FILTER(WHERE deleted_at IS NULL)::int AS artworks,count(*) FILTER(WHERE deleted_at IS NOT NULL)::int AS deleted_artworks FROM app_artworks a WHERE a.email IN (SELECT email FROM scoped) AND ${inRange("a")}`,
      params,
    ),
    await pool.query(
      `${scope} SELECT count(*)::int AS tasks,count(*) FILTER(WHERE status IN ('error','failed'))::int AS failed,count(*) FILTER(WHERE status='needs_attention' OR stage IN ('checking','reviewing') OR error LIKE '%核查%')::int AS review FROM (${operationSource}) t WHERE t.email IN (SELECT email FROM scoped) AND ${inRange("t")}`,
      params,
    ),
    await pool.query(
      `${scope} SELECT COALESCE(sum(images),0)::int AS audit_images,COALESCE(sum(images) FILTER(WHERE requested_quality<>'' AND executed_quality<>'' AND requested_quality<>executed_quality),0)::int AS downgraded_images FROM app_image_cost_audit c WHERE c.email IN (SELECT email FROM scoped) AND ${inRange("c")}`,
      params,
    ),
    await pool.query(
      `${scope} SELECT COALESCE(sum(amount) FILTER(WHERE provider IN ('wechat','alipay')),0)::float8 AS received_cents,COALESCE(sum(amount) FILTER(WHERE provider='mock'),0)::float8 AS mock_cents FROM app_orders o WHERE o.email IN (SELECT email FROM scoped) AND status='paid' AND paid_at >= $1::timestamptz AND paid_at < $2::timestamptz`,
      params,
    ),
    await pool.query(
      `${scope}, days AS (SELECT d::date AS date FROM generate_series(($1::timestamptz AT TIME ZONE 'Asia/Shanghai')::date,(($2::timestamptz AT TIME ZONE 'Asia/Shanghai')::date-1),interval '1 day') d),
      usage AS (SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date AS date,sum(-delta) FILTER(WHERE kind='consume' AND delta<0 AND reason<>'管理员调整积分') AS consumed,sum(delta) FILTER(WHERE kind='refund' AND delta>0) AS refunded FROM app_ledger l WHERE l.email IN (SELECT email FROM scoped) AND ${inRange("l")} GROUP BY 1),
      images AS (SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date AS date,count(*) AS artworks FROM app_artworks a WHERE a.email IN (SELECT email FROM scoped) AND a.deleted_at IS NULL AND ${inRange("a")} GROUP BY 1)
      , payments AS (SELECT (paid_at AT TIME ZONE 'Asia/Shanghai')::date AS date,sum(amount) FILTER(WHERE provider IN ('wechat','alipay')) AS received,sum(amount) FILTER(WHERE provider='mock') AS mock FROM app_orders WHERE email IN (SELECT email FROM scoped) AND status='paid' AND paid_at >= $1 AND paid_at < $2 GROUP BY 1)
      SELECT to_char(d.date,'YYYY-MM-DD') AS date,COALESCE(u.consumed,0)::float8 AS consumed,COALESCE(u.refunded,0)::float8 AS refunded,COALESCE(i.artworks,0)::int AS artworks,COALESCE(p.received,0)::float8 AS "receivedCents",COALESCE(p.mock,0)::float8 AS "mockCents" FROM days d LEFT JOIN usage u USING(date) LEFT JOIN images i USING(date) LEFT JOIN payments p USING(date) ORDER BY d.date`,
      params,
    ),
    await pool.query(
      `${scope} SELECT upstream,cost_currency,sum(cost_amount_micros)::text AS cost_amount_micros,bool_and(COALESCE(cost_actual,false)) AS cost_actual,sum(images)::int AS images,sum(billed_credits)::float8 AS billed_credits,count(*) FILTER(WHERE requested_quality<>'' AND executed_quality<>'' AND requested_quality<>executed_quality)::int AS fallbacks FROM app_image_cost_audit c WHERE c.email IN (SELECT email FROM scoped) AND ${inRange("c")} GROUP BY upstream,cost_currency ORDER BY images DESC,upstream,cost_currency LIMIT 12`,
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
      ? `SELECT m.ordinality AS ordinal,m.value->>'role' AS role,
    CASE WHEN jsonb_typeof(m.value->'content')='string' THEN m.value->>'content'
    WHEN jsonb_typeof(m.value->'content')='array' THEN (SELECT string_agg(p.value->>'text','' ORDER BY p.ordinality) FROM jsonb_array_elements(m.value->'content') WITH ORDINALITY p WHERE p.value->>'type'='text') ELSE '' END AS text
    FROM app_agent_sessions s CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.messages)='array' THEN s.messages ELSE '[]'::jsonb END) WITH ORDINALITY m
    WHERE s.email=$1 AND s.id=$2 AND m.value->>'role' IN ('user','assistant')`
      : `SELECT m.ordinality*2 AS ordinal,'user' AS role,m.value->>'you' AS text FROM app_genchat_sessions s CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.turns)='array' THEN s.turns ELSE '[]'::jsonb END) WITH ORDINALITY m WHERE s.email=$1 AND s.id=$2
    UNION ALL SELECT m.ordinality*2+1,'assistant',m.value->>'line' FROM app_genchat_sessions s CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.turns)='array' THEN s.turns ELSE '[]'::jsonb END) WITH ORDINALITY m WHERE s.email=$1 AND s.id=$2`;
  return snapshot(async (client) => {
    const count = await client.query(
      `SELECT count(*)::int AS total FROM (${source}) m WHERE COALESCE(text,'')<>''`,
      [email, id],
    );
    const rows = await client.query(
      `SELECT role,left(text,20000) AS text,(length(text)>20000) AS truncated FROM (${source}) m WHERE COALESCE(text,'')<>'' ORDER BY ordinal LIMIT 20 OFFSET $3`,
      [email, id, (page - 1) * 20],
    );
    return { total: count.rows[0].total, messages: rows.rows, page, size: 20 };
  });
}
