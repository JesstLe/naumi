import "server-only";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import { ensureBiSchema } from "./repository";
import { USAGE_DEFINITIONS, type UsageMetrics, type UsageQuery, type UsageResponse, type UsageUser } from "./usage-contracts";

type ReadClient = Pick<PoolClient, "query">;
export type UsageReadScope = { allowedEmails: readonly string[]; tenantId: string; tenantName: string };
const sources = [
  ["app_image_jobs", "图片生成任务", "imageJobs"],
  ["app_canvas_image_tasks", "画布图片工具", "canvasTasks"],
  ["app_video_tasks", "视频生成任务", "videoTasks"],
  ["app_artworks", "历史与当前作品", "artworks"],
  ["app_ledger", "实际积分账本", "ledger"],
  ["app_bi_model_calls", "模型调用与 Token", "modelCalls"],
] as const;
const numericKeys = ["tasks", "delivered", "uploads", "imports", "storedArtworks", "deletedArtworks", "unattributedArtworks", "consumed", "refunded", "administrativeDebits", "modelCalls", "inputTokens", "outputTokens", "tokenSamples"] as const;
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
function metrics(raw: Record<string, unknown>): UsageMetrics {
  const data = Object.fromEntries(numericKeys.map(k => [k, num(raw[k])])) as Record<(typeof numericKeys)[number], number>;
  const activeDays = num(raw.activeDays), activeUsers = num(raw.activeUsers);
  return { ...data, activeDays, activeUsers, netCredits: data.consumed - data.refunded,
    inputTokens: data.tokenSamples ? data.inputTokens : null,
    outputTokens: data.tokenSamples ? data.outputTokens : null,
    creditsPerDelivered: data.delivered ? data.consumed / data.delivered : null,
    deliveriesPerActiveDay: activeDays ? data.delivered / activeDays : null,
    tasksPerActiveDay: activeDays ? data.tasks / activeDays : null };
}

/** Query-only analytics: optional historical tables are detected, never fabricated.
 * Server authorization must supply scope; an empty allowed list stays empty. */
