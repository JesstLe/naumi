import {ensureWorkflowImportSchema} from "@/lib/canvas/storage-schema";
export {ensureWorkflowImportSchema};
import "server-only";
import {createHash,randomUUID} from "node:crypto";
import sharp from "sharp";
import {z} from "zod";
import {getPool} from "@/platform/db/pool";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {type ArtworkRecord} from "@/lib/artworks/types";
import {type CanvasTextNodeRecord} from "@/lib/canvas/text-node-repository";


import {defaultNodeSettings,type CanvasNodeSettings} from "@/lib/canvas/node-settings";
import {readWorkflowClipboard,gaodingAssetUrl,WORKFLOW_CLIPBOARD_LIMIT,type ImportedElement,type ImportedManifest} from "@/lib/canvas/workflow-clipboard";
import {inertSvg,pathSvg} from "@/lib/canvas/workflow-vector";
import {fetchPublicImageBytes} from "@/lib/template-image-cache";
import {uploadImage,deleteImageByUrl} from "@/lib/storage";
import {editCanvasPixels} from "@/lib/canvas-local-image-edit";

export const workflowImportRequest = z.object({
  operationId: z.string().uuid(), html: z.string().min(1).max(WORKFLOW_CLIPBOARD_LIMIT),
  projectKey: z.string().min(1).max(200).nullable().default(null),
  x: z.number().finite().min(-1e6).max(1e6), y: z.number().finite().min(-1e6).max(1e6),
}).strict();
export type WorkflowImportResult = { operationId: string; projectKey: string; artworks: ArtworkRecord[]; textNodes: CanvasTextNodeRecord[];
  manifest: ImportedManifest; settings: Record<string, CanvasNodeSettings>; missingReferences: number };


export async function listWorkflowManifests(email: string) {
  await ensureWorkflowImportSchema();
  const { rows } = await getPool().query("SELECT result->'manifest' AS manifest FROM app_canvas_workflow_imports WHERE email=$1 ORDER BY created_at DESC LIMIT 1000", [email]);
  return rows.map(row => row.manifest as ImportedManifest);
}

