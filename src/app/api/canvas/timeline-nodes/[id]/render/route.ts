import {NextResponse} from "next/server";
import {z} from "zod";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
import {readBounded} from "@/lib/supplier-cost/io";
import {renderTimelineNode} from "@/lib/canvas/timeline-node-service";
import {timelineNodeIdSchema} from "@/lib/canvas/timeline-node-schema";
import {timelineFailure} from "../../response";

export const runtime = "nodejs", dynamic = "force-dynamic", maxDuration = 120;
const requestSchema = z.strictObject({operationId: z.uuid(), expectedRevision: z.number().int().positive(),billingConfirmation:z.strictObject({version:z.number().int().positive(),credits:z.number().int().nonnegative()}).optional()});
export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return withCreationReceiptRoute(request, async (authenticatedActor) => {
    const actor = await authenticatedEmail(request, authenticatedActor);
    if (!actor) return NextResponse.json({error: "请先登录"}, {status: 401});
    if (!sameSiteBiMutation(request)) return NextResponse.json({error: "不允许跨站修改"}, {status: 403});
    try {
      const id = timelineNodeIdSchema.parse((await context.params).id), input = requestSchema.parse(JSON.parse(await readBounded(new Response(request.body), 8192)));
      return NextResponse.json(await renderTimelineNode(actor, {...input, id}));
    } catch (error) {return timelineFailure(error);}
  });
}
