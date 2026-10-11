import "server-only";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createProviderCapacity } from "./capacity";
import { getModelAdministration } from "./server";
import { ModelConfigError } from "./types";

const command = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("acquire"), modelVersion: z.number().int().positive(), billingVersion: z.number().int().positive(), digest: z.string().regex(/^[a-f0-9]{64}$/), providerId: z.string().max(100) }),
  z.strictObject({ action: z.literal("release"), token: z.uuid() }),
]);
type Administration = Pick<Awaited<ReturnType<typeof getModelAdministration>>, "pool" | "repo" | "runtime">;

/** Private server callback. Caller supplies neither credentials nor limits. */
export async function routerCapacityHandler(request: Request, administration?: Administration) {
  const expected = process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN || "", supplied = request.headers.get("authorization") || "";
  const wanted = `Bearer ${expected}`;
  if (expected.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(wanted) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(wanted))) return new Response(null, { status: 404 });
  try {
    const parts: Uint8Array[] = []; let bytes = 0;
    const reader = request.body?.getReader();
    if (!reader) throw new ModelConfigError("INVALID_REQUEST", "请求不能为空", 400);
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 4096) { await reader.cancel(); throw new ModelConfigError("INVALID_REQUEST", "请求过大", 400); } parts.push(part.value); }
    const input = command.parse(JSON.parse(Buffer.concat(parts).toString()));
    const admin = administration || await getModelAdministration();
    if (input.action === "release") {
      await admin.pool.query("DELETE FROM app_model_provider_leases WHERE token=$1", [input.token]);
      return Response.json({ released: true }, { headers: { "Cache-Control": "no-store" } });
    }
    await admin.runtime.validateExecutionProjection(input);
    const snapshot = await admin.repo.byVersion(input.modelVersion);
    const provider = snapshot.config.providers.find(p => p.id === input.providerId);
    if (!provider || !["openai-images", "apimart-images", "fal-images"].includes(provider.protocol)) throw new ModelConfigError("EXECUTION_MISMATCH", "原模型供应商不匹配", 503);
    const lease = await createProviderCapacity(admin.pool).acquire({ providerId: provider.id, baseUrl: provider.baseUrl, maxConcurrent: provider.maxConcurrent, timeoutMs: provider.timeoutMs });
    return Response.json({ token: lease.token }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ModelConfigError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503;
    return Response.json({ error: status === 429 ? "provider_capacity" : "capacity_unavailable" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