/** Only server-downloaded, decoded pixels are persisted. Never hotlink, trust MIME, or execute SVG. */
export async function prepareWorkflowPixels(node: ImportedElement, scale: number): Promise<{ bytes: Buffer; width: number; height: number; missingAsset?: string }> {
  let bytes: Buffer;
  if (node.kind === "path") bytes = Buffer.from(pathSvg(node.path, node.width / scale, node.height / scale, node.fill, node.stroke, node.strokeWidth));
  else if (node.kind === "svg" && node.svg) bytes = Buffer.from(inertSvg(node.svg));
  else {
    if (!node.url) return workflowPlaceholder(node, "素材地址缺失");
    let downloaded: Awaited<ReturnType<typeof fetchPublicImageBytes>>;
    try { downloaded = await fetchPublicImageBytes(gaodingAssetUrl(node.url), { allowSvg: node.kind === "svg", validate: gaodingAssetUrl }); }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Network/access failures produce explicit placeholders. Unsafe URLs, oversized
      // resources and malicious SVG remain hard failures, never silently accepted.
      const status = /图片源返回 (\d{3})/.exec(message);
      if (status || /取图超时|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH/.test(message))
        return workflowPlaceholder(node, status ? `素材 HTTP ${status[1]}` : "素材连接失败");
      throw error;
    }
    bytes = downloaded.contentType === "image/svg+xml" ? Buffer.from(inertSvg(downloaded.bytes.toString("utf8"))) : downloaded.bytes;
  }
  let image = sharp(bytes, { limitInputPixels: 100000000 }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("图片素材无效");
  if (node.kind === "svg" || node.kind === "path") {
    // Rasterize vectors at canvas display density instead of enlarging a tiny PNG.
    const density = Math.max(1, Math.min(2304, 72 * Math.min(4096 / metadata.width,8192 / metadata.height,
      Math.max(node.width * 2 / metadata.width,node.height * 2 / metadata.height))));
    image = sharp(bytes,{density,limitInputPixels:100000000}).rotate();
  }
  const png = await image.resize({ width: 4096, height: 8192, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  if (png.data.length > 12 * 1024 * 1024) throw new Error("图片素材超过 12MB");
  return { bytes: png.data, width: png.info.width, height: png.info.height };
}

async function workflowPlaceholder(node: ImportedElement, missingAsset: string) {
  const ratio = node.width / node.height;
  const width = Math.max(1, Math.round(ratio >= 1 ? 320 : 320 * ratio));
  const height = Math.max(1, Math.round(ratio >= 1 ? 320 / ratio : 320));
  const bytes = await sharp({ create: { width, height, channels: 4, background: "#f1f5f9" } }).png().toBuffer();
  return { bytes, width, height, missingAsset };
}

export async function importCanvasWorkflow(email: string, input: z.infer<typeof workflowImportRequest>,
  options: { progress?: (done: number, total: number) => void; cancelled?: () => boolean;
    prepare?: typeof prepareWorkflowPixels } = {}): Promise<WorkflowImportResult> {
  const parsed = readWorkflowClipboard(input.html);
  if (!parsed) throw new Error("未识别到稿定工作流");
  const drawable = parsed.nodes.filter(n => n.kind === "image" || n.kind === "text");
  if (!drawable.length) throw new Error("工作流没有图片或文字节点");
  const assets = parsed.nodes.filter(n => n.kind !== "text");
  await ensureWorkflowImportSchema();
  const client = await getPool().connect(), uploaded: string[] = [];
  // Canonical field order: schema parsing and direct callers may order keys differently.
  const fingerprint = createHash("sha256").update(JSON.stringify([input.html, input.projectKey, input.x, input.y])).digest("hex");
  const check = () => { if (options.cancelled?.()) throw new Error("导入已取消"); };
  let committed = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [email]);
    check();
    const prior = await client.query("SELECT fingerprint,result FROM app_canvas_workflow_imports WHERE email=$1 AND operation_id=$2", [email, input.operationId]);
    if (prior.rows.length) {
      if (prior.rows[0].fingerprint !== fingerprint) throw new Error("导入编号已使用");
      const result = prior.rows[0].result as WorkflowImportResult;
      const imageIds = result.artworks.map(n => n.id), textIds = result.textNodes.map(n => n.id);
      const live = await client.query(`SELECT (SELECT count(*) FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL)
        +(SELECT count(*) FROM app_canvas_text_nodes WHERE email=$1 AND id=ANY($3::text[])) AS count`, [email, imageIds, textIds]);
      if (Number(live.rows[0].count) !== imageIds.length + textIds.length) throw new Error("这次导入已撤销或删除，请重新粘贴");
      // A late transport retry must not paint an old placeholder over a filled
      // node or revert subsequent edits/moves in the browser. Read current rows
      // on this transaction's connection (no extra pool connection while locked).
      const artworkRows = await client.query("SELECT * FROM app_artworks WHERE email=$1 AND id=ANY($2::text[])", [email,imageIds]);
      const textRows = await client.query("SELECT * FROM app_canvas_text_nodes WHERE email=$1 AND id=ANY($2::text[])", [email,textIds]);
      const artById = new Map(artworkRows.rows.map(row=>[row.id,row])),textById = new Map(textRows.rows.map(row=>[row.id,row]));
      result.artworks = result.artworks.map(node=>{const row=artById.get(node.id);return {...node,image:row.image_url,source:row.source_url,title:row.title,prompt:row.prompt,
        width:row.image_width,height:row.image_height,canvasWidth:row.canvas_width,canvasHeight:row.canvas_height,canvasX:row.canvas_x,canvasY:row.canvas_y,
        parentId:row.parent_id,parentIds:row.parent_ids,groupId:row.group_id,canvasGroupId:row.canvas_group_id};});
      result.textNodes = result.textNodes.map(node=>{const row=textById.get(node.id);return {...node,title:row.title,prompt:row.prompt,content:row.content,status:row.status,
        canvasX:row.canvas_x,canvasY:row.canvas_y,width:row.canvas_width,height:row.canvas_height,sourceIds:row.source_ids,targetIds:row.target_ids,productIds:row.product_ids,
        updatedAt:new Date(row.updated_at).toISOString()};});
      const currentSettings = await client.query("SELECT node_id,settings FROM app_canvas_node_settings WHERE email=$1 AND node_id=ANY($2::text[])",[email,[...imageIds,...textIds]]);
      for (const row of currentSettings.rows) result.settings[row.node_id] = row.settings;
      await client.query("COMMIT"); committed = true; return result;
    }
    const ids = new Map(parsed.nodes.map(n => [n.sourceId, `${n.kind === "text" ? "text" : "art"}-import-${randomUUID()}`]));
    const groupIds = new Map(parsed.groups.map(g => [g.sourceId, `import-group-${randomUUID()}`]));
    let root = ids.get(drawable.find(n => n.kind === "image")?.sourceId || drawable[0].sourceId)!;
    let projectKey = input.projectKey || `tree:${root}`;
    if (input.projectKey) {
      if (!input.projectKey.startsWith("tree:")) throw new Error("目标画布格式不正确");
      root = input.projectKey.slice(5);
      const owned = await client.query(`SELECT 1 FROM app_artworks WHERE email=$1 AND (group_id=$2 OR id=$2) AND deleted_at IS NULL
        UNION ALL SELECT 1 FROM app_canvas_text_nodes WHERE email=$1 AND project_key=$3 LIMIT 1`, [email, root, projectKey]);
      if (!owned.rows.length) throw new Error("目标画布不存在或无权访问");
    }
    const now = new Date().toISOString();
    const result: WorkflowImportResult = { operationId: input.operationId, projectKey, artworks: [], textNodes: [], settings: {}, missingReferences: parsed.missingReferences,
      manifest: { operationId: input.operationId, projectKey, source: "gaoding", version: parsed.version, groups: [], decorations: [], origins: [] } };
    const pixels = new Map<string, { image: string; width: number; height: number; missingAsset?: string }>();
    let next = 0, done = 0, bytes = 0, failed = false;
    options.progress?.(0, assets.length);
    const outcomes = await Promise.allSettled(Array.from({ length: Math.min(4, assets.length) }, async () => {
      while (next < assets.length && !failed) {
        const n = assets[next++];
        try {
          check();
          const image = await (options.prepare || prepareWorkflowPixels)(n, parsed.scale);
          bytes += image.bytes.length;
          if (bytes > 96 * 1024 * 1024) throw new Error("工作流素材超过 96MB，请分批复制");
          check();
          const url = await uploadImage(image.bytes, "image/png", `canvas-imports/${input.operationId}/${ids.get(n.sourceId)}.png`);
          uploaded.push(url); pixels.set(n.sourceId, { image: url, width: image.width, height: image.height, missingAsset: image.missingAsset });
          options.progress?.(++done, assets.length); check();
        } catch (error) { failed = true; throw error; }
      }
    }));
    const failure = outcomes.find((o): o is PromiseRejectedResult => o.status === "rejected");
    if (failure) throw failure.reason;
    check();
    for (const n of parsed.nodes) {
      const id = ids.get(n.sourceId)!, groups = n.groupIds.map(g => groupIds.get(g)!);
      const x = input.x + n.x, y = input.y + n.y;
      if (n.kind === "svg" || n.kind === "path") {
        result.manifest.decorations.push({ id, image: pixels.get(n.sourceId)!.image, x, y, width: n.width, height: n.height, rotation: n.rotation, flipX: n.flipX, opacity: n.opacity, groups });
      }
      const settings = { ...defaultNodeSettings(), order: result.artworks.length + result.textNodes.length, text: n.textStyle };
      result.settings[id] = settings;
      result.manifest.origins.push({ id, sourceId: n.sourceId, groups, modelLabel: n.modelLabel, parameters: n.parameters, rotation: n.rotation, flipX: n.flipX, opacity: n.opacity,
        ...(pixels.get(n.sourceId)?.missingAsset ? { missingAsset: pixels.get(n.sourceId)!.missingAsset } : {}), sourceWidth: n.width / parsed.scale, sourceHeight: n.height / parsed.scale });
      const previous = parsed.edges.filter(e => e.target === n.sourceId).map(e => e.source);
      const leafKind = (source: string) => parsed.nodes.find(node => node.sourceId === source)?.kind;
      if (n.kind === "text") {
        result.textNodes.push({ id, projectKey, title: n.title, content: n.content, prompt: n.prompt, status: "completed", canvasX: x, canvasY: y,
          width: n.width, height: n.height, createdAt: now, updatedAt: now, sourceIds: previous.filter(p => ["text", "image"].includes(leafKind(p)!)).map(p => ids.get(p)!),
          targetIds: parsed.edges.filter(e => e.source === n.sourceId && leafKind(e.target) === "image").map(e => ids.get(e.target)!), productIds: [] });
      } else {
        const parents = previous.filter(p => leafKind(p) === "image").map(p => ids.get(p)!);
        const pixelsForNode = pixels.get(n.sourceId)!;
        result.artworks.push({ id, title: n.title, category: "main", prompt: n.prompt, status: "completed", image: pixelsForNode.image,
          gradient: "from-slate-100 to-slate-50", parentId: parents[0] || null, parentIds: parents.slice(1), groupId: root,
          canvasGroupId: groups[0] || null, source: pixelsForNode.missingAsset ? "workflow-placeholder" : n.kind === "image" ? "workflow-import" : "workflow-decoration", origin: "canvas", canvasX: x, canvasY: y,
          width: pixelsForNode.width, height: pixelsForNode.height, canvasWidth: n.width, canvasHeight: n.height, createdAt: now,
          creationProvenance: { version: 1, operation: "import", entry: "canvas", ref: input.operationId, evidence: "server-route" } });
      }
    }
    for (const group of parsed.groups) result.manifest.groups.push({ id: groupIds.get(group.sourceId)!, title: group.title, members: group.members.map(source => ids.get(source)!).filter(Boolean) });
    for (const n of result.artworks) await client.query(`INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,created_at,parent_id,parent_ids,
      group_id,canvas_group_id,source_url,origin,canvas_x,canvas_y,image_width,image_height,canvas_width,canvas_height,creation_provenance)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb)`,
      [n.id,email,n.title,n.category,n.prompt,n.status,n.image,n.gradient,now,n.parentId,JSON.stringify(n.parentIds),root,n.canvasGroupId,n.source,n.origin,n.canvasX,n.canvasY,n.width,n.height,n.canvasWidth,n.canvasHeight,JSON.stringify(n.creationProvenance)]);
    for (const n of result.textNodes) await client.query(`INSERT INTO app_canvas_text_nodes(id,email,project_key,title,prompt,content,status,canvas_x,canvas_y,canvas_width,canvas_height,created_at,updated_at,source_ids,target_ids,product_ids)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13::jsonb,$14::jsonb,'[]'::jsonb)`,
      [n.id,email,projectKey,n.title,n.prompt,n.content,n.status,n.canvasX,n.canvasY,n.width,n.height,now,JSON.stringify(n.sourceIds),JSON.stringify(n.targetIds)]);
    for (const [id, settings] of Object.entries(result.settings)) await client.query("INSERT INTO app_canvas_node_settings(email,node_id,kind,settings) VALUES($1,$2,$3,$4::jsonb)", [email,id,id.startsWith("text-") ? "text" : "image",JSON.stringify(settings)]);
    await client.query("INSERT INTO app_canvas_workflow_imports(email,operation_id,fingerprint,project_key,result) VALUES($1,$2,$3,$4,$5::jsonb)", [email,input.operationId,fingerprint,projectKey,JSON.stringify(result)]);
    check();
    await client.query("COMMIT"); committed = true;
    return result;
  } catch (error) {
    if (!committed) { await client.query("ROLLBACK"); await Promise.allSettled(uploaded.map(deleteImageByUrl)); }
    throw error;
  } finally { client.release(); }
}

