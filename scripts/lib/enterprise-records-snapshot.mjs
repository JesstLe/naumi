/**
 * Operator-only source snapshot. No application imports, schema initialization,
 * network calls, wallet reads, or source writes. The caller owns the pg Pool.
 * Date boundaries are inclusive Asia/Shanghai calendar days, at most the latest
 * 30 days. mediaUrls is PRIVATE collector material, never a public response.
 * Current membership is not evidence of historical business ownership.
 */
export class RecordsSnapshotError extends Error {
  constructor(code) { super(code); this.name = 'RecordsSnapshotError'; this.code = code; }
}
const requireValue = (ok, code) => { if (!ok) throw new RecordsSnapshotError(code); };
const DAY = 86400000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const string = (v, max = 1000) => typeof v === 'string' && v.length ? v.slice(0, max) : null;
const number = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const iso = v => v === null || v === undefined ? null : new Date(v).toISOString();
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;

function inputs(registry, options) {
  requireValue(registry?.version === 1 && typeof registry.instance === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(registry.instance), 'RECORDS_REGISTRY_INVALID');
  requireValue(typeof registry.enterpriseId === 'string' && uuid.test(registry.enterpriseId), 'RECORDS_ENTERPRISE_ID_INVALID');
  requireValue(typeof registry.enterpriseName === 'string' && registry.enterpriseName.trim().length > 0 && registry.enterpriseName.length <= 120, 'RECORDS_ENTERPRISE_NAME_INVALID');
  requireValue(typeof registry.origin === 'string', 'RECORDS_ORIGIN_INVALID');
  let origin; try { origin = new URL(registry.origin); } catch { throw new RecordsSnapshotError('RECORDS_ORIGIN_INVALID'); }
  requireValue(origin.protocol === 'https:' && !origin.username && !origin.password && origin.origin === registry.origin, 'RECORDS_ORIGIN_INVALID');
  requireValue(Array.isArray(options?.subjects) && options.subjects.length <= 100, 'RECORDS_SUBJECT_LIMIT');
  requireValue(options.subjects.every(s => typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(s)), 'RECORDS_SUBJECT_INVALID');
  const subjects = [...new Set(options.subjects)].sort(); // Stable IDs, never aliases or inferred identities.
  const limit = options.limit ?? 1000;
  requireValue(Number.isInteger(limit) && limit >= 1 && limit <= 1000, 'RECORDS_LIMIT_INVALID');
  requireValue(date(options.from) && date(options.to) && options.from <= options.to
    && Date.parse(options.to) - Date.parse(options.from) < 30 * DAY, 'RECORDS_WINDOW_INVALID');
  return { instanceId: registry.instance, enterpriseId: registry.enterpriseId.toLowerCase(), enterpriseName: registry.enterpriseName,
    origin: origin.origin, subjects, from: options.from, to: options.to, limit };
}

// Every source reference has an exact namespace AND an exact actor. A personal
// creation elsewhere on the same account says nothing about an unlinked row.
// Input/lineage artwork links must not assign or exclude an output's ownership.
const scopes = `WITH source_scopes AS (
  SELECT r.target_type,r.target_id,r.actor_email,
    bool_or(r.creator IS DISTINCT FROM r.actor_email OR r.scope_kind='personal' OR r.scope_kind='tenant' AND r.tenant_id IS NULL
      OR r.tenant_id IS NOT NULL AND r.tenant_id IS DISTINCT FROM $4::uuid) AS excluded,
    bool_or(r.creator=r.actor_email AND r.scope_kind='tenant' AND r.tenant_id=$4::uuid) AS frozen
  FROM (
   SELECT l.target_type,l.target_id,l.actor_email,c.actor_email AS creator,c.scope_kind,c.tenant_id
   FROM public.app_creation_links l JOIN public.app_creation_records c ON c.id=l.creation_id
   WHERE l.actor_email=ANY($1::text[]) AND (l.target_type<>'artwork' OR l.relation='output')
   UNION ALL SELECT c.source_kind,c.source_id,c.actor_email,c.actor_email,c.scope_kind,c.tenant_id
   FROM public.app_creation_records c WHERE c.actor_email=ANY($1::text[]) AND c.source_kind<>'artwork'
   UNION ALL SELECT 'artwork',substring(a.storage_ref from 9),a.actor_email,c.actor_email,c.scope_kind,c.tenant_id
   FROM public.app_creation_assets a JOIN public.app_creation_records c ON c.id=a.creation_id
   WHERE a.actor_email=ANY($1::text[]) AND a.direction='output' AND a.storage_ref LIKE 'artwork:%'
   UNION ALL SELECT 'image:'||j.kind,j.id,j.email,j.payload->'creationScope'->>'actorEmail',
    j.payload->'creationScope'->>'scopeKind',CASE WHEN j.payload->'creationScope'->>'tenantId' ~ '^[0-9a-fA-F-]{36}$' THEN (j.payload->'creationScope'->>'tenantId')::uuid END
   FROM public.app_image_jobs j WHERE j.email=ANY($1::text[]) AND j.payload->'creationScope'->>'scopeKind' IN ('personal','tenant')
   UNION ALL SELECT 'artwork',t.result_artwork_id,t.email,c.actor_email,c.scope_kind,c.tenant_id
   FROM public.app_canvas_image_tasks t JOIN public.app_creation_records c ON c.actor_email=t.email AND c.source_kind='canvas-image' AND c.source_id=t.id
   WHERE t.email=ANY($1::text[]) AND t.result_artwork_id IS NOT NULL
   UNION ALL SELECT 'artwork',COALESCE(a->>'artworkId',a->>'id'),j.email,c.actor_email,c.scope_kind,c.tenant_id
   FROM public.app_image_jobs j JOIN public.app_creation_records c ON c.actor_email=j.email AND c.source_kind='image:'||j.kind AND c.source_id=j.id
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(COALESCE(j.snapshot->'result'->'artifacts',j.snapshot->'images',j.snapshot->'shots'))='array'
     THEN COALESCE(j.snapshot->'result'->'artifacts',j.snapshot->'images',j.snapshot->'shots') ELSE '[]'::jsonb END) a
   WHERE j.email=ANY($1::text[]) AND COALESCE(a->>'artworkId',a->>'id') IS NOT NULL
  ) r GROUP BY r.target_type,r.target_id,r.actor_email
)`;
const scopeJoin = (alias, type, id, email) => `LEFT JOIN source_scopes ${alias}
  ON ${alias}.target_type=${type} AND ${alias}.target_id=${id} AND ${alias}.actor_email=${email}`;
