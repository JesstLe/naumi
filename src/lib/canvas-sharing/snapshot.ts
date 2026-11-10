import "server-only";
import type { PoolClient } from "pg";
import type { CanvasShareSource } from "../collaboration/contracts";
import { z } from "zod";
import { videoNodeConfigSchema } from "../canvas/video-node-schema";
import { orderedInputSchema } from "../video/references";
import { directorProjectSchema } from "../director/project";
import { characterProjectSchema } from "../character/project";
import { sceneProjectSchema } from "../scene/project";
import { audioProjectSchema } from "../audio/project";
import { timelineProjectSchema } from "../timeline/project";
import { timelineAdoptedSchema } from "../canvas/timeline-node-schema";
import { imagePromptDocumentSchema, type ImagePromptDocument } from "../canvas/image-prompt-schema";
import { nodeSettingsSchema } from "../canvas/node-settings";
import { storageKeyFromManagedUrl } from "../storage";
import type { MediaProbe } from "../video/media-job-schema";
import { fail, fingerprint, shareSourceSchema } from "./domain";

type Row = Record<string, any>;
export const nodeTables = {
  artwork: "app_artworks", text: "app_canvas_text_nodes", video: "app_canvas_video_nodes", director: "app_canvas_director_nodes",
  character: "app_canvas_character_nodes", scene: "app_canvas_scene_nodes", audio: "app_canvas_audio_nodes", timeline: "app_canvas_timeline_nodes",
} as const;
export type NodeKind = keyof typeof nodeTables;
export type FrozenNode = { id: string; kind: NodeKind; data: Row; stamp: string; settings?: Row; imagePrompt?: ImagePromptDocument; versions?: Array<{ id: string; asset: Row }> };
export type FrozenMedia = { key: string; sha256: string; bytes: number; mime: string; probe?: MediaProbe };
export type ShareSnapshot = { format: 1; source: CanvasShareSource; title: string; nodes: FrozenNode[]; media: FrozenMedia[]; digest: string };
const selectedFields = (row: Row, keys: string[]) => Object.fromEntries(keys.map(k => [k, row[k] ?? null]));
const finite = (v: unknown, fallback: number) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
const ids = (v: unknown) => z.array(z.string().min(1).max(160)).max(1000).parse(v ?? []);

