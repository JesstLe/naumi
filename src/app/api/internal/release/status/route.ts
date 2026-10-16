import { releaseControlAuthorized, releaseError, releaseRuntimeEnabled } from "@/lib/release-runtime/identity";
import { releaseStatus } from "@/lib/release-runtime/store";
import { transportObservation } from "@/lib/release-runtime/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!releaseControlAuthorized(request)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!releaseRuntimeEnabled()) return Response.json({ error: "RELEASE_RUNTIME_DISABLED", observation: "unknown" }, { status: 503 });
  try {
    const status = await releaseStatus(), transport = await transportObservation();
    return Response.json({ ...status, observations: { ...status.observations, activeRequests: transport.verified ? transport.transport.activeRequests : null }, coverage: { ...status.coverage, allApplicationRequests: transport.verified }, transport }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return releaseError(e); }
}