const allowed = (...aliases) => aliases.map(a => `NOT COALESCE(${a}.excluded,false)`).join(' AND ');
const ownership = (...aliases) => `CASE WHEN ${aliases.map(a => `COALESCE(${a}.frozen,false)`).join(' OR ')}
  THEN 'frozen-tenant' ELSE 'legacy-unconfirmed' END AS ownership`;
const windowSql = alias => `${alias}.email=ANY($1::text[]) AND ${alias}.created_at >= $2::timestamptz AND ${alias}.created_at < $3::timestamptz`;
const promptValue = expr => `CASE WHEN jsonb_typeof(${expr})='string' THEN ${expr}#>>'{}' END`;

const artworks = `SELECT a.id,a.email,a.created_at,left(a.title,1000) AS title,left(a.prompt,20000) AS prompt,a.status,
  a.creation_provenance->>'operation' AS operation,a.creation_provenance->>'entry' AS entry,
  a.creation_provenance->>'evidence' AS provenance_evidence,a.image_url,${ownership('s')}
  FROM public.app_artworks a ${scopeJoin('s', "'artwork'", 'a.id', 'a.email')}
  WHERE ${windowSql('a')} AND a.deleted_at IS NULL AND ${allowed('s')}`;

const taskSources = `SELECT j.id,j.email,j.created_at,'image-job'::text AS source_kind,'image:'||j.kind AS target_type,
  'led-image-'||j.id AS legacy_ledger_id,j.kind,j.snapshot->>'status' AS status,
  left(COALESCE(${promptValue("j.payload->'p'->'userPrompt'")},${promptValue("j.payload->'p'->'prompt'")},
    ${promptValue("j.payload->'plan'->'request'->'prompt'")},${promptValue("j.payload->'creationScope'->'requestText'")},
    ${promptValue("j.payload->'extra'")},${promptValue("j.snapshot->'extra'")}),20000) AS prompt,
  CASE WHEN j.kind='imagegen' THEN NULLIF(j.payload->'plan'->>'totalCredits','')::numeric ELSE j.cost END AS quoted,
  CASE WHEN j.billing_settled THEN 0 ELSE j.reserved_cost END AS reserved,j.billing_settled AS settled
  FROM public.app_image_jobs j WHERE ${windowSql('j')}
  UNION ALL SELECT c.id,c.email,c.created_at,'canvas-task','canvas-image','led-canvas-image-'||c.id,c.kind,c.status,
    left(COALESCE(${promptValue("c.parameters->'newText'")},${promptValue("c.parameters->'prompt'")}),20000),
    c.cost,NULL::integer,CASE WHEN c.status='completed' THEN true ELSE NULL END
  FROM public.app_canvas_image_tasks c WHERE ${windowSql('c')}
  UNION ALL SELECT v.id,v.email,v.created_at,'video-task','video','led-video-'||v.id,'video',v.status,
    left(v.prompt,20000),v.cost,NULL::integer,CASE WHEN v.status='completed' THEN true ELSE NULL END
  FROM public.app_video_tasks v WHERE ${windowSql('v')}`;

