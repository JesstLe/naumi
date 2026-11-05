import { NextResponse } from "next/server";
import {dbEnabled} from "@/platform/db/pool";
import {deleteProjectName, getProjectNames, setProjectName} from "@/lib/canvas/project-repository";
import { authenticatedEmail, authorizedTargetEmail } from "@/lib/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 画布项目自定义名:GET 拉某用户的全部项目名覆盖;POST 改某个项目名。
// 数据库启用时，目标邮箱必须绑定到真实会话；管理员仅可只读查看。
export async function GET(request: Request) {
  if (!dbEnabled) return NextResponse.json({ names: {} });
  const requested = new URL(request.url).searchParams.get("email");
  const email = await authorizedTargetEmail(request, requested, true);
  if (!email) {
    return NextResponse.json({ error: "未登录或无权访问" }, { status: 401 });
  }
  const names = await getProjectNames(email).catch(() => ({}));
  return NextResponse.json({ names });
}

export async function POST(request: Request) {
  if (!dbEnabled) {
    return NextResponse.json({ error: "数据库未配置" }, { status: 503 });
  }
  let body: { email?: string; key?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const email = await authenticatedEmail(request);
  const key = (body.key ?? "").trim();
  const name = (body.name ?? "").trim();
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!key || !name) {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  }
  await setProjectName(email, key, name);
  return NextResponse.json({ ok: true, name: name.slice(0, 60) });
}

export async function DELETE(request: Request) {
  if (!dbEnabled) return NextResponse.json({ ok: true, persisted: false });
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  let body: { key?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const key = (body.key ?? "").trim();
  if (!key) return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  await deleteProjectName(email, key);
  return NextResponse.json({ ok: true });
}
