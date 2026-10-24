import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {canvasParentCycle,changeCanvasParent} from "./parent-link";

// 画布用:记住某作品在画布上被手动拖到的坐标(email 限定)。
export async function setArtworkPosition(
  emailRaw: string,
  id: string,
  x: number,
  y: number
): Promise<boolean> {
  await ensureSchema();
  if (!id || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const result = await getPool().query(
    `UPDATE app_artworks SET canvas_x = $3, canvas_y = $4 WHERE email = $1 AND id = $2`,
    [emailRaw.toLowerCase(), id, x, y]
  );
  return (result.rowCount ?? 0) > 0;
}

// 画布用：保存图片节点的显示尺寸与位置，不修改原图真实像素。
export async function setArtworkCanvasLayout(
  emailRaw: string,
  id: string,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<boolean> {
  await ensureSchema();
  const px = Number(x);
  const py = Number(y);
  const w = Math.round(width);
  const h = Math.round(height);
  if (
    !id ||
    !Number.isFinite(px) ||
    !Number.isFinite(py) ||
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w < 80 ||
    h < 80 ||
    w > 4096 ||
    h > 4096
  ) return false;
  const result = await getPool().query(
    `UPDATE app_artworks
        SET canvas_x = $3, canvas_y = $4, canvas_width = $5, canvas_height = $6
      WHERE email = $1 AND id = $2 AND deleted_at IS NULL`,
    [emailRaw.toLowerCase(), id, px, py, w, h]
  );
  return (result.rowCount ?? 0) > 0;
}

// 自动比例修复只更新显示尺寸，保留 NULL 坐标，让未手动拖动的节点继续参与自动布局。
export async function setArtworkCanvasSize(
  emailRaw: string,
  id: string,
  width: number,
  height: number
): Promise<boolean> {
  await ensureSchema();
  const w = Math.round(width);
  const h = Math.round(height);
  if (
    !id ||
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w < 80 ||
    h < 80 ||
    w > 4096 ||
    h > 4096
  ) return false;
  const result = await getPool().query(
    `UPDATE app_artworks
        SET canvas_width = $3, canvas_height = $4
      WHERE email = $1 AND id = $2 AND deleted_at IS NULL`,
    [emailRaw.toLowerCase(), id, w, h]
  );
  return (result.rowCount ?? 0) > 0;
}

// 画布用:标记/取消标记某个重要节点(email 限定)。
export async function setArtworkMarked(
  emailRaw: string,
  id: string,
  marked: boolean
): Promise<boolean> {
  await ensureSchema();
  if (!id) return false;
  const result = await getPool().query(
    `UPDATE app_artworks SET marked = $3 WHERE email = $1 AND id = $2 AND deleted_at IS NULL`,
    [emailRaw.toLowerCase(), id, marked]
  );
  return (result.rowCount ?? 0) > 0;
}

export type CanvasGroupAssignment = {
  id: string;
  canvasGroupId: string | null;
};

// 画布成组/解组。canvas_group_id 只表达编辑关系，不改变项目 group_id、父子血缘或连线。
export async function setArtworkCanvasGroups(
  emailRaw: string,
  assignmentsRaw: CanvasGroupAssignment[]
): Promise<CanvasGroupAssignment[]> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  const assignments = Array.from(
    new Map(
      assignmentsRaw
        .filter((item) => item?.id)
        .slice(0, 200)
        .map((item) => [
          item.id,
          {
            id: item.id,
            canvasGroupId: item.canvasGroupId?.trim().slice(0, 120) || null,
          },
        ])
    ).values()
  );
  if (!assignments.length) return [];

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const ids = assignments.map((item) => item.id);
    const { rows } = await client.query(
      `SELECT id, group_id, canvas_group_id
         FROM app_artworks
        WHERE email = $1 AND id = ANY($2::text[]) AND deleted_at IS NULL
        FOR UPDATE`,
      [email, ids]
    );
    if (rows.length !== assignments.length) {
      throw new Error("节点不存在或无权访问");
    }
    const projectById = new Map(rows.map((row) => [String(row.id), String(row.group_id || row.id)]));
    const projectByCanvasGroup = new Map<string, string>();
    for (const assignment of assignments) {
      if (!assignment.canvasGroupId) continue;
      const projectId = projectById.get(assignment.id) as string;
      const seenProject = projectByCanvasGroup.get(assignment.canvasGroupId);
      if (seenProject && seenProject !== projectId) {
        throw new Error("只能对同一画布项目中的节点成组");
      }
      projectByCanvasGroup.set(assignment.canvasGroupId, projectId);
    }
    if (projectByCanvasGroup.size) {
      const existing = await client.query(
        `SELECT id, canvas_group_id, group_id
           FROM app_artworks
          WHERE email = $1 AND canvas_group_id = ANY($2::text[]) AND deleted_at IS NULL`,
        [email, Array.from(projectByCanvasGroup.keys())]
      );
      for (const row of existing.rows) {
        const expected = projectByCanvasGroup.get(String(row.canvas_group_id));
        if (expected && expected !== String(row.group_id || row.id)) {
          throw new Error("画布分组不能跨项目复用");
        }
      }
    }
    for (const assignment of assignments) {
      await client.query(
        `UPDATE app_artworks SET canvas_group_id = $3
          WHERE email = $1 AND id = $2 AND deleted_at IS NULL`,
        [email, assignment.id, assignment.canvasGroupId]
      );
    }
    await client.query("COMMIT");
    return assignments;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// 给某节点追加一个父节点(多输入):合并进 parent_ids(去重,排除自身)。
export async function addArtworkParent(
  emailRaw: string,
  id: string,
  parentId: string
): Promise<void> {
  await ensureSchema();
  if (!id || !parentId || id === parentId) return;
  const email = emailRaw.toLowerCase();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [email]);
    const { rows } = await client.query(
      `SELECT id, parent_id, parent_ids, group_id, source_url AS source
         FROM app_artworks
        WHERE email = $1 AND id = ANY($2::text[]) AND deleted_at IS NULL
        FOR UPDATE`,
      [email, [id, parentId]]
    );
    if (rows.length !== 2) throw new Error("节点不存在或无权访问");
    const target = rows.find((r) => r.id === id);
    const source = rows.find((r) => r.id === parentId);
    if (!target || !source) throw new Error("节点不存在或无权访问");
    if (target.group_id !== source.group_id) {
      throw new Error("只能连接同一项目内的节点");
    }

    // 服务端再次做防环校验，不能只依赖可被绕过的前端判断。
    const graph = await client.query(
      `SELECT id, parent_id, parent_ids, source_url AS source
         FROM app_artworks
        WHERE email = $1 AND group_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL`,
      [email, target.group_id]
    );
    if(canvasParentCycle(graph.rows.map(row=>({id:row.id,parentId:row.parent_id,parentIds:row.parent_ids,source:row.source})),id,parentId))throw new Error("连接会形成循环");
    const next=changeCanvasParent({parentId:target.parent_id,parentIds:target.parent_ids,source:target.source},parentId,true);
    await client.query("UPDATE app_artworks SET parent_id=$3,parent_ids=$4::jsonb WHERE email=$1 AND id=$2",[email,id,next.parentId,JSON.stringify(next.parentIds)]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// 剪断连线:把某个父节点从节点的血缘里移除(primary 置空 / 从 parent_ids 移除)。
export async function removeArtworkParent(
  emailRaw: string,
  id: string,
  parentId: string
): Promise<void> {
  await ensureSchema();
  if (!id || !parentId) return;
  const email = emailRaw.toLowerCase();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [email]);
    const { rows } = await client.query(
      `SELECT parent_id, parent_ids, source_url AS source FROM app_artworks
       WHERE email = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [email, id]
    );
    if (rows.length) {
      const row = rows[0];
      const next=changeCanvasParent({parentId:row.parent_id,parentIds:row.parent_ids,source:row.source},parentId,false);
      await client.query("UPDATE app_artworks SET parent_id=$3,parent_ids=$4::jsonb WHERE email=$1 AND id=$2",[email,id,next.parentId,JSON.stringify(next.parentIds)]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