// SUM with no proven refund is deliberately NULL, not an invented zero. A review
// amount alone is not a refund; require its exact ledger and refund-source batch.
const refunds = `LEFT JOIN LATERAL (
  SELECT sum(rl.delta) AS refunded FROM public.app_billing_api_cost_reviews r
  JOIN public.app_ledger rl ON rl.id='led-api-refund-'||r.id AND rl.email=o.email AND rl.delta>0
  JOIN public.app_credit_batches rb ON rb.email=rl.email AND rb.source='refund' AND rb.id='bat-'||substring(rl.id from 5)
  WHERE r.operation_id=o.id AND r.status='refunded' AND r.refund_credits=rl.delta
) refund ON true`;
const generations = `SELECT j.id,j.email,j.created_at,j.source_kind,j.kind,j.status,j.prompt,
  o.id AS operation_id,COALESCE(o.quote->>'requestedCredits',j.quoted::text) AS quoted,
  COALESCE(o.reserved_credits,j.reserved) AS reserved,charge.charged,refund.refunded,
  CASE WHEN o.id IS NULL THEN j.settled WHEN o.state IN ('settled','released') THEN true
    WHEN o.state IN ('prepared','reserved','manual','hold') THEN false ELSE NULL END AS settled,
  ${ownership('s', 'bs')}
  FROM (${taskSources}) j
  LEFT JOIN public.app_billing_operations o ON o.id=j.id AND o.email=j.email
  ${scopeJoin('s', 'j.target_type', 'j.id', 'j.email')}
  ${scopeJoin('bs', "'billing'", 'o.id', 'j.email')}
  LEFT JOIN LATERAL (SELECT -l.delta AS charged FROM public.app_ledger l
    WHERE l.email=j.email AND l.kind='consume' AND l.delta<0 AND (l.id=o.ledger_id OR l.id=j.legacy_ledger_id)
    ORDER BY (l.id=o.ledger_id) DESC NULLS LAST,l.id LIMIT 1) charge ON true
  ${refunds}
  WHERE ${allowed('s', 'bs')}`;

// Same classification as enterprise/analytics; never return raw reason text.
// Legacy task links also exclude personal/foreign charges and their exact refunds
// when an old execution did not create a separate billing link.
const ledger = `SELECT l.id,l.email,l.created_at,l.delta,
  CASE WHEN o.feature='credits.adjust' OR l.reason='管理员调整积分' THEN 'adjust'
    WHEN l.kind='refund' AND l.delta>0 OR l.delta>0 AND EXISTS(
      SELECT 1 FROM public.app_credit_batches b WHERE b.email=l.email AND b.source='refund' AND b.id='bat-'||substring(l.id from 5)) THEN 'refund'
    WHEN l.kind='consume' AND l.delta<0 THEN 'consume'
    WHEN l.kind IN ('grant','purchase','expire') THEN l.kind ELSE 'other' END AS ledger_kind,
  o.id AS operation_id,COALESCE(o.feature,CASE
    WHEN l.reason ~ '^生成 [0-9]+ 张图' THEN 'image.generate'
    WHEN l.reason ~ '^爆款复刻 [0-9]+ 张' THEN 'tool.replicate'
    WHEN l.reason ~ '^一键套图 [0-9]+ 张' THEN 'image.suite'
    WHEN l.reason ~ '^A\\+ 详情页 [0-9]+ 张' THEN 'image.aplus'
    WHEN l.reason IN ('竞品工作台生成','竞品衍生图') THEN 'competitor.action'
    WHEN l.reason ~ '^画布扩图( · (low|medium|high))?$' THEN 'canvas.expand'
    WHEN l.reason ~ '^画布标注编辑( · (low|medium|high))?$' THEN 'canvas.annotate'
    WHEN l.reason='画布在线改字' THEN 'canvas.text-edit' END) AS feature,${ownership('s', 'iscope', 'cscope', 'vscope')}
  FROM public.app_ledger l
  LEFT JOIN LATERAL (
    SELECT b.id,b.email,b.feature,b.ledger_id,b.created_at FROM public.app_billing_operations b
    WHERE b.email=l.email AND b.ledger_id=l.id
    UNION ALL SELECT b.id,b.email,b.feature,b.ledger_id,b.created_at
    FROM public.app_billing_api_cost_reviews r JOIN public.app_billing_operations b ON b.id=r.operation_id AND b.email=l.email
    WHERE l.id='led-api-refund-'||r.id
    ORDER BY created_at,id LIMIT 1
  ) o ON true
  ${scopeJoin('s', "'billing'", 'o.id', 'l.email')}
  LEFT JOIN LATERAL (SELECT bool_or(js.excluded) AS excluded,bool_or(js.frozen) AS frozen
    FROM source_scopes js WHERE js.actor_email=l.email AND js.target_type LIKE 'image:%' AND js.target_id=CASE
      WHEN left(COALESCE(o.ledger_id,l.id),length('led-image-'))='led-image-'
        THEN substring(COALESCE(o.ledger_id,l.id) from length('led-image-')+1) END
  ) iscope ON true
  LEFT JOIN LATERAL (SELECT bool_or(js.excluded) AS excluded,bool_or(js.frozen) AS frozen
    FROM source_scopes js WHERE js.actor_email=l.email AND js.target_type='canvas-image' AND js.target_id=CASE
      WHEN left(COALESCE(o.ledger_id,l.id),length('led-canvas-image-'))='led-canvas-image-'
        THEN substring(COALESCE(o.ledger_id,l.id) from length('led-canvas-image-')+1) END
  ) cscope ON true
  LEFT JOIN LATERAL (SELECT bool_or(js.excluded) AS excluded,bool_or(js.frozen) AS frozen
    FROM source_scopes js WHERE js.actor_email=l.email AND js.target_type='video' AND js.target_id=CASE
      WHEN left(COALESCE(o.ledger_id,l.id),length('led-video-'))='led-video-'
        THEN substring(COALESCE(o.ledger_id,l.id) from length('led-video-')+1) END
  ) vscope ON true
  WHERE ${windowSql('l')} AND ${allowed('s', 'iscope', 'cscope', 'vscope')}`;

