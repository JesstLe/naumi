import { releaseControlAuthorized, releaseError, releaseRuntimeEnabled, ReleaseRuntimeError } from "@/lib/release-runtime/identity";
import { controlAdmission } from "@/lib/release-runtime/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!releaseControlAuthorized(request)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!releaseRuntimeEnabled()) return Response.json({ error: "RELEASE_RUNTIME_DISABLED", observation: "unknown" }, { status: 503 });
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 4096) throw new ReleaseRuntimeError("RELEASE_CONTROL_BODY_TOO_LARGE", 413);
    let body: unknown; try { body = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { throw new ReleaseRuntimeError("RELEASE_CONTROL_INVALID", 400); }
    return Response.json(await controlAdmission(body), { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return releaseError(e); }
}
