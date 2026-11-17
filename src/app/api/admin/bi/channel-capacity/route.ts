import { z } from "zod";
import { biAuthorize, biJson, sameSiteBiMutation } from "@/lib/bi/access";
import { appendManagementLogAfterChange } from "@/lib/bi/management-log";
import { getModelAdministration } from "@/lib/model-config/server";
import { resetProviderBudget } from "@/lib/model-config/capacity";
import { resetChannelProbes } from "@/lib/model-config/channel-scheduler";
import { readChannelCapacity } from "@/lib/model-config/capacity-read";
import { ReportReadBusy } from "@/platform/db/owned-read-client";
export const runtime = "nodejs", dynamic = "force-dynamic";

export async function GET(request: Request) {
    const auth = await biAuthorize(request);
    if (auth instanceof Response) return auth;
    try {
        return biJson(await readChannelCapacity(request.signal));
    }
    catch (error) {
        if(request.signal.aborted)return biJson({error:"查询已取消"},499);
        const response=biJson({error:"通道与容量数据暂不可用",code:"CHANNEL_CAPACITY_UNAVAILABLE"},503);
        if(error instanceof ReportReadBusy)response.headers.set("Retry-After","1");
        return response;
    }
}

const idField = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/), reasonField = z.string().trim().min(3).max(500);
const mutationInput = z.discriminatedUnion("action", [
    z.strictObject({ action: z.literal("reset-budget"), providerId: idField, reason: reasonField }),
    z.strictObject({ action: z.literal("clear-channel-probe"), providerId: idField, upstreamId: idField, reason: reasonField }),
]);
export async function POST(request: Request) {
    const auth = await biAuthorize(request);
    if (auth instanceof Response) return auth;
    if (!sameSiteBiMutation(request)) return biJson({ error: "不允许跨站修改" }, 403);
    let input: z.infer<typeof mutationInput>;
    try {
        input = mutationInput.parse(await request.json());
    }
    catch {
        return biJson({ error: "操作参数无效" }, 400);
    }
    try {
        const admin = await getModelAdministration(), snapshot = await admin.repo.current();
        if (input.action === "reset-budget") {
            const result = await resetProviderBudget(admin.pool, input.providerId, snapshot.config);
            // Persistent audit under 系统与审计 → 管理日志; a logging failure
            // never turns the completed change into an error response.
            void appendManagementLogAfterChange({
                actor: auth.actor, subject: `provider:${input.providerId}`, action: "channel-budget-reset",
                reason: input.reason, changes: { providerId: result.providerId, identity: result.identity, previous: result.previous, restored: result.restored, changed: result.changed },
            });
            return biJson({ actor: auth.actor, reason: input.reason, ...result });
        }
        const result = await resetChannelProbes(admin.pool, input.providerId, input.upstreamId, snapshot.config);
        void appendManagementLogAfterChange({
            actor: auth.actor, subject: `channel:${input.upstreamId}`, action: "channel-probe-reset",
            reason: input.reason, changes: { providerId: result.providerId, upstreamId: result.upstreamId, wireModel: result.wireModel, previous: result.previous, cleared: result.cleared },
        });
        return biJson({ actor: auth.actor, reason: input.reason, ...result });
    }
    catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code === "PROVIDER_UNAVAILABLE" || code === "BUDGET_UNAVAILABLE")
            return biJson({ error: (error as Error).message, code }, code === "PROVIDER_UNAVAILABLE" ? 404 : 409);
        if (code === "CHANNEL_UNAVAILABLE")
            return biJson({ error: (error as Error).message, code }, 404);
        return biJson({ error: "操作暂不可用，请稍后重试", code: "CHANNEL_CAPACITY_MUTATION_UNAVAILABLE" }, 503);
    }
}
