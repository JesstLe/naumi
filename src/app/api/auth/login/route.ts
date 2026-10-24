import {
  multiUserEnabled,
  signUserSession,
  USER_COOKIE,
  USER_TTL_MS,
} from "@/lib/native-auth";
import {getUser} from "@/lib/db";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import { verifyPassword } from "@/lib/pw";
import { createLoginGuard } from "@/lib/auth-login-limit";
import { settingsSecret } from "@/lib/settings-secret";
import { clientIp } from "@/lib/ip";
import { loginIdentifierToEmail } from "@/lib/account-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 原生多用户:登录(邮箱+密码)。仅多用户模式开放。
export async function POST(req: Request) {
  if (!(await multiUserEnabled())) {
    return Response.json({ error: "本站未开放登录" }, { status: 403 });
  }
  if(req.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'请求来源无效'},{status:403});
  const ip = req.headers.get('x-real-ip') || clientIp(req);
  let body: { email?: string; password?: string };
  try {
    if(Number(req.headers.get('content-length'))>8192)return Response.json({error:'请求过大'},{status:413});
    const raw=await req.text();if(Buffer.byteLength(raw)>8192)return Response.json({error:'请求过大'},{status:413});
    body = JSON.parse(raw);
    if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.email!=='string'||typeof body.password!=='string'||body.email.length>254||body.password.length>1024)throw Error('INVALID_LOGIN');
  } catch {
    return Response.json({ error: "请求无效" }, { status: 400 });
  }
  const email = loginIdentifierToEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  if(!String(body.email).trim()||!password)return Response.json({error:'请填写用户名和密码'},{status:400});
  await ensureSchema();
  const guard=createLoginGuard(getPool(),settingsSecret());
  let attempt:Awaited<ReturnType<typeof guard.begin>>;
  try{attempt=await guard.begin(email,ip);}catch{return Response.json({error:'登录服务暂不可用，请稍后重试'},{status:503,headers:{'Cache-Control':'private, no-store','Retry-After':'3'}});}
  if(!attempt.allowed)return Response.json({error:'此账号尝试过于频繁，请稍后再试',retryAfter:attempt.retryAfter},{status:429,headers:{'Retry-After':String(attempt.retryAfter),'Cache-Control':'private, no-store'}});
  const tx = await getPool().connect();
  let released=false;
  let token = "";
  try {
    await tx.query("BEGIN");
    await tx.query("SET LOCAL lock_timeout='3s'");
    await tx.query("SET LOCAL statement_timeout='5s'");
    // Lock credentials through token issuance: a concurrent password reset or
    // ban must either precede verification or revoke the issued old session.
    const state = (await tx.query("SELECT password_hash,banned,account_expires_at FROM app_users WHERE email=$1 FOR SHARE", [email])).rows[0];
    // A fixed real-format dummy hash keeps unknown identities on the same scrypt path.
    const valid=verifyPassword(password,state?.password_hash||'scrypt$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000');
    if (!state?.password_hash || !valid) {
      await tx.query("ROLLBACK");
      tx.release();released=true;
      await guard.finish(attempt.id,'failure');
      return Response.json({ error: "用户名、邮箱或密码错误" }, { status: 401 });
    }
    if (state.banned || (state.account_expires_at && new Date(state.account_expires_at).getTime() <= Date.now())) {
      await tx.query("ROLLBACK");
      tx.release();released=true;
      await guard.finish(attempt.id,'ignored');
      return Response.json({ error: "账号已停用或已到期，请联系管理员" }, { status: 403 });
    }
    const issuedAt = Date.now();
    token = signUserSession(email, issuedAt);
    await tx.query("COMMIT");
    tx.release();released=true;
    await guard.finish(attempt.id,'success');
  } catch { if(!released){await tx.query("ROLLBACK");tx.release();released=true;}await guard.finish(attempt.id,'ignored').catch(()=>{});return Response.json({error:'登录服务暂不可用，请稍后重试'},{status:503,headers:{'Cache-Control':'private, no-store'}}); }
  finally { if(!released)tx.release(); }
  const user = await getUser(email);
  const res = Response.json({ ok: true, user });
  res.headers.set('Cache-Control','private, no-store');
  const secure=req.headers.get('x-forwarded-proto')==='https'||new URL(req.url).protocol==='https:';
  res.headers.append('Set-Cookie',`${USER_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(USER_TTL_MS/1000)}; HttpOnly; SameSite=Lax${secure?'; Secure':''}`);
  return res;
}