/** Fill an imported placeholder in place. Identity, layout and every relation stay intact.
 * Both pixel versions remain stored; history can swap only these owner-bound snapshots. */
export async function fillWorkflowAsset(email: string, id: string, operationId: string, bytes: Buffer) {
  z.string().uuid().parse(operationId);
  if (!id || id.length > 200) throw new Error("节点编号不正确");
  await ensureWorkflowImportSchema();
  const fingerprint = createHash("sha256").update(id).update(bytes).digest("hex");
  const client = await getPool().connect(); let uploaded: string | null = null, committed = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [email]);
    const prior = await client.query("SELECT fingerprint,node_id FROM app_canvas_workflow_asset_ops WHERE email=$1 AND id=$2", [email, operationId]);
    if (prior.rows.length) {
      if (prior.rows[0].fingerprint !== fingerprint) throw new Error("补图编号已使用");
    } else {
      const { rows } = await client.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE", [email, id]);
      const row = rows[0];
      if (!row || row.source_url !== "workflow-placeholder") throw new Error("待补图片不存在或无权访问");
      const locked = await client.query("SELECT settings->>'locked' AS locked FROM app_canvas_node_settings WHERE email=$1 AND node_id=$2", [email,id]);
      if (locked.rows[0]?.locked === "true") throw new Error("请先解锁节点");
      const pixels = await editCanvasPixels(bytes);
      if (pixels.bytes.length > 12*1024*1024) throw new Error("图片超过12MB");
      uploaded = await uploadImage(pixels.bytes,"image/png",`canvas-import-fills/${operationId}/${id}.png`);
      const origin = await client.query("SELECT result->'manifest'->'decorations' AS decorations FROM app_canvas_workflow_imports WHERE email=$1 AND operation_id=$2", [email, row.creation_provenance.ref]);
      const decoration = (origin.rows[0]?.decorations || []).some((d: { id: string }) => d.id === id);
      const before = { image: row.image_url, source: row.source_url, width: row.image_width, height: row.image_height };
      const after = { image: uploaded, source: decoration ? "workflow-decoration" : "workflow-import", width: pixels.width, height: pixels.height };
      await client.query("UPDATE app_artworks SET image_url=$3,source_url=$4,image_width=$5,image_height=$6 WHERE email=$1 AND id=$2", [email,id,after.image,after.source,after.width,after.height]);
      await client.query("INSERT INTO app_canvas_workflow_asset_ops(email,id,node_id,fingerprint,before_asset,after_asset) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)", [email,operationId,id,fingerprint,JSON.stringify(before),JSON.stringify(after)]);
    }
    await client.query("COMMIT"); committed = true;
    const node = (await listArtworksByIds(email, [id]))[0];
    if (!node) throw new Error("节点已删除，请刷新画布");
    return { node, assetOperationId: operationId };
  } catch (error) { if (!committed) { await client.query("ROLLBACK"); if (uploaded) await deleteImageByUrl(uploaded).catch(() => { console.warn("STORAGE_CLEANUP_PENDING operation=workflow-import"); }); } throw error; }
  finally { client.release(); }
}
