import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";

// ── ComfyUI 端点与工作流(BYOC:用户自备算力端点) ─────────────────────────────

export type ComfyEndpointRow = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  isActive: boolean;
};

export async function listComfyEndpoints(email: string): Promise<ComfyEndpointRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, base_url, api_key, is_active
       FROM app_comfyui_endpoints
      WHERE email = $1
      ORDER BY is_active DESC, updated_at DESC`,
    [email.toLowerCase()]
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name),
    baseUrl: String(r.base_url),
    apiKey: String(r.api_key),
    isActive: Boolean(r.is_active),
  }));
}

export async function getActiveComfyEndpoint(email: string): Promise<ComfyEndpointRow | null> {
  const list = await listComfyEndpoints(email);
  return list.find((e) => e.isActive) ?? null;
}

/** 保存端点;activate=true 时取消其他端点的激活态(一人同时仅一个活动端点)。 */
export async function saveComfyEndpoint(
  email: string,
  input: { id?: string; name?: string; baseUrl: string; apiKey?: string; activate?: boolean }
): Promise<ComfyEndpointRow[]> {
  await ensureSchema();
  const lower = email.toLowerCase();
  const id = input.id?.trim() || crypto.randomUUID();
  const existing = input.id
    ? (await listComfyEndpoints(email)).find((e) => e.id === input.id)
    : null;
  if (input.id && !existing) throw new Error("端点不存在");
  const { rows: countRows } = await getPool().query(
    `SELECT count(*)::int AS n FROM app_comfyui_endpoints WHERE email = $1`,
    [lower]
  );
  if (!existing && Number(countRows[0]?.n ?? 0) >= 4) {
    throw new Error("最多保存 4 个端点，请先删除不用的");
  }
  const apiKey = input.apiKey?.trim() ?? existing?.apiKey ?? "";
  await getPool().query(
    `INSERT INTO app_comfyui_endpoints (id, email, name, base_url, api_key, is_active, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       base_url = EXCLUDED.base_url,
       api_key = EXCLUDED.api_key,
       is_active = EXCLUDED.is_active,
       updated_at = now()`,
    [
      id,
      lower,
      (input.name?.trim() || existing?.name || "ComfyUI").slice(0, 40),
      input.baseUrl.trim().slice(0, 300),
      apiKey.slice(0, 300),
      Boolean(input.activate ?? existing?.isActive ?? false),
    ]
  );
  if (input.activate) {
    await getPool().query(
      `UPDATE app_comfyui_endpoints SET is_active = false
        WHERE email = $1 AND id <> $2`,
      [lower, id]
    );
  }
  return listComfyEndpoints(email);
}

export async function deleteComfyEndpoint(email: string, id: string): Promise<ComfyEndpointRow[]> {
  await ensureSchema();
  await getPool().query(
    `DELETE FROM app_comfyui_endpoints WHERE email = $1 AND id = $2`,
    [email.toLowerCase(), id]
  );
  return listComfyEndpoints(email);
}

export type ComfyWorkflowRow = {
  id: string;
  name: string;
  inputs: unknown;
  required: unknown;
  note: string;
  isPublic: boolean;
  author: string;
  updatedAt: string;
};

export async function listComfyWorkflows(email: string): Promise<ComfyWorkflowRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, inputs, required, note, is_public, author, updated_at
       FROM app_comfyui_workflows
      WHERE email = $1
      ORDER BY updated_at DESC`,
    [email.toLowerCase()]
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name),
    inputs: r.inputs,
    required: r.required,
    note: String(r.note ?? ""),
    isPublic: Boolean(r.is_public),
    author: String(r.author ?? ""),
    updatedAt: new Date(r.updated_at as string).toISOString(),
  }));
}

