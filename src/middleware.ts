import { NextResponse, type NextRequest } from "next/server";
import { featureRequestGate, ACCESS_HEADERS, accessJson } from "@/lib/feature-access/server";
import { requestRequirement } from "@/lib/feature-access/catalog";
import { timingSafeEqual } from "node:crypto";
import { workerSecret } from "@/lib/settings-secret";
import { releaseControlAuthorized } from "@/lib/release-runtime/identity";
import { CONTINUATION_HEADER, verifyAgentContinuation } from "@/lib/release-runtime/accepted-context";
import { resolveUserEmail } from "@/lib/admin-auth";
import { releaseError } from "@/lib/release-runtime/identity";

// Node middleware enforces live database grants before page/API dispatch.
// Overwrite the path header so a client cannot forge layout routing metadata.
export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/internal/release/")) {
    if (!releaseControlAuthorized(req)) return accessJson({ error: "Not found" }, 404);
    return NextResponse.next();
  }
  if(process.env.FLEET_PORTAL_ONLY==='1'){
    const path=req.nextUrl.pathname;
    const allowed=path==='/admin/deployments'||['/api/version','/api/health','/api/admin/fleet','/api/admin/fleet/status','/api/admin/fleet/releases','/api/fleet/poll','/api/fleet/ack','/api/fleet/releases/poll','/api/fleet/releases/ack'].includes(path);
    if(!allowed)return accessJson({error:'Not found'},404);
  }
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  if(req.nextUrl.pathname==='/enterprise/workflow'&&!await resolveUserEmail(req)){
    const login=req.nextUrl.clone();login.pathname='/sign-in';login.search='?redirect=%2Fenterprise%2Fworkflow';
    return NextResponse.redirect(login,{status:307,headers:ACCESS_HEADERS});
  }
  let protectedRoute;
  try { protectedRoute = requestRequirement(req.nextUrl.pathname, req.method); }
  catch { return accessJson({ error: "路径格式无效" }, 400); }
  if (protectedRoute) {
    try {
      // Existing signed worker recovery completes already accepted/charged jobs.
      // This is NOT an ordinary-user or model-controlled header bypass.
      let worker = false;
      const workerReceiptRead = req.method === "GET" && req.nextUrl.pathname === "/api/video/worker/tick" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(req.nextUrl.searchParams.get("tickId") || "");
      if (req.headers.has("x-video-worker-secret") && (workerReceiptRead || req.method === "GET" && req.nextUrl.pathname === "/api/video/worker/drain-status" || req.method === "POST" && (["/api/generate-image", "/api/imagegen", "/api/suite", "/api/aplus", "/api/video/worker/tick"].includes(req.nextUrl.pathname)||/^\/api\/imagegen\/batches\/[a-f0-9-]{36}$/i.test(req.nextUrl.pathname)))) {
        const configured = Buffer.from(workerSecret()), supplied = Buffer.from(req.headers.get("x-video-worker-secret") || "");
        worker = configured.length === supplied.length && timingSafeEqual(configured, supplied);
      }
      const blocked = worker ? null : await featureRequestGate(req);
      if (blocked) {
        if (req.nextUrl.pathname.startsWith("/api/") || req.nextUrl.pathname.startsWith("/desktop/api/")) return blocked;
        const target = req.nextUrl.clone(); target.pathname = "/access-denied"; target.search = "";
        return NextResponse.redirect(target, { status: 307, headers: ACCESS_HEADERS });
      }
    } catch {
      return accessJson({ error: "权限服务暂时不可用" }, 503);
    }
  }
  if(req.headers.has(CONTINUATION_HEADER)) {
    try { await verifyAgentContinuation(req,await resolveUserEmail(req),false); }
    catch(error){return releaseError(error);}
  }
  return NextResponse.next({ request: { headers }, ...(protectedRoute ? { headers: ACCESS_HEADERS } : {}) });
}

// API routes and pages share the gate; static assets do not query permissions.
export const config = {
  runtime: "nodejs",
  matcher: ["/api/:path*", "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
