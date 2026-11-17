import { NextResponse } from "next/server";
import { biAuthorize, biJson } from "@/lib/bi/access";
import { biJobTrace, logBiAccess } from "@/lib/bi/repository";
import { readRouterTraces } from "@/lib/bi/router-trace";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await biAuthorize(request);
  if (auth instanceof NextResponse) return auth;
  const p = new URL(request.url).searchParams;
  const id = p.get("id") || "",
    email = (p.get("email") || "").toLowerCase();
  if (!id || id.length > 200 || !email || email.length > 254)
    return biJson({ error: "任务参数无效" }, 400);
  try {
    const attempts = await biJobTrace(id, email);
    await logBiAccess(auth.actor, "view-trace", "operations", email);
    // Bound concurrent read-only lookups. BI never starts or resumes paid work.
    const router=await readRouterTraces(attempts.filter(a=>a.gateway).map(a=>a.operationId),request.signal);
    return biJson({ attempts: attempts.map(a=>({...a,router:a.gateway?router.get(a.operationId):null})) });
  } catch {
    return biJson({ error: "执行证据读取失败" }, 500);
  }
}
