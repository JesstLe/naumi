import "server-only";
import { getBillingRuntime, quoteForRequest } from "./server";
import type { BillingQuote, FeatureId } from "./types";
import { dbEnabled, getUser } from "@/lib/db";
import { fingerprint, stableJson } from "./fingerprint";
import { getImageJob } from "@/lib/image-job-repository";
export const AGENT_FEATURES: Record<string, {
    feature: FeatureId;
    label: string;
}> = { generate_aplus: { feature: "image.aplus", label: "A+ 母图准备" }, generate_image: { feature: "image.generate", label: "AI 生图" }, retouch_product: { feature: "tool.retouch", label: "商品精修" }, recolor_product: { feature: "tool.recolor", label: "产品换色" }, replicate_hot: { feature: "tool.replicate", label: "爆款复刻" }, generate_suite: { feature: "image.suite", label: "商品套图" }, continue_aplus_generation: { feature: "image.aplus", label: "A+ 详情页" }, generate_packaging_3d: { feature: "tool.packaging3d", label: "包装 3D" }, generate_video: { feature: "video.generate", label: "视频生成" }, extend_video: { feature: "video.generate", label: "视频续写" }, edit_video: { feature: "video.generate", label: "视频编辑" } };
export async function agentQuote(name: string, args: Record<string, any>, email: string, cred: {
    cookie: string;
    authorization: string;
    imageQuality?: string;
}): Promise<{
    quote: Pick<BillingQuote, "configVersion" | "requestedCredits">;
    label: string;
    threshold: number;
} | null> {
    const entry = AGENT_FEATURES[name];
    if (!entry)
        return null;
    const runtime = await getBillingRuntime(), threshold = (await runtime.config.current()).config.thresholds.agentConfirmCredits;
    if (name === "continue_aplus_generation") {
        const job = await getImageJob(String(args.job_id || ""), "aplus");
        if (!job || job.email !== email.toLowerCase())
            throw new Error("详情页任务不存在或无权访问");
        const frozen = job.payload.billingQuote as BillingQuote | undefined;
        if (frozen)
            return { quote: frozen, label: entry.label, threshold };
        return { quote: { configVersion: 0, requestedCredits: Number(job.snapshot.cost || 0) }, label: entry.label, threshold };
    }
    const quantity = name === "generate_aplus" ? (Array.isArray(args.modules) && args.modules.length ? args.modules.length : 4) : name === "generate_image" ? Math.min(4, Math.max(1, Number(args.count) || 1)) : name === "generate_suite" ? (args.structure === "custom" && Array.isArray(args.shots) ? Math.max(1, Math.min(20, args.shots.length)) : 13) : 1;
    const request = new Request("http://internal/api/billing/quote", { headers: { cookie: cred.cookie, authorization: cred.authorization, "x-naumi-image-quality": cred.imageQuality || "medium" } });
    return { quote: await quoteForRequest(request, { feature: entry.feature, quantity, quality: args.quality || cred.imageQuality || "medium", resolution: args.resolution || "1K", modelId: args.model || args.modelId, providerId: args.providerId, ratio: args.ratio }), label: entry.label, threshold };
}
export type AgentBillingSession = {
    email: string;
    cred: {
        cookie: string;
        authorization: string;
        imageQuality?: string;
    };
    id: string;
    pendingQuotes?: Map<string, Pick<BillingQuote, "configVersion" | "requestedCredits">>;
    preparedBilling?: {
        billingVersion: number;
        billingCredits: number;
        billingOperationId: string;
    };
};
export async function agentBillingPrecheck(session: AgentBillingSession, name: string, args: Record<string, unknown>, callId: string) {
    session.preparedBilling = undefined;
    if (!dbEnabled)
        return undefined;
    let quoted;
    try {
        quoted = await agentQuote(name, args as Record<string, any>, session.email, session.cred);
    }
    catch (error) {
        return { block: true, reason: error instanceof Error ? error.message : "报价暂不可用" };
    }
    if (!quoted)
        return undefined;
    const meta = { cost: name === "generate_aplus" ? 0 : quoted.quote.requestedCredits, label: quoted.label };
    const pricingArgs = { ...args as Record<string, unknown> };
    delete pricingArgs.confirm;
    const quoteKey = name + ":" + stableJson(pricingArgs), previous = session.pendingQuotes?.get(quoteKey);
    session.pendingQuotes ??= new Map();
    session.pendingQuotes.set(quoteKey, quoted.quote);
    if ((args as {
        confirm?: unknown;
    }).confirm === true && previous && (previous.configVersion !== quoted.quote.configVersion || previous.requestedCredits !== quoted.quote.requestedCredits))
        return { block: true, reason: `价格已更新，本次需要 ${meta.cost} 积分。请重新向用户报价并等待明确同意。` };
    session.preparedBilling = { billingVersion: quoted.quote.configVersion, billingCredits: quoted.quote.requestedCredits, billingOperationId: fingerprint({ session: session.id, call: callId }) };
    const u = await getUser(session.email);
    if (!u)
        return { block: true, reason: "积分账户不可用，请先登录后重试" };
    const balance = u.creditsTotal - u.creditsUsed;
    if (balance < meta.cost) {
        return {
            block: true,
            reason: `余额不足:「${meta.label}」需要约 ${meta.cost} 积分,当前余额 ${balance}。请先充值或减少任务规模。`,
            terminate: true,
        };
    }
    // 大额确认闸:报价 → 用户同意 → confirm=true 放行。
    // 拦截发生在余额检查之后,报价文案可以带上真实余额。
    if (meta.cost >= quoted.threshold &&
        (args as {
            confirm?: unknown;
        }).confirm !== true) {
        return {
            block: true,
            reason: `本次「${meta.label}」预计消耗约 ${meta.cost} 积分(当前余额 ${balance})。请先用一句话向用户报出这笔花费并等待明确同意;用户同意后,携带参数 confirm=true 重新调用本工具;用户拒绝或未回复就不要执行,可给出更小规模的替代方案。不要在未获得用户同意的情况下自行携带 confirm=true。`,
        };
    }
    return undefined;
}
