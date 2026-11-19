import { z } from "zod";
import { dbEnabled } from "@/platform/db/pool";
import { authenticatedEmail } from "@/lib/request-auth";
import { sameSiteBiMutation } from "@/lib/bi/access";
import { checkRateLimit } from "@/lib/rate-limit-http";
import { withCreationReceiptRoute, withCreationRoute } from "@/lib/saas/creation-context";
import { assertCurrentCreationFeature } from "@/lib/saas/creation-access";
import { billingFailure } from "@/lib/billing/failure";
import { readManagedObject } from "@/lib/object-storage/managed-read";
import { readBounded } from "@/lib/supplier-cost/io";
import { layerPrice, layeredPsdReceipt, MAX_PSD_BYTES, PSD_TYPE, runLayerDecomposition } from "@/lib/canvas/layered-psd-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };
const operationId = z.string().uuid();
const submission = z.object({
  artworkId: z.string().min(1).max(200),
  sourceImage: z.string().min(1).max(2048),
  operationId,
  version: z.number().int().nonnegative(),
  credits: z.number().int().nonnegative(),
}).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const notReady = () => reply({ error: "智能拆层暂不可用" }, 503);

export function GET(request: Request) {
  if (!dbEnabled) return notReady();
  return withCreationReceiptRoute(request, async actor => {
    const email = actor === undefined ? await authenticatedEmail(request) : actor;
    if (!email) return reply({ error: "请先登录" }, 401);
    const params = new URL(request.url).searchParams;
    if (!params.has("operationId")) {
      try {
        await assertCurrentCreationFeature("/api/canvas/layered-psd");
        const price = await layerPrice(email);
        return reply({ version: price.billing.version, credits: price.frozen.authorizedCredits, pilotOperationId: price.pilotOperationId });
      } catch { return notReady(); }
    }
    const parsed = operationId.safeParse(params.get("operationId"));
    if (!parsed.success) return reply({ error: "拆层任务编号无效" }, 400);
    const receipt = await layeredPsdReceipt(email, parsed.data);
    if (!receipt) return reply({ state: "missing" }, 404);
    if (receipt.state !== "ready" || params.get("file") !== "1") return reply({ state: receipt.state });
    try {
      const file = await readManagedObject(`/media/${receipt.fileKey}`, MAX_PSD_BYTES, AbortSignal.timeout(30_000));
      return new Response(new Uint8Array(file.bytes), { headers: { ...headers, "Content-Type": PSD_TYPE, "X-Content-Type-Options": "nosniff" } });
    } catch { return reply({ error: "PSD 暂不可读取，请重试下载原任务" }, 503); }
  });
}

export function POST(request: Request) {
  if (!dbEnabled) return notReady();
  if (!sameSiteBiMutation(request)) return reply({ error: "不允许跨站操作" }, 403);
  return withCreationRoute(request, async actor => {
    const email = actor === undefined ? await authenticatedEmail(request) : actor;
    if (!email) return reply({ error: "请先登录" }, 401);
    let input;
    try { input = submission.safeParse(JSON.parse(await readBounded(new Response(request.body), 4096))); }
    catch { return reply({ error: "拆层请求无效" }, 400); }
    if (!input.success) return reply({ error: "拆层请求无效" }, 400);
    try {
      await assertCurrentCreationFeature("/api/canvas/layered-psd");
      const admission = await checkRateLimit(`canvas-layered-psd:${email}`, 3, 10 * 60_000);
      if (admission instanceof Response) return admission;
      if (!admission) return reply({ error: "操作过于频繁，请稍后重试", operationId: input.data.operationId, accepted: false }, 429);
      const result = await runLayerDecomposition(email, input.data);
      if (result.body?.ok) return reply({ ok: true, operationId: input.data.operationId });
      if ([400, 402, 404].includes(result.status) || result.body?.code === "OPERATION_CONFLICT") {
        return reply({ ...result.body, operationId: input.data.operationId, accepted: false }, result.status);
      }
      return reply(result.body, result.status);
    } catch (error) {
      const { status, ...body } = billingFailure(error);
      if (status === 400 || status === 404 || body.code === "OPERATION_CONFLICT") {
        return reply({ ...body, operationId: input.data.operationId, accepted: false }, status);
      }
      return reply(body, status);
    }
  });
}
