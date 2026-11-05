import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {RETIRED_BUSINESS_PROJECTS,isRetiredBusinessProject} from "@/lib/retired-business-projects";

// ── 业务项目注册表 ──────────────────────────────────────────────────────────
export type ProjectRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  color: string;
  category: string;
  agent_tool: boolean;
  run_type: "web" | "script" | "external";
  visible: boolean;
  sort_index: number;
};

// 默认业务项目种子(仅表空时播种一次;后台可增删改)。
// 已有数据只对明确含 Unicode 替换字符(U+FFFD)的默认项目做定向修复，
// 避免历史终端编码错误长期把乱码返回给导航，同时不覆盖正常的后台自定义内容。
const DEFAULT_PROJECTS = [
  { slug: "naumi", name: "Naumi 工具台", description: "AI 生图/套图/A+/精修/换色 美工工作站", url: "/", icon: "Sparkles", color: "#4F46E5", category: "美工", agent_tool: true, sort_index: 1 },
  { slug: "sycm", name: "生意参谋助手", description: "品牌星图选词 → 生意参谋核对 → 淘宝前十比对", url: "", icon: "TrendingUp", color: "#2E7CF6", category: "运营", agent_tool: true, sort_index: 2 },
  { slug: "rag", name: "经营知识库", description: "高管/经理助理 RAG 问答(规划中)", url: "", icon: "BookOpen", color: "#6D5BF6", category: "管理", agent_tool: false, sort_index: 6 },
] as const;

async function repairCorruptedDefaultProjects(): Promise<void> {
  for (const d of DEFAULT_PROJECTS) {
    await getPool().query(
      `UPDATE app_projects
          SET name = $2,
              description = $3,
              icon = $4,
              color = $5,
              category = $6
        WHERE slug = $1
          AND (position(chr(65533) in name) > 0
            OR position(chr(65533) in description) > 0
            OR position(chr(65533) in category) > 0)`,
      [d.slug, d.name, d.description, d.icon, d.color, d.category],
    );
  }
}

let projectsSeeded = false;

export async function seedProjects(): Promise<void> {
  if (projectsSeeded) return;
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT 1 FROM app_projects LIMIT 1`
  );
  if ((rows.length ?? 0) > 0) {
    await repairCorruptedDefaultProjects();
    projectsSeeded = true;
    return;
  }
  for (const d of DEFAULT_PROJECTS) {
    await getPool().query(
      `INSERT INTO app_projects (slug, name, description, url, icon, color, category, agent_tool, visible, sort_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) ON CONFLICT (slug) DO NOTHING`,
      [d.slug, d.name, d.description, d.url, d.icon, d.color, d.category, d.agent_tool, d.sort_index]
    );
  }
  projectsSeeded = true;
}

export async function listProjects(onlyVisible = true): Promise<ProjectRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT * FROM app_projects
      WHERE NOT (lower(trim(slug)) = ANY($1::text[])) ${onlyVisible ? "AND visible = true" : ""}
      ORDER BY sort_index ASC, id ASC`,
    [RETIRED_BUSINESS_PROJECTS],
  );
  return rows as ProjectRow[];
}

export async function upsertProject(p: {
  slug: string; name: string; description?: string; url?: string;
  icon?: string; color?: string; category?: string;
  agent_tool?: boolean; run_type?: string; visible?: boolean; sort_index?: number;
}): Promise<void> {
  if (isRetiredBusinessProject(p.slug)) throw new Error("该业务项目已废弃");
  await ensureSchema();
  await getPool().query(
    `INSERT INTO app_projects
       (slug, name, description, url, icon, color, category, agent_tool, run_type, visible, sort_index)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       url = EXCLUDED.url,
       icon = EXCLUDED.icon,
       color = EXCLUDED.color,
       category = EXCLUDED.category,
       agent_tool = EXCLUDED.agent_tool,
       run_type = EXCLUDED.run_type,
       visible = EXCLUDED.visible,
       sort_index = EXCLUDED.sort_index`,
    [p.slug, p.name, p.description ?? "", p.url ?? "", p.icon ?? "Box",
     p.color ?? "#4F46E5", p.category ?? "业务系统",
     p.agent_tool ?? false, p.run_type ?? "web", p.visible ?? true, p.sort_index ?? 0],
  );
}

export async function deleteProject(slug: string): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM app_projects WHERE slug = $1`, [slug]);
}