const operationLabels = { generate: '生成图片', imagegen: '图像创作', suite: '生成套图', aplus: 'A+ 详情图', upload: '上传图片',
  copy: '复制作品', import: '导入图片', template: '模板导入', restore: '恢复作品', cutout: '智能抠图', upscale: '高清放大',
  printfile: '印花文件', extract: '提取印花', retouch: '商品精修', recolor: '产品换色', replicate: '图片复刻', style: '风格转换',
  garment: '服装精修', garment3d: '3D 服装图', avatar: '生成模特', dewrinkle: '服装去皱', dewatermark: '去水印',
  inpaint: '局部重绘', tryon: '模特试穿', packaging3d: '3D 包装', expand: '画布扩图', annotate: '画布标注', 'text-edit': '画布改字',
  'canvas-text-edit': '画布改字', 'canvas-expand': '画布扩图', 'canvas-annotate': '画布标注', 'canvas-stitch': '画布拼图',
  'server-save': '保存作品', 'title-gen': '文案生成', video: '生成视频', comfyui: '工作流生成' };
const entryLabels = { canvas: '画布', generate: '生图页', toolbox: '工具箱', agent: '智能助手', genchat: '生图对话', works: '作品库',
  competitor: '竞品素材', template: '模板库', video: '视频工作台', restore: '恢复接口', server: '服务端' };
const featureLabels = { 'image.generate': '普通生图', 'image.suite': '商品套图', 'image.aplus': 'A+ 详情页', 'tool.cutout': '抠图',
  'tool.upscale': '图片放大', 'tool.printfile': '印花文件', 'tool.ipcheck': '侵权检测', 'tool.garment': '服装图', 'tool.avatar': '数字模特',
  'tool.dewrinkle': '去褶皱', 'tool.dewatermark': '去水印', 'tool.style': '风格迁移', 'tool.tryon': '虚拟试穿', 'tool.retouch': '商品精修',
  'tool.recolor': '产品换色', 'tool.replicate': '爆款复刻', 'tool.inpaint': '局部重绘', 'tool.extract': '元素提取', 'tool.garment3d': '服装 3D',
  'tool.packaging3d': '包装 3D', 'competitor.action': '竞品衍生图', 'canvas.image': '画布图片改字', 'canvas.expand': '画布扩图',
  'canvas.text-edit': '画布图片改字（旧版）', 'canvas.annotate': '画布批注改图', 'video.generate': '视频生成', 'video.process': '视频媒体处理',
  'canvas.text-generate': '画布文字生成与提示词', 'canvas.assistant': '画布助手对话', 'canvas.ocr': '画布文字识别（OCR）', 'credits.adjust': '管理员调账' };
const states = new Set(['queued', 'running', 'pending', 'processing', 'reserved', 'prepared', 'done', 'completed', 'succeeded', 'success',
  'error', 'failed', 'cancelled', 'canceled', 'needs_attention', 'manual', 'hold', 'released', 'settled', 'unknown', 'draft', 'ready', 'saved']);