export async function getComfyWorkflow(
  email: string,
  id: string
): Promise<(ComfyWorkflowRow & { apiJson: Record<string, unknown> }) | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, api_json, inputs, required, note, is_public, author, updated_at
       FROM app_comfyui_workflows
      WHERE email = $1 AND id = $2`,
    [email.toLowerCase(), id]
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    name: String(r.name),
    apiJson: (r.api_json ?? {}) as Record<string, unknown>,
    inputs: r.inputs,
    required: r.required,
    note: String(r.note ?? ""),
    isPublic: Boolean(r.is_public),
    author: String(r.author ?? ""),
    updatedAt: new Date(r.updated_at as string).toISOString(),
  };
}

export async function saveComfyWorkflow(
  email: string,
  input: { id?: string; name: string; apiJson: unknown; inputs: unknown; required: unknown; note?: string }
): Promise<ComfyWorkflowRow[]> {
  await ensureSchema();
  const lower = email.toLowerCase();
  const id = input.id?.trim() || crypto.randomUUID();
  const existing = input.id ? await getComfyWorkflow(email, input.id) : null;
  if (input.id && !existing) throw new Error("工作流不存在");
  const { rows: countRows } = await getPool().query(
    `SELECT count(*)::int AS n FROM app_comfyui_workflows WHERE email = $1`,
    [lower]
  );
  if (!existing && Number(countRows[0]?.n ?? 0) >= 30) {
    throw new Error("最多保存 30 个工作流，请先删除不用的");
  }
  await getPool().query(
    `INSERT INTO app_comfyui_workflows (id, email, name, api_json, inputs, required, note, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       api_json = EXCLUDED.api_json,
       inputs = EXCLUDED.inputs,
       required = EXCLUDED.required,
       note = EXCLUDED.note,
       updated_at = now()`,
    [
      id,
      lower,
      input.name.trim().slice(0, 60) || "未命名工作流",
      JSON.stringify(input.apiJson ?? {}),
      JSON.stringify(input.inputs ?? []),
      JSON.stringify(input.required ?? []),
      (input.note ?? "").slice(0, 500),
    ]
  );
  return listComfyWorkflows(email);
}

export async function deleteComfyWorkflow(email: string, id: string): Promise<ComfyWorkflowRow[]> {
  await ensureSchema();
  await getPool().query(
    `DELETE FROM app_comfyui_workflows WHERE email = $1 AND id = $2`,
    [email.toLowerCase(), id]
  );
  return listComfyWorkflows(email);
}

/** 发布/取消发布到公开市场;发布时记录展示名(邮箱本地部分)。 */
export async function publishComfyWorkflow(
  email: string,
  id: string,
  isPublic: boolean
): Promise<void> {
  await ensureSchema();
  const lower = email.toLowerCase();
  await getPool().query(
    `UPDATE app_comfyui_workflows
        SET is_public = $3,
            author = CASE WHEN $3 THEN $4 ELSE '' END,
            updated_at = now()
      WHERE email = $1 AND id = $2`,
    [lower, id, isPublic, lower.split("@")[0].slice(0, 24)]
  );
}

export type MarketWorkflowRow = {
  id: string;
  name: string;
  author: string;
  inputs: unknown;
  required: unknown;
  note: string;
  updatedAt: string;
};

/** 公开市场列表(不含自己的)。 */
export async function listPublicComfyWorkflows(email: string): Promise<MarketWorkflowRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, author, inputs, required, note, updated_at
       FROM app_comfyui_workflows
      WHERE is_public AND email <> $1
      ORDER BY updated_at DESC
      LIMIT 50`,
    [email.toLowerCase()]
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name),
    author: String(r.author ?? ""),
    inputs: r.inputs,
    required: r.required,
    note: String(r.note ?? ""),
    updatedAt: new Date(r.updated_at as string).toISOString(),
  }));
}

/** 从市场复制公开工作流到自己的库(深拷贝 api_json/inputs/required)。 */
export async function copyComfyWorkflow(email: string, id: string): Promise<string> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT name, author, api_json, inputs, required
       FROM app_comfyui_workflows
      WHERE id = $1 AND is_public`,
    [id]
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) throw new Error("工作流不存在或未公开");
  const newId = crypto.randomUUID();
  await getPool().query(
    `INSERT INTO app_comfyui_workflows (id, email, name, api_json, inputs, required, note, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
    [
      newId,
      email.toLowerCase(),
      `${String(r.name).slice(0, 50)}（市场导入）`,
      JSON.stringify(r.api_json ?? {}),
      JSON.stringify(r.inputs ?? []),
      JSON.stringify(r.required ?? []),
      `来自市场 · @${String(r.author ?? "")}`.slice(0, 500),
    ]
  );
  return newId;
}
