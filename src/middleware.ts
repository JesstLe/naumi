import { NextResponse, type NextRequest } from "next/server";
import { featureRequestGate, ACCESS_HEADERS, accessJson } from "@/lib/feature-access/server";
import { requestRequirement } from "@/lib/feature-access/catalog";
import { timingSafeEqual } from "node:crypto";
import { workerSecret } from "@/lib/settings-secret";

// Node middleware enforces live database grants before page/API dispatch.
// Overwrite the path header so a client cannot forge layout routing metadata.
export async function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  let protectedRoute;
  try { protectedRoute = requestRequirement(req.nextUrl.pathname, req.method); }
  catch { return accessJson({ error: "路径格式无效" }, 400); }
  if (protectedRoute) {
    try {
      // Existing signed worker recovery completes already accepted/charged jobs.
      // This is NOT an ordinary-user or model-controlled header bypass.
      let worker = false;
      if (req.method === "POST" && req.headers.has("x-video-worker-secret") && (["/api/generate-image", "/api/imagegen", "/api/suite", "/api/aplus", "/api/video/worker/tick"].includes(req.nextUrl.pathname)||/^\/api\/imagegen\/batches\/[a-f0-9-]{36}$/i.test(req.nextUrl.pathname))) {
        const configured = Buffer.from(workerSecret()), supplied = Buffer.from(req.headers.get("x-video-worker-secret") || "");
        worker = configured.length === supplied.length && timingSafeEqual(configured, supplied);
      }
      const blocked = worker ? null : await featureRequestGate(req);
      if (blocked) {
        if (req.nextUrl.pathname.startsWith("/api/")) return blocked;
        const target = req.nextUrl.clone(); target.pathname = "/access-denied"; target.search = "";
        return NextResponse.redirect(target, { status: 307, headers: ACCESS_HEADERS });
      }
    } catch {
      return accessJson({ error: "权限服务暂时不可用" }, 503);
    }
  }
  return NextResponse.next({ request: { headers }, ...(protectedRoute ? { headers: ACCESS_HEADERS } : {}) });
}

// API routes and pages share the gate; static assets do not query permissions.
export const config = {
  runtime: "nodejs",
  matcher: ["/api/:path*", "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