/** Execution authority is never portable. Arbitrary provider dictionaries are accepted only as inert parameters. */
function assertInert(value: unknown, depth = 0) {
  if (depth > 40) fail("SHARE_UNSUPPORTED_CONTENT", "内容嵌套过深", 422);
  if (Array.isArray(value)) { for (const item of value) assertInert(item, depth + 1); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    // Token budgets are scalar generation parameters, not bearer credentials.
    const tokenBudget = /^(?:max_tokens|max_output_tokens|max_completion_tokens|min_tokens|token_limit|token_budget)$/.test(normalized)
      && typeof item === "number" && Number.isSafeInteger(item) && item >= 0;
    if (!tokenBudget && /(?:^|_)(?:tokens?|access_?token|refresh_?token|secret|password|credentials?|authorization|api_?key|nonce|quote|operation_?id|task_?id|job_?id)(?:_|$)/.test(normalized))
      fail("SHARE_UNSUPPORTED_AUTHORITY", "内容含有不可转移的执行配置，请移除后分享", 422);
    assertInert(item, depth + 1);
  }
}
function prepareNode(kind: NodeKind, row: Row): FrozenNode {
  let data: Row;
  if (kind === "artwork") {
    data = selectedFields(row, ["title", "category", "prompt", "image_url", "video_url", "gradient", "style", "ratio", "resolution", "image_width", "image_height",
      "canvas_x", "canvas_y", "canvas_width", "canvas_height", "canvas_group_id"]);
    data.parent_ids = ids(row.parent_ids); data.parent_id = row.source_url === "canvas-add" && !data.parent_ids.includes(row.parent_id) ? null : row.parent_id || null;
    data.source_marker = ["canvas-add", "canvas-node-version"].includes(row.source_url) ? row.source_url : null;
    data.canvas_image_version = row.canvas_image_version ? z.strictObject({ id: z.string(), image: z.string(), prompt: z.string(), width: z.number().nullable(), height: z.number().nullable(), ratio: z.string().nullable(), resolution: z.string().nullable(), style: z.string().nullable() }).parse(row.canvas_image_version) : null;
    if (!data.image_url && !data.video_url && !["pending", "generating", "error", "failed"].includes(row.status)) fail("SHARE_MEDIA_UNAVAILABLE", "作品素材不存在", 422);
    data.status = data.image_url || data.video_url ? "completed" : "idle";
  } else if (kind === "text") {
    data = selectedFields(row, ["title", "prompt", "content", "canvas_x", "canvas_y", "canvas_width", "canvas_height"]);
    data.source_ids = ids(row.source_ids); data.target_ids = ids(row.target_ids); data.product_ids = ids(row.product_ids);
    data.status = data.content ? "completed" : "idle";
  } else {
    data = { title: String(row.title), x: finite(row.x, 0), y: finite(row.y, 0), width: finite(row.width, 384), height: finite(row.height, 280) };
    switch (kind) {
      case "video": {
        const config = videoNodeConfigSchema.strict().parse(row.config);
        if (config.workflowTaskId || config.comfyWorkflowId || config.workflowManifest || config.comfyInputs || config.comfyOverrides)
          fail("SHARE_UNSUPPORTED_WORKFLOW", "私有执行工作流须先转换为原生节点后分享", 422);
        assertInert(config); data.config = config; data.inputs = z.array(orderedInputSchema).max(256).parse(row.inputs);
        data.result_id = row.display_result_id || row.last_result_id || null; break;
      }
      case "director": data.project = directorProjectSchema.parse(row.project); data.outputs = z.array(z.strictObject({ artworkId: z.string(), kind: z.enum(["image", "video"]) })).parse(row.outputs); break;
      case "character": data.character = characterProjectSchema.parse(row.character); break;
      case "scene": data.scene = sceneProjectSchema.parse(row.scene); break;
      case "audio": {
        const audio = audioProjectSchema.parse(row.audio);
        // Preserve completed output as an independent artwork, never another user's media-job receipt.
        data.completed_artwork = audio.adopted?.artworkId ?? null;
        data.audio = { version: 1, sourceArtworkId: audio.sourceArtworkId, edit: audio.edit, adopted: audio.adopted && !audio.adopted.jobId ? audio.adopted : null, render: null };
        break;
      }
      case "timeline": data.timeline = timelineProjectSchema.parse(row.timeline); data.completed_artwork = row.adopted ? timelineAdoptedSchema.parse(row.adopted).artworkId : null; break;
    }
  }
  return { id: String(row.id), kind, data, stamp: fingerprint(row) };
}

