import { NextResponse } from "next/server";
import {
  dbEnabled,
  getOrCreateUser,
  getUser,
  changeUserPlan,
  listArtworks,
  getWorkbenchArtworks,
  recordLoginIp,
} from "@/lib/db";
import { clientIp } from "@/lib/ip";
import type { PlanKey } from "@/lib/mock-data";
import { authenticatedEmail, authorizedTargetEmail } from "@/lib/request-auth";

export const runtime = "nodejs";

// 校验请求者(登录 token)是否有权看「该 email 的私有数据」:本人 或 管理员。
// Account / membership persistence. When the DB is disabled every response
// carries `persisted: false` so the client transparently uses its
// localStorage mock instead.

export async function GET(request: Request) {
  if (!dbEnabled) return NextResponse.json({ persisted: false });
  const email = await authorizedTargetEmail(request, new URL(request.url).searchParams.get("email"), true);
  if (!email) {
    return NextResponse.json({ error: "未登录或无权访问" }, { status: 401 });
  }
  try {
    const query = new URL(request.url).searchParams;
    let dayStart: Date | undefined, dayEnd: Date | undefined;
    if (query.get("view") === "workbench") {
      dayStart = new Date(query.get("dayStart") || "");
      dayEnd = new Date(query.get("dayEnd") || "");
      const duration = dayEnd.getTime() - dayStart.getTime();
      if (!Number.isFinite(duration) || duration < 23 * 3600000 || duration > 25 * 3600000) {
        return NextResponse.json({error:"日期范围无效"}, {status:400});
      }
    }
    // 是否有权看该 email 的私有数据(本人 或 管理员)——独立判断,不依赖用户行是否存在。
    let user = await getUser(email);
    // 开源版单用户常见:操作员有有效登录态(nv_admin cookie)但用户行还没建起来。
    // 授权本人/管理员首次访问时把行补上,否则下面按「user 为空」把作品全挡掉 → 展示为空。
    if (!user && email === await authenticatedEmail(request)) {
      user = await getOrCreateUser(email, "").catch(() => null);
    }
    // 防越权读:作品列表(图 URL + 提示词,较敏感)只返回给本人或管理员。
    const result = dayStart && dayEnd
      ? await getWorkbenchArtworks(email, dayStart, dayEnd)
      : {artworks: await listArtworks(email)};
    return NextResponse.json({ persisted: true, user, ...result }, {headers:{"Cache-Control":"private, no-store"}});
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "数据库读取失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!dbEnabled) return NextResponse.json({ persisted: false });

  let body: { action?: string; email?: string; name?: string; plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const email = await authenticatedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  if (!body || (body.email !== undefined && typeof body.email !== "string")) {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  if (body.email && body.email.trim().toLowerCase() !== email) {
    return NextResponse.json({ error: "无权修改其他账号" }, { status: 403 });
  }

  try {
    if (body.action === "plan") {
      // 本人只能取消会员；付费套餐仍须经过验真的支付回调开通。
      const target = (body.plan as PlanKey) ?? "starter";
      if (target !== "starter") {
        return NextResponse.json(
          { error: "付费套餐请通过购买开通", needPurchase: true },
          { status: 403 }
        );
      }
      // 防越权改:取消会员(降级 starter)必须是本人登录态(否则有人能把别人降级、清空积分)。
      const { user, invoice } = await changeUserPlan(email, "starter");
      return NextResponse.json({ persisted: true, user, invoice });
    }
    // default: sync (upsert + return). This fires on every login/session
    // bootstrap, so it's where we capture the user's latest login IP.
    const user = await getOrCreateUser(email, String(body.name ?? "").trim().slice(0, 80));
    await recordLoginIp(email, clientIp(request));
    return NextResponse.json({ persisted: true, user });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "数据库写入失败" },
      { status: 500 }
    );
  }
}
