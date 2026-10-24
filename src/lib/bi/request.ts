import "server-only";
import {withCreationRequest} from "@/lib/saas/creation-context";
import {TeamError} from "@/lib/teams/server";
import {CONTINUATION_HEADER,withAcceptedContinuationRequest} from "@/lib/release-runtime/accepted-context";
import {releaseError,ReleaseRuntimeError} from "@/lib/release-runtime/identity";
import {dbEnabled} from "@/platform/db/pool";
import {resolveUserEmail} from "@/lib/admin-auth";
import {currentSynchronousBilling} from "@/lib/billing/synchronous-operation";
import {withArtworkCreation} from "@/lib/artwork-provenance-context";
import {provenanceEntry} from "@/lib/artwork-provenance";
import {withModelRequest} from "@/lib/model-config/requests";
import {ModelConfigError} from "@/lib/model-config/types";
import {withBiContext} from "./context";

export async function withBiRequest<T extends Response>(
  request: Request,
  run: () => Promise<T>,
) {
  const email = dbEnabled
    ? await resolveUserEmail(request).catch(() => null)
    : null;
  if (!email) {
    if(request.headers.has(CONTINUATION_HEADER))return releaseError(new ReleaseRuntimeError("AGENT_CONTINUATION_FORGED",403)) as T;
    return run();
  }
  const path = new URL(request.url).pathname.slice(0, 100);
  try { return await withBiContext({ email, operation: path }, () => withArtworkCreation({ path, operationId: currentSynchronousBilling()?.id, entry: provenanceEntry(request.headers.get("x-naumi-client-entry"), path.startsWith("/api/canvas/") ? "canvas" : "toolbox") }, () => withCreationRequest(request,email,() => withAcceptedContinuationRequest(request,email,() => withModelRequest(request, run))))); }
  catch (error) { if(error instanceof TeamError)return Response.json({error:error.message},{status:error.status}) as T; if(error instanceof ReleaseRuntimeError)return releaseError(error) as T; if (error instanceof ModelConfigError) return new Response(JSON.stringify({ error: error.message, code: error.code,...(error.code==="IMAGE_QUOTE_EXPIRED"?{accepted:false}:{}) }), { status: error.status, headers: { "content-type": "application/json", "cache-control": "no-store" } }) as T; throw error; }
}