const label = (map, key) => Object.hasOwn(map, key) ? map[key] : null;
function record(config, kind, row, names) {
  const sourceKind = kind === 'generations' ? row.source_kind : kind === 'artworks' ? 'artwork' : 'ledger';
  const operation = kind === 'ledger' ? label(featureLabels, row.feature) : label(operationLabels, kind === 'artworks' ? row.operation : row.kind);
  const charged = kind === 'generations' ? number(row.charged) : null;
  return {
    ref: { instanceId: config.instanceId, enterpriseId: config.enterpriseId, kind: sourceKind, id: String(row.id) },
    account: { sourceKey: JSON.stringify([config.instanceId, row.email]), email: row.email, name: names.get(row.email) ?? null },
    createdAt: iso(row.created_at), title: kind === 'artworks' ? string(row.title) : null,
    prompt: kind === 'ledger' ? null : string(row.prompt, 20000), status: states.has(row.status) ? row.status : null,
    operation, sourceLabel: kind === 'artworks' ? label(entryLabels, row.entry) : kind === 'ledger' ? row.operation_id ? '计费记录' : operation ? '历史摘要' : '未记录'
      : sourceKind === 'canvas-task' ? '画布' : sourceKind === 'video-task' ? '视频工作台' : '图片生成',
    provenance: kind === 'artworks' && ['server-route', 'server-save'].includes(row.provenance_evidence) ? '创建时记录' : null,
    taskRefs: { imageJobId: sourceKind === 'image-job' ? String(row.id) : null, canvasTaskId: sourceKind === 'canvas-task' ? String(row.id) : null,
      videoTaskId: sourceKind === 'video-task' ? String(row.id) : null, billingOperationId: string(row.operation_id, 240) },
    credits: { quoted: kind === 'generations' ? number(row.quoted) : null, charged,
      reserved: kind === 'generations' ? number(row.reserved) : null, delta: kind === 'ledger' ? number(row.delta) : null,
      settled: typeof row.settled === 'boolean' ? row.settled : null,
      evidence: kind === 'ledger' ? 'ledger-entry' : charged !== null ? 'linked-ledger' : 'unrecorded',
      refunded: kind === 'generations' ? number(row.refunded) : null },
    ledgerKind: kind === 'ledger' ? row.ledger_kind : null, media: { available: false, href: null },
    attribution: { visibility: 'current-enterprise-scope', businessOwnership: 'unconfirmed', workflowTaskId: null },
    ownership: row.ownership === 'frozen-tenant' ? 'frozen-tenant' : 'legacy-unconfirmed',
  };
}

async function readSourceSnapshot(pool, config, collect) {
  let tx, transaction = false, discard = false;
  try {
    tx = await pool.connect();
    await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); transaction = true;
    await tx.query("SET LOCAL statement_timeout='8s'");
    await tx.query("SET LOCAL lock_timeout='1s'");
    await tx.query("SET LOCAL idle_in_transaction_session_timeout='15s'");
    await tx.query('SET LOCAL search_path=pg_catalog,public');
    const observed = (await tx.query(`SELECT now() AS observed_at,current_setting('transaction_read_only') AS read_only,
      current_setting('transaction_isolation') AS isolation`)).rows[0];
    requireValue(observed?.read_only === 'on' && observed.isolation === 'repeatable read', 'RECORDS_READ_ONLY_REQUIRED');
    const observedAt = iso(observed.observed_at);
    const today = new Date(Date.parse(observedAt) + 8 * 3600000).toISOString().slice(0, 10);
    const earliest = new Date(Date.parse(today) - 29 * DAY).toISOString().slice(0, 10);
    requireValue(config.from >= earliest && config.to <= today, 'RECORDS_WINDOW_NOT_RECENT');
    const enterprise = (await tx.query(`SELECT t.name,t.enabled,s.enabled AS enterprise_enabled,
      t.authorized_until IS NULL OR t.authorized_until>now() AS authorized
      FROM public.app_account_teams t JOIN public.app_enterprise_settings s ON s.team_id=t.id WHERE t.id=$1::uuid`, [config.enterpriseId])).rows;
    requireValue(enterprise.length === 1, 'RECORDS_ENTERPRISE_NOT_FOUND');
    requireValue(enterprise[0].name === config.enterpriseName, 'RECORDS_ENTERPRISE_NAME_MISMATCH');
    requireValue(enterprise[0].enabled === true && enterprise[0].enterprise_enabled === true && enterprise[0].authorized === true, 'RECORDS_ENTERPRISE_DISABLED');
    const members = (await tx.query(`SELECT u.email,left(u.name,1000) AS name FROM public.app_users u
      WHERE u.email=ANY($2::text[]) AND NOT u.banned AND (u.account_expires_at IS NULL OR u.account_expires_at>now())
      AND (EXISTS(SELECT 1 FROM public.app_enterprise_members m WHERE m.enterprise_id=$1::uuid AND m.email=u.email
        AND m.membership_status='active' AND (m.membership_expires_at IS NULL OR m.membership_expires_at>now()))
        OR EXISTS(SELECT 1 FROM public.app_account_teams t WHERE t.id=$1::uuid AND t.owner_email=u.email))
      ORDER BY u.email COLLATE "C" LIMIT 101`, [config.enterpriseId, config.subjects])).rows;
    requireValue(members.length <= 100 && members.every(m => config.subjects.includes(m.email)), 'RECORDS_MEMBER_SCOPE_INVALID');
    const result = await collect(tx, observedAt, members);
    await tx.query('ROLLBACK'); transaction = false;
    return result;
  } catch (error) {
    if (tx && !transaction) discard = true; // A failed BEGIN must not return an uncertain session to the pool.
    if (tx && transaction) {
      try { await tx.query('ROLLBACK'); transaction = false; } catch { discard = true; }
    }
    // SQL/driver errors can contain connection details, SQL, or payload fragments.
    throw error instanceof RecordsSnapshotError ? error : new RecordsSnapshotError('RECORDS_SOURCE_READ_FAILED');
  } finally {
    if (tx) try { tx.release(discard ? true : undefined); }
    catch { throw new RecordsSnapshotError('RECORDS_SOURCE_RELEASE_FAILED'); }
  }
}

