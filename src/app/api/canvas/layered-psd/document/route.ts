import { z } from "zod";
import { withCreationReceiptRoute } from "@/lib/saas/creation-context";
import { sameSiteBiMutation } from "@/lib/bi/access";
import { readBounded } from "@/lib/supplier-cost/io";
import { billingFailure } from "@/lib/billing/failure";
import {
  attachPsdDocument,
  exportPsdDocument,
  getPsdDocument,
  savePsdDocument,
} from "@/lib/canvas/psd-document-store";
import { InvalidLayerEdit, psdEditsSchema } from "@/lib/canvas/psd-document";
import { PSD_TYPE } from "@/lib/canvas/layered-psd-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const reply = (value: unknown, status = 200) => Response.json(value, { headers, status });
const nodeId = z.string().regex(/^psd-[a-f0-9-]{36}$/);
const attach = z.object({ operationId: z.string().uuid(), sourceId: z.string().min(1).max(200) }).strict();
const save = z.object({ nodeId, revision: z.number().int().nonnegative(), edits: psdEditsSchema }).strict();
function handle(req: Request, action: (email: string) => Promise<Response>) {
  return withCreationReceiptRoute(req, async (email) => {
    if (!email) return reply({ error: "请先登录" }, 401);
    try {
      return await action(email);
    } catch (e) {
      if (e instanceof InvalidLayerEdit) return reply({ error: e.message }, 400);
      if (e instanceof Error && e.message === "receipt too large")
        return reply({ error: "图层编辑数据过大，请减少蒙版笔画后保存" }, 413);
      if (e instanceof z.ZodError || e instanceof SyntaxError) return reply({ error: "图层编辑数据无效" }, 400);
      const f = billingFailure(e);
      return reply({ error: f.error }, f.status);
    }
  });
}
export function GET(req: Request) {
  return handle(req, async (email) => {
    const params = new URL(req.url).searchParams,
      node = nodeId.parse(params.get("nodeId"));
    if (params.get("export") === "1") {
      const revision = z
        .string()
        .regex(/^\d{1,10}$/)
        .transform(Number)
        .parse(params.get("revision"));
      const data = await exportPsdDocument(email, node, revision);
      return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Type": PSD_TYPE } });
    }
    const { baseKey, ...doc } = await getPsdDocument(email, node);
    return reply({ ...doc, baseUrl: "/media/" + baseKey });
  });
}
export function POST(req: Request) {
  return handle(req, async (email) => {
    if (!sameSiteBiMutation(req)) return reply({ error: "不允许跨站操作" }, 403);
    const input = attach.parse(JSON.parse(await readBounded(new Response(req.body), 4096)));
    return reply({ nodeId: await attachPsdDocument(email, input.operationId, input.sourceId) });
  });
}
export function PATCH(req: Request) {
  return handle(req, async (email) => {
    if (!sameSiteBiMutation(req)) return reply({ error: "不允许跨站操作" }, 403);
    const input = save.parse(JSON.parse(await readBounded(new Response(req.body), 512 * 1024)));
    return reply(await savePsdDocument(email, input.nodeId, input.revision, input.edits));
  });
}