export async function readUserUsage(tx: ReadClient, query: UsageQuery, scope?: UsageReadScope): Promise<UsageResponse> {
  if (scope && query.email && !scope.allowedEmails.includes(query.email)) throw new Error("所选账号不在当前可见成员范围");
  if (scope && query.tenantId && query.tenantId !== scope.tenantId) throw new Error("所选企业不在当前授权范围");
  const names = [...sources.map(s => s[0]), "app_users", "app_enterprise_members", "app_account_team_members", "app_account_teams", "app_bi_account_profiles", "app_creation_records", "app_billing_operations"];
  const existing = new Set<string>((await tx.query("SELECT name FROM unnest($1::text[]) name WHERE to_regclass(name) IS NOT NULL", [names])).rows.map(r => r.name));
  if (!existing.has("app_users")) throw new Error("账号数据尚未初始化");
  const has = (name: string) => existing.has(name);
  const links: string[] = [];
  if (has("app_account_teams")) {
    links.push("SELECT owner_email email,id tenant_id,name company,0 priority FROM app_account_teams");
    if (has("app_enterprise_members")) links.push("SELECT m.email,t.id,t.name,1 FROM app_enterprise_members m JOIN app_account_teams t ON t.id=m.enterprise_id");
    if (has("app_account_team_members")) links.push("SELECT m.email,t.id,t.name,2 FROM app_account_team_members m JOIN app_account_teams t ON t.id=m.team_id");
  }
  const tenancy = links.length ? `SELECT DISTINCT ON(email) email,tenant_id,company FROM (${links.join(" UNION ALL ")}) x ORDER BY email,priority,tenant_id` : "SELECT NULL::text email,NULL::uuid tenant_id,''::text company WHERE false";
  const filter = (email: string) => `(${email} IS NOT NULL AND ($3::text='' OR ${email}=$3)
    AND ($4::text='' OR position(lower($4) in lower(${email}||' '||COALESCE((SELECT filter_user.name FROM app_users filter_user WHERE filter_user.email=${email}),'')||' '||COALESCE((SELECT filter_team.company FROM tenancy filter_team WHERE filter_team.email=${email}),'')))>0)
    AND ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM tenancy filter_team WHERE filter_team.email=${email} AND filter_team.tenant_id=$5))
    AND ($6::text[] IS NULL OR ${email}=ANY($6)))`;
  // Enterprise reads use the authorized historical account cohort. Membership is
  // not retroactively assigned as a frozen tenant to old tasks.
  const selectedTenant = scope ? null : query.tenantId || null;
  const values = [query.start, query.end, query.email, query.q, selectedTenant, scope ? [...scope.allowedEmails] : null, query.size, (query.page - 1) * query.size];
  const range = (alias: string) => `${alias}.created_at >= $1::timestamptz AND ${alias}.created_at < $2::timestamptz AND ${filter(`${alias}.email`)}`;
  const selectFact = (email: string, at: string, source: string, expressions: Partial<Record<(typeof numericKeys)[number], string>>, activity: string, from: string) =>
    `SELECT ${email} AS email,(${at} AT TIME ZONE 'Asia/Shanghai')::date AS day,${at} AS occurred_at,'${source}'::text AS source,${activity} AS activity,${numericKeys.map(k => `${expressions[k] || "0"}::bigint AS "${k}"`).join(",")} ${from}`;
  const facts: string[] = [];
  const sourceCtes: string[] = [];
  if (has("app_image_jobs")) {
    // Generate payloads contain reference-image bytes in old deployments: never
    // detoast them for analytics. Recent links are scalar indexed records; only
    // owners with legacy unlinked children inspect small parent-only snapshots.
    sourceCtes.push(`candidate_images AS MATERIALIZED (SELECT j.id,j.email,j.kind,j.created_at FROM app_image_jobs j WHERE ${range("j")})`);
    sourceCtes.push(`known_child_links AS MATERIALIZED (${has("app_creation_records") ? `SELECT DISTINCT j.email,j.id child_id FROM candidate_images j
      JOIN app_creation_records c ON c.actor_email=j.email AND c.source_kind='image:generate' AND c.source_id=j.id
      JOIN app_creation_records p ON p.id=c.parent_id AND p.actor_email=c.actor_email AND p.source_kind='image:imagegen'
      JOIN app_image_jobs parent ON parent.id=p.source_id AND parent.email=j.email AND parent.kind='imagegen'
      WHERE j.kind='generate'` : "SELECT NULL::text email,NULL::text child_id WHERE false"})`);
    sourceCtes.push(`unlinked_child_owners AS MATERIALIZED (SELECT DISTINCT c.email FROM candidate_images c
      LEFT JOIN known_child_links k ON k.email=c.email AND k.child_id=c.id WHERE c.kind='generate' AND k.child_id IS NULL)`);
    sourceCtes.push(`legacy_parent_candidates AS MATERIALIZED (SELECT p.email,p.snapshot->'children' children FROM app_image_jobs p
      JOIN unlinked_child_owners o ON o.email=p.email WHERE p.kind='imagegen' AND p.created_at<$2::timestamptz)`);
    // Expand each legacy parent once before joining candidate children. Without
    // this materialization fence PostgreSQL can join by owner first, multiplying
    // jsonb_each work by every child belonging to a prolific account.
    sourceCtes.push(`legacy_parent_edges AS MATERIALIZED (SELECT p.email,l.value->>'jobId' child_id FROM legacy_parent_candidates p
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.children)='object' THEN p.children ELSE '{}'::jsonb END) l)`);
    sourceCtes.push(`legacy_parent_links AS MATERIALIZED (SELECT DISTINCT p.email,c.id child_id FROM legacy_parent_edges p
      JOIN candidate_images c ON c.email=p.email AND c.id=p.child_id AND c.kind='generate')`);
    sourceCtes.push(`child_links AS MATERIALIZED (SELECT email,child_id FROM known_child_links UNION SELECT email,child_id FROM legacy_parent_links)`);
    facts.push(selectFact("j.email", "j.created_at", "imageJobs", { tasks: "1" }, "true", `FROM candidate_images j
      LEFT JOIN child_links k ON k.email=j.email AND k.child_id=j.id WHERE j.kind<>'generate' OR k.child_id IS NULL`));
  }
  if (has("app_canvas_image_tasks")) facts.push(selectFact("c.email", "c.created_at", "canvasTasks", { tasks: "1" }, "true", `FROM app_canvas_image_tasks c WHERE ${range("c")}`));
  if (has("app_video_tasks")) facts.push(selectFact("v.email", "v.created_at", "videoTasks", { tasks: "1" }, "true", `FROM app_video_tasks v WHERE ${range("v")}`));
  if (has("app_artworks")) {
    const generatedOperations = "'generate','suite','aplus','cutout','upscale','printfile','extract','retouch','recolor','replicate','style','garment','garment3d','avatar','dewrinkle','dewatermark','inpaint','tryon','packaging3d','canvas-text-edit','canvas-expand','canvas-annotate','video','comfyui'";
    sourceCtes.push(`candidate_artworks AS MATERIALIZED (SELECT a.id,a.email,a.created_at,a.deleted_at,a.source_url,a.template_id,a.batch_id,
      a.creation_provenance->>'operation' operation,a.creation_provenance->>'version' provenance_version,
      a.creation_provenance->>'evidence' evidence,a.creation_provenance->>'ref' provenance_ref
      FROM app_artworks a WHERE ${range("a")} AND a.status='completed' AND (COALESCE(a.image_url,'')<>'' OR COALESCE(a.video_url,'')<>''))`);
    const evidence: string[] = [];
    if (has("app_image_jobs")) evidence.push(`SELECT a.id,a.email FROM candidate_artworks a JOIN app_image_jobs j ON j.email=a.email AND j.id=CASE
      WHEN a.operation IN ('generate','suite','aplus') THEN a.provenance_ref WHEN a.batch_id LIKE 'b-job-%' THEN substring(a.batch_id FROM 3) ELSE a.batch_id END`);
    if (has("app_canvas_image_tasks")) evidence.push("SELECT a.id,a.email FROM candidate_artworks a JOIN app_canvas_image_tasks c ON c.email=a.email AND c.result_artwork_id=a.id");
    if (has("app_video_tasks")) evidence.push("SELECT a.id,a.email FROM candidate_artworks a JOIN app_video_tasks v ON v.email=a.email AND v.artwork_id=a.id");
    sourceCtes.push(`artwork_job_evidence AS MATERIALIZED (${evidence.join(" UNION ") || "SELECT NULL::text id,NULL::text email WHERE false"})`);
    sourceCtes.push(`classified_artworks AS MATERIALIZED (SELECT a.email,a.created_at,a.deleted_at,
      CASE WHEN a.operation='upload' OR a.source_url='upload' THEN 'upload'
      WHEN a.operation IN ('copy','import','template') OR a.template_id IS NOT NULL AND a.id LIKE 'tplroot-%' THEN 'import'
      WHEN (a.operation IN (${generatedOperations}) AND a.provenance_version='1' AND COALESCE(a.evidence,'')<>'') OR e.id IS NOT NULL THEN 'delivered'
      ELSE 'unattributed' END category FROM candidate_artworks a LEFT JOIN artwork_job_evidence e ON e.email=a.email AND e.id=a.id)`);
    const from = "FROM classified_artworks a";
    facts.push(selectFact("a.email", "a.created_at", "artworks", {
      storedArtworks: "1", delivered: "CASE WHEN a.category='delivered' THEN 1 ELSE 0 END",
      uploads: "CASE WHEN a.category='upload' THEN 1 ELSE 0 END", imports: "CASE WHEN a.category='import' THEN 1 ELSE 0 END",
      unattributedArtworks: "CASE WHEN a.category='unattributed' THEN 1 ELSE 0 END", deletedArtworks: "CASE WHEN a.deleted_at IS NOT NULL THEN 1 ELSE 0 END",
    }, "true", from));
  }
  if (has("app_ledger")) {
    sourceCtes.push(`candidate_ledger AS MATERIALIZED (SELECT l.id,l.email,l.created_at,l.kind,l.delta,l.reason FROM app_ledger l
      WHERE ${range("l")} AND (l.kind='consume' AND l.delta<0 OR l.kind='refund' AND l.delta>0))`);
    sourceCtes.push(`admin_adjustment_keys AS MATERIALIZED (${has("app_billing_operations") ? `SELECT DISTINCT o.email,o.ledger_id FROM app_billing_operations o
      JOIN candidate_ledger l ON l.email=o.email AND l.id=o.ledger_id WHERE o.feature='credits.adjust'` : "SELECT NULL::text email,NULL::text ledger_id WHERE false"})`);
    sourceCtes.push(`classified_ledger AS MATERIALIZED (SELECT l.email,l.created_at,l.kind,l.delta,(l.reason='管理员调整积分' OR a.ledger_id IS NOT NULL) admin_debit
      FROM candidate_ledger l LEFT JOIN admin_adjustment_keys a ON a.email=l.email AND a.ledger_id=l.id)`);
    facts.push(selectFact("l.email", "l.created_at", "ledger", {
    consumed: "CASE WHEN l.kind='consume' AND l.delta<0 AND NOT l.admin_debit THEN -l.delta::bigint ELSE 0 END",
    refunded: "CASE WHEN l.kind='refund' AND l.delta>0 THEN l.delta::bigint ELSE 0 END",
    administrativeDebits: "CASE WHEN l.kind='consume' AND l.delta<0 AND l.admin_debit THEN -l.delta::bigint ELSE 0 END",
  }, "l.kind='consume' AND l.delta<0 AND NOT l.admin_debit", "FROM classified_ledger l"));
  }
  if (has("app_bi_model_calls")) facts.push(selectFact("m.email", "m.created_at", "modelCalls", {
    modelCalls: "1", tokenSamples: "CASE WHEN m.input_tokens IS NOT NULL AND m.output_tokens IS NOT NULL THEN 1 ELSE 0 END",
    inputTokens: "CASE WHEN m.input_tokens IS NOT NULL AND m.output_tokens IS NOT NULL THEN GREATEST(0,m.input_tokens) ELSE 0 END",
    outputTokens: "CASE WHEN m.input_tokens IS NOT NULL AND m.output_tokens IS NOT NULL THEN GREATEST(0,m.output_tokens) ELSE 0 END",
  }, "true", `FROM app_bi_model_calls m WHERE ${range("m")}`));
  const emptyFact = selectFact("NULL::text", "now()", "none", {}, "false", "WHERE false");
  const sums = (alias: string) => numericKeys.map(k => `COALESCE(sum(${alias}."${k}"),0) AS "${k}"`).join(",");
  const sortColumns = { consumed: "consumed", delivered: "delivered", tasks: "tasks", activeDays: "activeDays", modelCalls: "modelCalls" } as const;
  const result = await tx.query(`WITH tenancy AS MATERIALIZED (${tenancy}),${sourceCtes.length ? sourceCtes.join(",") + "," : ""}facts AS MATERIALIZED (${facts.join(" UNION ALL ") || emptyFact}),
    user_totals AS (SELECT email,${sums("f")},count(DISTINCT day) FILTER(WHERE activity) AS "activeDays",max(occurred_at) FILTER(WHERE activity) AS "lastActivityAt" FROM facts f GROUP BY email),
    identities AS (SELECT u.email FROM app_users u WHERE ${filter("u.email")} UNION SELECT email FROM user_totals),
    people AS (SELECT i.email,COALESCE(u.name,'') name,COALESCE(t.company,'') company,t.tenant_id AS "tenantId",COALESCE(u.role,'unknown') role,
      ${numericKeys.map(k => `COALESCE(a."${k}",0) AS "${k}"`).join(",")},COALESCE(a."activeDays",0) AS "activeDays",CASE WHEN a."activeDays">0 THEN 1 ELSE 0 END AS "activeUsers",a."lastActivityAt"
      FROM identities i LEFT JOIN app_users u ON u.email=i.email LEFT JOIN tenancy t ON t.email=i.email LEFT JOIN user_totals a ON a.email=i.email),
    daily AS (SELECT day,${sums("f")},count(DISTINCT email) FILTER(WHERE activity) AS "activeUsers" FROM facts f GROUP BY day),
    days AS (SELECT d::date AS day FROM generate_series(($1::timestamptz AT TIME ZONE 'Asia/Shanghai')::date,(($2::timestamptz AT TIME ZONE 'Asia/Shanghai')::date-1),'1 day'::interval) d)
    SELECT (SELECT count(*) FROM people) total,
      COALESCE((SELECT jsonb_agg(p) FROM (SELECT * FROM people ORDER BY "${sortColumns[query.sort]}" DESC,email LIMIT $7 OFFSET $8) p),'[]') users,
      (SELECT jsonb_build_object(${numericKeys.map(k => `'${k}',COALESCE(sum(p."${k}"),0)`).join(",")},'activeDays',COALESCE(sum(p."activeDays"),0),'activeUsers',COALESCE(sum(p."activeUsers"),0)) FROM people p) summary,
      (SELECT jsonb_agg(jsonb_build_object('date',d.day::text,'tasks',COALESCE(a."tasks",0),'delivered',COALESCE(a."delivered",0),'uploads',COALESCE(a."uploads",0),'consumed',COALESCE(a."consumed",0),'refunded',COALESCE(a."refunded",0),'activeUsers',COALESCE(a."activeUsers",0)) ORDER BY d.day) FROM days d LEFT JOIN daily a USING(day)) daily,
      COALESCE((SELECT jsonb_object_agg(source,n) FROM (SELECT source,count(*) n FROM facts GROUP BY source)c),'{}') source_counts,
      (SELECT min(day)::text FROM facts) first_in_window`, values);
  const raw = result.rows[0];
  const tenants = scope ? [{ id: scope.tenantId, name: scope.tenantName }] : has("app_account_teams") ? (await tx.query("SELECT id::text,name FROM app_account_teams ORDER BY name,id")).rows : [];
  return { generatedAt: new Date().toISOString(), query: { from: query.from, to: query.to, email: query.email, tenantId: scope?.tenantId || query.tenantId, q: query.q, sort: query.sort },
    summary: metrics(raw.summary || {}), users: raw.users.map((r: Record<string, unknown>): UsageUser => ({ ...metrics(r), email: String(r.email), name: String(r.name), company: String(r.company), tenantId: r.tenantId ? String(r.tenantId) : null, role: String(r.role), lastActivityAt: r.lastActivityAt ? String(r.lastActivityAt) : null })),
    daily: raw.daily || [], total: num(raw.total), page: query.page, size: query.size, tenants,
    coverage: { sources: sources.map(([table, label, key]) => ({ key, label, available: has(table), records: num(raw.source_counts[key]) })), historyFrom: raw.first_in_window,
      notes: ["日期按北京时间；历史记录直接读取原业务表，不依赖新创作中心回填。", "企业筛选按当前账号归属；企业视图仅统计当前获准查看成员的历史账号用量，不回写旧任务归属。", "最早记录指本次查询窗口内的首条记录；可修改日期逐年查询更早历史。", "生成交付为已保存作品，不等于已采纳、质量评分或员工绩效；来源证据不足的历史作品单列。", "后台退款与赠送不计用户活跃；所有效率指标不推算在线工时。", "缺失 Token 或来源表时记录覆盖不足，不以零值冒充完整历史。"] }, definitions: USAGE_DEFINITIONS };
}

export async function queryUserUsage(query: UsageQuery): Promise<UsageResponse> {
  await ensureBiSchema();
  const tx = await getPool().connect();
  try {
    await tx.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await tx.query("SET LOCAL statement_timeout='15s'");
    const result = await readUserUsage(tx, query);
    await tx.query("COMMIT"); return result;
  } catch (error) { await tx.query("ROLLBACK"); throw error; }
  finally { tx.release(); }
}
