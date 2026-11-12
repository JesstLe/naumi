import { z } from "zod";
import { biAuthorize, biJson, sameSiteBiMutation } from "@/lib/bi/access";
import { getModelAdministration } from "@/lib/model-config/server";
import { providerCapacityDetail, resetProviderBudget, type ProviderCapacityDetail } from "@/lib/model-config/capacity";
import { channelHealthSummary } from "@/lib/model-config/channel-scheduler";
export const runtime = "nodejs", dynamic = "force-dynamic";

type ChannelRow = {
    upstreamId: string; providerId: string; providerName: string; wireModel: string; enabled: boolean;
    state: string; failures: number; retryAt: string | null; lastStatus: number | null; failureKind: string | null;
};
export type ChannelCapacityOverview = {
    configVersion: number; generatedAt: string;
    providers: ProviderCapacityDetail[]; channels: ChannelRow[];
};

export async function GET(request: Request) {
    const auth = await biAuthorize(request);
    if (auth instanceof Response) return auth;
    try {
        const admin = await getModelAdministration(), snapshot = await admin.repo.current();
        const [providers, health] = await Promise.all([
            providerCapacityDetail(admin.pool, snapshot.config),
            channelHealthSummary(admin.pool, snapshot.config),
        ]);
        const channels: ChannelRow[] = snapshot.config.upstreamModels.map(u => {
            const observed = health[u.id], provider = snapshot.config.providers.find(p => p.id === u.providerId);
            return {
                upstreamId: u.id, providerId: u.providerId, providerName: provider?.name || u.providerId,
                wireModel: u.model, enabled: provider?.enabled ?? false,
                state: observed?.state || "unobserved", failures: observed?.failures || 0,
                retryAt: observed?.retryAt || null, lastStatus: observed?.lastStatus ?? null,
                failureKind: observed?.failureKind || null,
            };
        });
        return biJson({ configVersion: snapshot.version, generatedAt: new Date().toISOString(), providers, channels } satisfies ChannelCapacityOverview);
    }
    catch {
        return biJson({ error: "通道与容量数据暂不可用", code: "CHANNEL_CAPACITY_UNAVAILABLE" }, 503);
    }
}

const resetInput = z.strictObject({
    providerId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/),
    reason: z.string().trim().min(3).max(500),
});
export async function POST(request: Request) {
    const auth = await biAuthorize(request);
    if (auth instanceof Response) return auth;
    if (!sameSiteBiMutation(request)) return biJson({ error: "不允许跨站修改" }, 403);
    let input: z.infer<typeof resetInput>;
    try {
        input = resetInput.parse(await request.json());
    }
    catch {
        return biJson({ error: "重置参数无效" }, 400);
    }
    try {
        const admin = await getModelAdministration(), snapshot = await admin.repo.current();
        const result = await resetProviderBudget(admin.pool, input.providerId, snapshot.config);
        return biJson({ actor: auth.actor, reason: input.reason, ...result });
    }
    catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code === "PROVIDER_UNAVAILABLE" || code === "BUDGET_UNAVAILABLE")
            return biJson({ error: (error as Error).message, code }, code === "PROVIDER_UNAVAILABLE" ? 404 : 409);
        return biJson({ error: "预算重置暂不可用", code: "BUDGET_RESET_UNAVAILABLE" }, 503);
    }
}
