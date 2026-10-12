import { NextResponse } from "next/server";
import { resolveUserEmail } from "@/lib/admin-auth";
import { isRetiredBusinessProject } from "@/lib/retired-business-projects";
import {
  dbEnabled,
  listProjects,
  seedProjects,
  upsertProject,
  deleteProject,
} from "@/lib/db";

// ---------------------------------------------------------------------------
// 业务聚合注册表 API(导航下拉 + 首页卡片 + Agent 工具来源):
//   GET    /api/hub/projects          = 列出(匿名可看 visible;登录可带 ?all=1)
//   POST   /api/hub/projects          = 新增/更新(需登录,后续可收管理员)
//   DELETE /api/hub/projects?slug=    = 删除
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!dbEnabled) {
    return NextResponse.json({ projects: [], persisted: false });
  }
  const url = new URL(request.url);
  const wantAll = url.searchParams.get("all") === "1";
  const email = await resolveUserEmail(request);
  await seedProjects().catch(() => {});
  const projects = await listProjects(!(wantAll && email)).catch(() => []);
  return NextResponse.json({ projects, persisted: true });
}

export async function POST(request: Request) {
  if (!dbEnabled) {
    return NextResponse.json({ error: "数据库未启用" }, { status: 503 });
  }
  const email = await resolveUserEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    slug?: string;
    name?: string;
    description?: string;
    url?: string;
    icon?: string;
    color?: string;
    category?: string;
    agent_tool?: boolean;
    run_type?: string;
    visible?: boolean;
    sort_index?: number;
  } | null;
  const slug = (body?.slug ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  const name = (body?.name ?? "").trim().slice(0, 60);
  if (!slug || !name) {
    return NextResponse.json({ error: "slug 和 name 必填" }, { status: 400 });
  }
  if (isRetiredBusinessProject(slug)) {
    return NextResponse.json({ error: "该业务项目已废弃" }, { status: 410 });
  }
  await upsertProject({
    slug,
    name,
    description: (body?.description ?? "").slice(0, 200),
    url: (body?.url ?? "").slice(0, 500),
    icon: (body?.icon ?? "Box").slice(0, 40),
    color: (body?.color ?? "#4F46E5").slice(0, 20),
    category: (body?.category ?? "业务系统").slice(0, 40),
    agent_tool: body?.agent_tool === true,
    run_type: ["web", "script", "external"].includes(body?.run_type ?? "")
      ? (body!.run_type as string)
      : "web",
    visible: body?.visible !== false,
    sort_index: Number(body?.sort_index) || 0,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!dbEnabled) {
    return NextResponse.json({ error: "数据库未启用" }, { status: 503 });
  }
  const email = await resolveUserEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const slug = new URL(request.url).searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "缺少 slug" }, { status: 400 });
  }
  await deleteProject(slug);
  return NextResponse.json({ ok: true });
}