export function parseReference(value: string): { id: string; prefix: string; suffix: string; inline?: boolean } {
  if (value.startsWith("inline:")) {
    // Frozen text remains frozen text, never rebound to today's possibly edited/deleted asset.
    return { id: value.slice(7), prefix: "inline:", suffix: "", inline: true };
  }
  const prefix = value.match(/^(?:text|image|video|audio|audio-node|timeline-node|character|scene):/)?.[0] || "";
  const body = value.slice(prefix.length), hash = /^(?:character|scene):$/.test(prefix) ? body.lastIndexOf("#") : -1;
  return { id: hash < 0 ? body : body.slice(0, hash), prefix, suffix: hash < 0 ? "" : body.slice(hash) };
}
export function dependencies(node: FrozenNode): string[] {
  const d = node.data, out: string[] = [], add = (v: unknown) => { if (typeof v === "string" && v) { const p = parseReference(v); if (!p.inline) out.push(p.id); } };
  switch (node.kind) {
    case "artwork": add(d.parent_id); for (const id of d.parent_ids) add(id); break;
    case "text": for (const id of [...d.source_ids, ...d.product_ids]) add(id); break;
    case "video":
      for (const r of [...(d.config.references || []), ...(d.config.elements || []).flatMap((e: Row) => e.references)]) add(r.artworkId);
      for (const s of d.config.shots || []) add(s.textNodeId);
      for (const r of d.inputs) add(r.nodeId); add(d.result_id); break;
    case "director": add(d.project.panoramaArtworkId); for (const id of d.project.sceneReference?.referenceArtworkIds || []) add(id); for (const r of d.outputs) add(r.artworkId); break;
    case "character": for (const a of d.character.appearances) for (const id of a.referenceArtworkIds) add(id); break;
    case "scene": for (const s of d.scene.states) for (const id of s.referenceArtworkIds) add(id); break;
    case "audio": add(d.audio.sourceArtworkId); add(d.completed_artwork); break;
    // canvasSourceId is provenance, not the material consumed by native editing.
    case "timeline": for (const t of d.timeline.tracks) for (const c of t.clips) add(c.artworkId); add(d.completed_artwork); break;
  }
  if(node.imagePrompt)out.push(...node.imagePrompt.activeKeys.map(key=>key.slice(5)));
  return [...new Set(out)];
}
/** Verify all three namespaces: the project, each object, and each underlying storage object. */
async function assertCreationBoundary(tx: PoolClient, author: string, enterpriseId: string, projectKey: string | string[], nodeIds: string[]) {
  const projectKeys = typeof projectKey === "string" ? [projectKey] : projectKey;
  const contexts = (await tx.query(`SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND
    ((context_kind='project' AND context_id=ANY($2::text[])) OR (context_kind='media' AND context_id=ANY($3::text[]))) FOR SHARE`, [author, projectKeys, nodeIds])).rows;
  if (contexts.some(r => r.scope_kind === "legacy_unconfirmed" || r.tenant_id && r.tenant_id !== enterpriseId)) fail("SHARE_TENANT_MISMATCH", "所选内容不属于当前企业空间", 403);
  const foreign = (await tx.query(`SELECT 1 FROM app_creation_links l JOIN app_creation_records c ON c.id=l.creation_id
    WHERE l.target_id=ANY($1::text[]) AND l.target_type IN ('artwork','text-node','video-node','director-node','character-node','scene-node','audio-node','timeline-node') AND l.relation='output'
    AND (c.actor_email<>$2 OR c.scope_kind='legacy_unconfirmed' OR c.tenant_id IS NOT NULL AND c.tenant_id<>$3::uuid) LIMIT 1`, [nodeIds, author, enterpriseId])).rowCount;
  if (foreign) fail("SHARE_TENANT_MISMATCH", "所选内容的创作归属不一致", 403);
}
/** Project aliases are selectors, never evidence of ownership. Resolve physical
 * grouping/legacy ancestry, including suite batches, before consulting contexts.
 * Source rows are locked again after the recursive read; graph changes fail rather
 * than using a stale canonical identity in either approval phase.
 */