/**
 * @param {{connect: Function}} pool standard pg Pool (no global DB/config lookup)
 * @param {{version:1,instance:string,origin:string,enterpriseId:string,enterpriseName:string}} registry
 * @param {{subjects:string[],from:string,to:string,limit?:number}} options
 */
export async function inspectRecords(pool, registry, options) {
  const config = inputs(registry, options);
  return readSourceSnapshot(pool, config, async (tx, observedAt, members) => {
    const names = new Map(members.map(m => [m.email, string(m.name)]));
    const result = { version: 1, type: 'enterprise-source-snapshot-v1', instanceId: config.instanceId,
      enterpriseId: config.enterpriseId, enterpriseName: config.enterpriseName, origin: config.origin, observedAt,
      from: config.from, to: config.to, members: members.map(m => ({ email: m.email, name: names.get(m.email) })),
      rows: { artworks: [], generations: [], ledger: [] }, limits: {}, sourceReadOnly: true, sourceWrites: 0, mediaUrls: {} };
    // Fixed query count; counts and limit+1 rows share this exact RR snapshot.
    // A count is independent of the page, so an empty/limited page cannot hide
    // omitted accounting entries. Do not total generation estimates with ledger.
    const values = [members.map(m => m.email), `${config.from}T00:00:00+08:00`,
      new Date(Date.parse(`${config.to}T00:00:00+08:00`) + DAY).toISOString(), config.enterpriseId];
    for (const [kind, source] of Object.entries({ artworks, generations, ledger })) {
      const total = Number((await tx.query(`${scopes} SELECT count(*) AS total FROM (${source}) matched`, values)).rows[0]?.total);
      requireValue(Number.isSafeInteger(total) && total >= 0, 'RECORDS_TOTAL_INVALID');
      const page = (await tx.query(`${scopes} SELECT page.* FROM (${source}) page
        ORDER BY page.created_at DESC,page.id COLLATE "C" DESC${kind === 'generations' ? ',page.source_kind COLLATE "C" ASC' : ''} LIMIT $5::integer`, [...values, config.limit + 1])).rows;
      requireValue(page.length <= config.limit + 1 && page.length === Math.min(total, config.limit + 1), 'RECORDS_COUNT_MISMATCH');
      requireValue(page.every(row => names.has(row.email)), 'RECORDS_ROW_SCOPE_INVALID');
      result.limits[kind] = { total, truncated: total > config.limit };
      const selected = page.slice(0, config.limit);
      result.rows[kind] = selected.map(row => record(config, kind, row, names));
      if (kind === 'artworks') for (const row of selected) {
        if (typeof row.image_url === 'string' && row.image_url.length && row.image_url.length <= 16384)
          Object.defineProperty(result.mediaUrls, String(row.id), { value: row.image_url, enumerable: true, configurable: true, writable: true });
      }
    }
    return result;
  });
}

