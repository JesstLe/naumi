import {NextResponse} from "next/server";
import {z} from "zod";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {withCreationRoute} from "@/lib/saas/creation-context";
import {readBounded} from "@/lib/supplier-cost/io";
import {renderAudioNode} from "@/lib/canvas/audio-node-service";
import {audioNodeIdSchema} from "@/lib/audio/project";
import {audioFailure} from "../../response";

export const runtime = "nodejs", dynamic = "force-dynamic", maxDuration = 120;
const requestSchema = z.strictObject({operationId: z.uuid(), expectedRevision: z.number().int().positive()});
export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return withCreationRoute(request, async () => {
    const actor = await authenticatedEmail(request);
    if (!actor) return NextResponse.json({error: "请先登录"}, {status: 401});
    if (!sameSiteBiMutation(request)) return NextResponse.json({error: "不允许跨站修改"}, {status: 403});
    try {
      const id = audioNodeIdSchema.parse((await context.params).id), input = requestSchema.parse(JSON.parse(await readBounded(new Response(request.body), 8192)));
      return NextResponse.json(await renderAudioNode(actor, {...input, id}));
    } catch (error) {return audioFailure(error);}
  });
}