async function artworkProjectKeysTx(tx: PoolClient, author: string, row: Row): Promise<string[]> {
  const chain = (await tx.query(`WITH RECURSIVE ancestry AS (
    SELECT id,parent_id,group_id,batch_id,ARRAY[id] AS seen,0 AS depth FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL
    UNION ALL SELECT p.id,p.parent_id,p.group_id,p.batch_id,a.seen||p.id,a.depth+1
      FROM ancestry a JOIN app_artworks p ON p.id=a.parent_id AND p.email=$1 AND p.deleted_at IS NULL
      WHERE a.depth<200 AND NOT p.id=ANY(a.seen)
    ) SELECT * FROM ancestry ORDER BY depth`, [author, row.id])).rows;
  if (!chain.length) fail("SHARE_SOURCE_CHANGED", "源作品已改变，请重新确认后批准");
  const last = chain[chain.length - 1];
  if (last.parent_id && (last.depth >= 200 || last.seen.includes(last.parent_id))) fail("SHARE_AMBIGUOUS_PROJECT", "作品项目关系异常，请先整理后分享", 422);
  const locked = (await tx.query(`SELECT id,parent_id,group_id,batch_id FROM app_artworks
    WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL ORDER BY id FOR SHARE`, [author, chain.map(r => r.id)])).rows;
  const byId = new Map(locked.map(r => [r.id, r]));
  if (chain.some(r => { const current = byId.get(r.id); return !current || ["parent_id", "group_id", "batch_id"].some(k => current[k] !== r[k]); }))
    fail("SHARE_SOURCE_CHANGED", "源作品项目已改变，请重新确认后批准");
  const keys = new Set<string>([`tree:${row.group_id || last.id}`]);
  // Every physically recorded group/suite is authority evidence; a missing alias
  // context must not hide an existing foreign tenant assignment.
  for (const item of chain) {
    if (item.group_id) keys.add(`tree:${item.group_id}`);
    if (typeof item.batch_id === "string" && item.batch_id.startsWith("suite-")) keys.add(`batch:${item.batch_id}`);
  }
  return [...keys];
}
export function mediaUrls(node: FrozenNode): string[] {
  const d = node.data, urls: string[] = [], add = (v: unknown) => { if (typeof v === "string" && v) urls.push(v); };
  if (node.kind === "artwork") { add(d.image_url); add(d.video_url); add(d.canvas_image_version?.image); for (const v of node.versions || []) add(v.asset.image); }
  if (node.kind === "video") {
    for (const r of [...(d.config.references || []), ...(d.config.elements || []).flatMap((e: Row) => e.references)]) { add(r.url); if (r.storageKey) add(`/media/${r.storageKey}`); }
    for (const r of d.inputs) if (r.kind !== "text") add(r.value);
  }
  return urls;
}