// This parser deliberately does not import storage.ts: that module reads global
// configuration and creates storage clients. publicBase is the caller's trusted,
// registered storage base, never an origin learned from an artwork URL.
function mediaKey(value) {
  if (typeof value !== 'string' || !value.length || value.length > 1024
    || /[\u0000-\u0020\u007f-\u009f\\%?#:]/.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return value;
}
function mediaBase(value) {
  if (value === undefined || value === '') return null;
  requireValue(typeof value === 'string' && value.length <= 4096
    && !/[\u0000-\u0020\u007f-\u009f\\%?#]/.test(value), 'RECORDS_MEDIA_BASE_INVALID');
  let url; try { url = new URL(value); } catch { throw new RecordsSnapshotError('RECORDS_MEDIA_BASE_INVALID'); }
  const base = value.endsWith('/') ? value.slice(0, -1) : value;
  requireValue(url.protocol === 'https:' && !url.username && !url.password
    && !url.search && !url.hash && url.href.replace(/\/$/, '') === base
    && (url.pathname === '/' || mediaKey(url.pathname.slice(1).replace(/\/$/, '')) !== null), 'RECORDS_MEDIA_BASE_INVALID');
  return base;
}
function managedMediaKey(value, publicBase) {
  if (typeof value !== 'string' || !value.length || value.length > 16384
    || /[\u0000-\u0020\u007f-\u009f\\?#]/.test(value)) return null;
  const prefix = value.startsWith('/media/') ? '/media/' : publicBase && value.startsWith(publicBase + '/') ? publicBase + '/' : null;
  if (!prefix) return null;
  const encoded = value.slice(prefix.length);
  // Reject encoded separators and double encodings rather than allowing a URL
  // implementation or downstream proxy to normalize a different object path.
  if (/%(?:2f|5c)/i.test(encoded)) return null;
  try { return mediaKey(decodeURIComponent(encoded)); } catch { return null; }
}
const mediaPair = (id, email) => JSON.stringify([id, email]);
function mediaInputs(registry, options) {
  const config = inputs(registry, options);
  requireValue(Array.from(options.subjects).every(subject => typeof subject === 'string')
    && config.subjects.length === options.subjects.length, 'RECORDS_MEDIA_SUBJECTS_NOT_UNIQUE');
  requireValue(Array.isArray(options.pairs) && options.pairs.length <= 25, 'RECORDS_MEDIA_PAIR_LIMIT');
  const unique = new Set();
  const pairs = Array.from(options.pairs, pair => {
    requireValue(pair && typeof pair === 'object' && !Array.isArray(pair) && Object.keys(pair).length === 2
      && Object.hasOwn(pair, 'id') && Object.hasOwn(pair, 'email')
      && typeof pair.id === 'string' && pair.id.length > 0 && pair.id.length <= 240 && pair.id.trim() === pair.id
      && !/[\u0000-\u001f\u007f]/.test(pair.id)
      && typeof pair.email === 'string' && config.subjects.includes(pair.email), 'RECORDS_MEDIA_PAIR_INVALID');
    const key = mediaPair(pair.id, pair.email);
    requireValue(!unique.has(key), 'RECORDS_MEDIA_PAIRS_NOT_UNIQUE');
    unique.add(key);
    return { id: pair.id, email: pair.email };
  });
  requireValue(options.driver === 's3' || options.driver === 'r2', 'RECORDS_MEDIA_DRIVER_INVALID');
  return { ...config, pairs, driver: options.driver, publicBase: mediaBase(options.publicBase) };
}
function mediaMetadata(row, driver) {
  if (!row || mediaKey(row.key) === null || typeof row.owner !== 'string' || row.driver !== driver
    || typeof row.remote_ready !== 'boolean' || typeof row.content_type !== 'string' || !row.content_type.length
    || row.content_type.length > 255 || /[\u0000-\u001f\u007f]/.test(row.content_type)
    || typeof row.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(row.sha256)
    || !((typeof row.bytes === 'string' && /^(0|[1-9][0-9]*)$/.test(row.bytes)) || typeof row.bytes === 'number')
    || !Number.isSafeInteger(Number(row.bytes)) || Number(row.bytes) < 0) return null;
  return row;
}
function mediaAsset(row, metadata) {
  const reference = key => mediaKey(key) !== null && metadata.get(mediaPair(key, row.owner))?.remote_ready === true ? key : null;
  return { key: row.key, owner: row.owner, remoteReady: row.remote_ready, contentType: row.content_type,
    sha256: row.sha256, bytes: Number(row.bytes), thumbnailKey: reference(row.thumbnail_key), previewKey: reference(row.preview_key) };
}

/**
 * Exact artwork/media authorization in one repeatable-read, read-only snapshot.
 * No records pagination, schema initialization, object reads, or network calls.
 * Unauthorized/missing originals are omitted; invalid variants and their pointers
 * are omitted/null. Output order follows pairs, not the records page or limit.
 * The caller passes driver/publicBase from its registered storage configuration.
 * @param {{connect: Function}} pool caller-owned standard pg Pool
 * @param {{version:1,instance:string,origin:string,enterpriseId:string,enterpriseName:string}} registry
 * @param {{subjects:string[],from:string,to:string,pairs:{id:string,email:string}[],limit?:number,driver:'s3'|'r2',publicBase?:string}} options
 * @returns {Promise<{observedAt:string,sourceReadOnly:true,sourceWrites:0,items:Array<{
 *   id:string,email:string,imageUrl:string,ownership:'frozen-tenant'|'legacy-unconfirmed',
 *   asset: {key:string,owner:string,remoteReady:true,contentType:string,sha256:string,bytes:number,thumbnailKey:string|null,previewKey:string|null},
 *   variants: Array<{key:string,owner:string,remoteReady:true,contentType:string,sha256:string,bytes:number,thumbnailKey:string|null,previewKey:string|null}>
 * }>}>}
 */
export async function inspectMedia(pool, registry, options) {
  const config = mediaInputs(registry, options);
  return readSourceSnapshot(pool, config, async (tx, observedAt, members) => {
    const requested = new Set(config.pairs.map(pair => mediaPair(pair.id, pair.email)));
    const emails = new Set(members.map(member => member.email));
    const result = { observedAt, sourceReadOnly: true, sourceWrites: 0, items: [] };
    if (!config.pairs.length || !emails.size) return result;
    // Reuse the exact scopes + artwork predicate, including deletion, date and
    // output-only receipt semantics. Two arrays are zipped, never two ANY lists.
    const rows = (await tx.query(`${scopes} SELECT authorized.id,authorized.email,authorized.image_url,authorized.ownership
      FROM (${artworks}) authorized
      JOIN unnest($5::text[],$6::text[]) AS requested(id,email)
        ON requested.id=authorized.id AND requested.email=authorized.email`,
    [[...emails], `${config.from}T00:00:00+08:00`,
      new Date(Date.parse(`${config.to}T00:00:00+08:00`) + DAY).toISOString(), config.enterpriseId,
      config.pairs.map(pair => pair.id), config.pairs.map(pair => pair.email)])).rows;
    const authorized = new Map(), seen = new Set();
    requireValue(rows.length <= config.pairs.length, 'RECORDS_MEDIA_ROW_SCOPE_INVALID');
    for (const row of rows) {
      const pair = mediaPair(row.id, row.email);
      requireValue(requested.has(pair) && emails.has(row.email) && !seen.has(pair)
        && ['legacy-unconfirmed', 'frozen-tenant'].includes(row.ownership), 'RECORDS_MEDIA_ROW_SCOPE_INVALID');
      seen.add(pair);
      const key = managedMediaKey(row.image_url, config.publicBase);
      // An old URL is not metadata or an ownership grant.
      if (key !== null) authorized.set(pair, { ...row, key });
    }
    if (!authorized.size) return result;
    const sources = [...authorized.values()];
    // The real media DDL uses owner/driver/remote_ready/content_type and bigint
    // bytes. Every derivative needs its OWN exact metadata authorization.
    const assets = (await tx.query(`WITH source_assets AS (
      SELECT a.key,a.owner,a.thumbnail_key,a.preview_key FROM public.app_media_assets a
      JOIN unnest($1::text[],$2::text[]) AS requested(key,owner) ON requested.key=a.key AND requested.owner=a.owner
      WHERE a.driver=$3::text
    ), authorized_keys AS (
      SELECT key,owner FROM source_assets
      UNION SELECT thumbnail_key,owner FROM source_assets WHERE thumbnail_key IS NOT NULL
      UNION SELECT preview_key,owner FROM source_assets WHERE preview_key IS NOT NULL
    ) SELECT a.key,a.owner,a.driver,a.remote_ready,a.content_type,a.sha256,a.bytes,a.thumbnail_key,a.preview_key
      FROM public.app_media_assets a JOIN authorized_keys k ON k.key=a.key AND k.owner=a.owner
      WHERE a.driver=$3::text AND (a.remote_ready OR EXISTS(
        SELECT 1 FROM source_assets original WHERE original.key=a.key AND original.owner=a.owner))`,
    [sources.map(row => row.key), sources.map(row => row.email), config.driver])).rows;
    const metadata = new Map();
    for (const row of assets) {
      if (!mediaMetadata(row, config.driver)) continue;
      const key = mediaPair(row.key, row.owner);
      requireValue(!metadata.has(key), 'RECORDS_MEDIA_METADATA_INVALID');
      metadata.set(key, row);
    }
    for (const pair of config.pairs) {
      const row = authorized.get(mediaPair(pair.id, pair.email));
      if (!row) continue;
      const original = metadata.get(mediaPair(row.key, row.email));
      if (!original) continue;
      const asset = mediaAsset(original, metadata);
      const variants = [...new Set([asset.thumbnailKey, asset.previewKey])]
        .filter(key => key !== null && key !== asset.key)
        .map(key => mediaAsset(metadata.get(mediaPair(key, row.email)), metadata));
      // An owned local-only original may prove which independently authorized
      // remote variants belong to this artwork. It is never itself downloaded.
      if (asset.remoteReady || variants.length) result.items.push({ id: row.id, email: row.email, imageUrl: row.image_url, ownership: row.ownership, asset, variants });
    }
    return result;
  });
}
