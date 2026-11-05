import { NextResponse } from "next/server";
import {listAllUsers, adminStats, deleteUser} from "@/lib/accounts/administration";
import {listLedger, listUserLedger} from "@/lib/billing/legacy-ledger";
import {adjustUserCredits} from "@/lib/billing/grants";
import {dbEnabled} from "@/platform/db/pool";
import {listArtworks} from "@/lib/artworks/repository";
import {getOrCreateUser, getUser} from "@/lib/accounts/session";
import {setUserPassword, setUserRole, setUserBanned, setUserNote, banIp, unbanIp, listBannedIps} from "@/lib/accounts/repository";
import { requireAdmin } from "@/lib/admin-auth";
import {authorizeAdminMutation} from "@/lib/admin-mutation";
import {AccountChangeError, assertAccountChangeAllowed} from "@/lib/accounts/change-policy";
import {appendManagementLogAfterChange} from "@/lib/bi/management-log";
import {operationIdFor} from "@/lib/billing/request";
import { hashPassword } from "@/lib/pw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function snapshot() {
  const [stats, users, ledger, bannedIps] = await Promise.all([
    adminStats(),
    listAllUsers(),
    listLedger(50),
    listBannedIps(),
  ]);
  return { stats, users, ledger, bannedIps };
}

async function guard(req: Request): Promise<NextResponse | null> {
  if (!dbEnabled) {
    return NextResponse.json(
      { error: "未配置数据库，管理不可用" },
      { status: 503 }
    );
  }
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "需要管理员身份" }, { status: 403 });
  }

  return null;
}

export async function GET(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  // ?email= -> per-member detail (artworks + credit ledger)
  const email = new URL(req.url).searchParams.get("email");
  if (email) {
    const e = email.trim().toLowerCase();
    const [user, artworks, ledger] = await Promise.all([
      getUser(e),
      listArtworks(e),
      listUserLedger(e, 100),
    ]);
    return NextResponse.json({ detail: { email: e, user, artworks, ledger } });
  }
  return NextResponse.json(await snapshot());
}

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const mutation = await authorizeAdminMutation(req, "users");
  if (mutation instanceof Response) return mutation;
  const { actor } = mutation;

  let body: {
    action?: string;
    email?: string;
    role?: string;
    delta?: number;
    months?: number;
    banned?: boolean;
    ip?: string;
    reason?: string;
    note?: string;
    name?: string;
    password?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const action = body.action ?? "";
  const ipActions = new Set(["ban-ip", "unban-ip"]);

  try {
    if (ipActions.has(action)) {
      const ip = (body.ip ?? "").trim();
      if (!ip) {
        return NextResponse.json({ error: "缺少 ip" }, { status: 400 });
      }
      if (action === "ban-ip") {
        await banIp(ip, (body.reason ?? "").trim());
      } else {
        await unbanIp(ip);
      }
      await appendManagementLogAfterChange({ actor, subject: `ip:${ip}`, action, reason: (body.reason ?? "").trim(), changes: { ip } });
      return NextResponse.json(await snapshot());
    }

    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "缺少 email" }, { status: 400 });
    }

    let changes: Record<string, unknown> = {};
    if (action === "create") {
      // 管理员创建用户:邮箱+姓名+初始密码(可选发放积分由后续 adjust 完成)
      const name = (body.name ?? "").trim().slice(0, 40);
      const password = (body.password ?? "").trim();
      if (password.length < 6) {
        return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
      }
      const existing = await getUser(email);
      if (existing) {
        return NextResponse.json({ error: "该邮箱已存在" }, { status: 409 });
      }
      await getOrCreateUser(email, name);
      await setUserPassword(email, hashPassword(password));
      changes = { name };
    } else if (action === "reset-password") {
      const password = (body.password ?? "").trim();
      if (password.length < 6) {
        return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
      }
      const existing = await getUser(email);
      if (!existing) {
        return NextResponse.json({ error: "用户不存在" }, { status: 404 });
      }
      await assertAccountChangeAllowed(actor, email, { kind: "reset-password" });
      await setUserPassword(email, hashPassword(password));
    } else if (action === "role") {
      const role = body.role === "admin" ? "admin" : "user";
      await assertAccountChangeAllowed(actor, email, { kind: "role", role });
      await setUserRole(email, role);
      changes = { role };
    } else if (action === "adjust") {
      const d = Math.trunc(Number(body.delta) || 0);
      if (!d) {
        return NextResponse.json(
          { error: "调整值无效" },
          { status: 400 }
        );
      }
      // months: 赠送积分有效期(月);0/负=永久;缺省=2年兜底。仅加分时生效。
      const months =
        body.months === undefined || body.months === null
          ? undefined
          : Math.trunc(Number(body.months));
      await adjustUserCredits(email, d, "管理员调整积分", { months,id:operationIdFor(req),actor });
      changes = { delta: d, ...(months === undefined ? {} : { months }) };
    } else if (action === "ban") {
      const banned = body.banned === true;
      await assertAccountChangeAllowed(actor, email, { kind: "ban", banned });
      await setUserBanned(email, banned);
      changes = { banned };
    } else if (action === "note") {
      await setUserNote(email, body.note ?? "");
      changes = { noteLength: String(body.note ?? "").length };
    } else if (action === "delete") {
      await assertAccountChangeAllowed(actor, email, { kind: "delete" });
      await deleteUser(email);
    } else {
      return NextResponse.json(
        { error: "未知操作" },
        { status: 400 }
      );
    }
    await appendManagementLogAfterChange({ actor, subject: email, action, changes });
    return NextResponse.json(await snapshot());
  } catch (e) {
    if (e instanceof AccountChangeError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "操作失败" },
      { status: 500 }
    );
  }
}