export async function captureShareSnapshotTx(tx: PoolClient, author: string, enterpriseId: string, raw: CanvasShareSource): Promise<ShareSnapshot> {
  const source = shareSourceSchema.parse(raw), at = source.projectKey.indexOf(":"), kind = source.projectKey.slice(0, at), root = source.projectKey.slice(at + 1);
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [author]);
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`video-node-graph:${author}`]);
  const project = (await tx.query("SELECT deleted_at FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2 FOR SHARE", [author, source.projectKey])).rows[0];
  if (project?.deleted_at) fail("SHARE_SOURCE_UNAVAILABLE", "源画布已删除", 404);
  const all = new Map<string, FrozenNode>();
  // One statement gives all eight tables a single MVCC snapshot, including legacy text writes that lack graph locks.
  // Selected rows are then locked and compared below. New nodes after this statement are not part of this frozen version.
  const union = Object.entries(nodeTables).map(([nodeKind, table]) => `SELECT '${nodeKind}' AS kind,to_jsonb(n) AS data FROM
    (SELECT * FROM ${table} WHERE email=$1 AND ${nodeKind === "artwork" ? "deleted_at IS NULL AND (($2='tree' AND (group_id=$3 OR id=$3)) OR ($2='batch' AND batch_id=$3))" : `project_key=$4 ${nodeKind === "text" ? "" : "AND deleted_at IS NULL"}`} ORDER BY id LIMIT 1001) n`).join(" UNION ALL ");
  const physical = (await tx.query(union, [author, kind, root, source.projectKey])).rows, counts = new Map<string, number>();
  for (const item of physical) {
    const nodeKind = item.kind as NodeKind, row = item.data;
    counts.set(nodeKind, (counts.get(nodeKind) || 0) + 1);
    if (counts.get(nodeKind)! > 1000) fail("SHARE_TOO_LARGE", "画布过大，请分批选择节点分享", 413);
    if (all.has(row.id)) fail("SHARE_AMBIGUOUS_ID", "节点身份不唯一", 422);
    all.set(row.id, { id: row.id, kind: nodeKind, data: row, stamp: "" });
  }
  // Comfy documents retain raw custom-node JSON; the media-oriented sharing
  // contract must not silently omit them from mixed projects. JSON export is
  // available on the native group until a document snapshot contract is added.
  if(source.kind==="workflow"&&(await tx.query("SELECT to_regclass('app_canvas_comfy_nodes') AS present")).rows[0].present){
    const comfies=(await tx.query("SELECT id FROM app_canvas_comfy_nodes WHERE email=$1 AND project_key=$2 AND deleted_at IS NULL",[author,source.projectKey])).rows;
    if(comfies.some(node=>!source.nodeIds||source.nodeIds.includes(node.id)))fail("SHARE_COMFY_DOCUMENT","请通过工作流分组的导出按钮分享完整 JSON",422);
  }
  if (!all.size) fail("SHARE_SOURCE_UNAVAILABLE", "源画布不存在或无权访问", 404);
  const pending = [...(source.nodeIds || all.keys())], nodes = new Map<string, FrozenNode>();
  if (source.kind === "artwork" && all.get(pending[0])?.kind !== "artwork") fail("SHARE_NOT_ARTWORK", "请选择一项作品", 422);
  while (pending.length) {
    const id = pending.shift()!; if (nodes.has(id)) continue;
    let rawNode = all.get(id);
    if (!rawNode) {
      // Only directly referenced, owned artwork dependencies may live outside the selected canvas.
      const row = (await tx.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE", [author, id])).rows[0];
      if (!row || source.nodeIds?.includes(id)) fail("SHARE_DEPENDENCY_UNAVAILABLE", "所选节点或依赖不可用，请将依赖加入当前画布", 422);
      rawNode = { id, kind: "artwork", data: row, stamp: "" };
    }
    if (all.has(id)) {
      const locked = (await tx.query(`SELECT to_jsonb(n) AS data FROM ${nodeTables[rawNode.kind]} n WHERE email=$1 AND id=$2 FOR SHARE`, [author, id])).rows[0]?.data;
      if (!locked || fingerprint(locked) !== fingerprint(rawNode.data)) fail("SHARE_SOURCE_CHANGED", "源内容已改变，请重新确认后批准");
    }
    if (rawNode.kind === "artwork") await assertCreationBoundary(tx, author, enterpriseId, await artworkProjectKeysTx(tx, author, rawNode.data), [id]);
    const node = prepareNode(rawNode.kind, rawNode.data);
    if(node.kind==="artwork"){
      const saved=(await tx.query("SELECT document,scope_kind,tenant_id FROM app_canvas_image_prompts WHERE email=$1 AND node_id=$2 FOR SHARE",[author,id])).rows[0];
      if(saved){
        if(saved.scope_kind!=="tenant"||saved.tenant_id!==enterpriseId)fail("SHARE_TENANT_MISMATCH","提示词不属于当前企业空间",403);
        node.imagePrompt=imagePromptDocumentSchema.parse(saved.document);
      }
    }
    if (source.kind === "artwork") { node.data.parent_id = null; node.data.parent_ids = []; }
    if (node.kind === "artwork") {
      if ((source.kind === "artwork" || source.nodeIds?.includes(id)) && node.data.source_marker === "canvas-node-version") node.data.source_marker = null;
      const versions = (await tx.query("SELECT version_id,asset FROM app_canvas_image_versions WHERE email=$1 AND node_id=$2 ORDER BY created_at,version_id LIMIT 201 FOR SHARE", [author, id])).rows;
      if (versions.length > 200) fail("SHARE_TOO_MANY_VERSIONS", "图片历史版本过多，请先整理后分享", 413);
      node.versions = versions.map(v => ({ id: String(v.version_id), asset: z.strictObject({ image: z.string(), prompt: z.string(), width: z.number().nullable(), height: z.number().nullable(), ratio: z.string().nullable(), resolution: z.string().nullable(), style: z.string().nullable() }).parse(v.asset) }));
      if (node.data.canvas_image_version && !node.versions.some(v => v.id === node.data.canvas_image_version.id)) fail("SHARE_VERSION_UNAVAILABLE", "图片当前版本缺少历史快照", 422);
    }
    const settings = (await tx.query("SELECT settings FROM app_canvas_node_settings WHERE email=$1 AND node_id=$2 FOR SHARE", [author, id])).rows[0];
    if (settings) node.settings = nodeSettingsSchema.parse(settings.settings);
    nodes.set(id, node); if (nodes.size > 200) fail("SHARE_TOO_LARGE", "所选内容及依赖超过 200 个节点", 413);
    if (source.kind === "workflow") pending.push(...dependencies(node));
    else if(node.imagePrompt)pending.push(...node.imagePrompt.activeKeys.map(key=>key.slice(5)));
  }
  await assertCreationBoundary(tx, author, enterpriseId, source.projectKey, [...nodes.keys()]);
  // Imported decorations have their own graph/layout contract; rejecting is preferable to silently dropping them.
  if ((await tx.query("SELECT to_regclass('app_canvas_workflow_imports') AS present")).rows[0].present) {
    const imported = (await tx.query("SELECT result->'manifest' AS manifest FROM app_canvas_workflow_imports WHERE email=$1 AND result->'manifest'->>'projectKey'=$2", [author, source.projectKey])).rows;
    if (imported.some(r => !source.nodeIds || [...(r.manifest.origins || []), ...(r.manifest.decorations || [])].some((n: Row) => nodes.has(n.id))))
      fail("SHARE_UNSUPPORTED_WORKFLOW", "含导入装饰或变换的画布须先转换为原生节点后分享", 422);
  }
  const media = new Map<string, FrozenMedia>();
  for (const node of nodes.values()) for (const url of mediaUrls(node)) {
    const key = storageKeyFromManagedUrl(url);
    if (!key || /^(?:image-job-results|collaboration)\//i.test(key)) fail("SHARE_UNMANAGED_MEDIA", "请将外部素材保存为当前账号的原生作品后分享", 422);
    if (media.has(key)) continue;
    const asset = (await tx.query("SELECT owner,public,sha256,bytes,content_type FROM app_media_assets WHERE key=$1 FOR SHARE", [key])).rows[0];
    if (!asset || asset.owner !== author && !asset.public) fail("SHARE_MEDIA_FORBIDDEN", "素材不属于分享作者", 403);
    if (!/^(?:image\/(?:png|jpeg|webp|avif|gif)|video\/(?:mp4|webm|quicktime)|audio\/[a-z0-9.+-]+)$/.test(asset.content_type)) fail("SHARE_MEDIA_TYPE", "素材格式尚未适配分享", 422);
    await assertCreationBoundary(tx, author, enterpriseId, source.projectKey, [`/media/${key}`, key]);
    const probe = (await tx.query("SELECT probe FROM app_video_media_probes WHERE storage_key=$1 AND sha256=$2 AND decoder_version=1 FOR SHARE", [key, asset.sha256])).rows[0]?.probe as MediaProbe | undefined;
    // Decoder evidence is byte identity, not a job/nonce or execution grant. Preserve it for immediate native editing.
    if (!probe && /^(?:audio|video)\//.test(asset.content_type)) fail("SHARE_MEDIA_INSPECTION_REQUIRED", "音视频素材须先完成原生媒体解码检查", 422);
    media.set(key, { key, sha256: asset.sha256, bytes: Number(asset.bytes), mime: asset.content_type, ...(probe ? { probe } : {}) });
  }
  const name = (await tx.query("SELECT name FROM app_project_names WHERE email=$1 AND key=$2", [author, source.projectKey])).rows[0]?.name;
  const title = source.kind === "artwork" ? String(nodes.values().next().value!.data.title || "作品") : String(name || "画布");
  const content = { format: 1 as const, source, title: title.slice(0, 200), nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)), media: [...media.values()].sort((a, b) => a.key.localeCompare(b.key)) };
  if (Buffer.byteLength(JSON.stringify(content)) > 8 * 1024 * 1024) fail("SHARE_TOO_LARGE", "分享快照超过 8 MiB", 413);
  return { ...content, digest: fingerprint(content) };
}
