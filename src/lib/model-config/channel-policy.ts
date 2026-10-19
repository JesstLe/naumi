import { applicationAPIMartImages } from "./apimart-image-policy";
import { z } from "zod";
import type { ModelConfig, PublicModel } from "./types";
import { ModelConfigError } from "./types";
import { imageModelDisplayId } from "../image-model-routing";
export const channelPolicySchema = z.strictObject({ mode: z.enum(["priority", "balanced"]), channels: z.array(z.strictObject({ upstreamId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/), enabled: z.boolean(), priority: z.number().int().min(1).max(100), weight: z.number().int().min(1).max(1000) })).min(1).max(20) });
export type ChannelPolicy = z.infer<typeof channelPolicySchema>;
export const CHANNEL_PROTOCOLS = ["openai-images", "new-api-flow", "openai-chat"];
export function channelProtocol(protocol: string, parameterMap?: {apimartImages?: unknown}) { return CHANNEL_PROTOCOLS.includes(protocol) || applicationAPIMartImages(protocol,parameterMap); }
export function publicUpstreamIds(config: ModelConfig, model: PublicModel) { return model.supplierRouting ? model.supplierRouting.channels.filter(c => c.enabled).map(c => c.upstreamId) : model.target.type === "upstream" ? [model.target.id] : config.pools.find(p => p.id === model.target.id)?.candidates || []; }
export function validateChannelPolicies(config: ModelConfig) {
    for (const m of config.publicModels) {
        const policy = m.supplierRouting;
        if (!policy)
            continue;
        if (!["image","text"].includes(m.modality) || m.target.type !== "upstream" || config.defaultImagePreset?.enabled && config.defaultImagePreset.aliases.some(a => a.id === m.id))
            throw new ModelConfigError("INVALID_CONFIG", "供应通道适用于直连图片或文字模型，不能覆盖成本预设或外部路由池");
        const primary=config.upstreamModels.find(u=>u.id===m.target.id), primaryProvider=config.providers.find(p=>p.id===primary?.providerId);
        if(!primaryProvider||!channelProtocol(primaryProvider.protocol,primary?.parameterMap))throw new ModelConfigError("INVALID_CONFIG","家族主目标需要使用已接通的应用内协议");
        if (new Set(policy.channels.map(c => c.upstreamId)).size !== policy.channels.length || !policy.channels.some(c => c.enabled))
            throw new ModelConfigError("INVALID_CONFIG", "供应通道不能重复，至少启用一条");
        for (const ch of policy.channels) {
            const u = config.upstreamModels.find(u => u.id === ch.upstreamId), p = config.providers.find(p => p.id === u?.providerId);
            if (!u || u.modality !== m.modality || !p || !channelProtocol(p.protocol,u.parameterMap) || (m.modality==="text")!==(p.protocol==="openai-chat") || ch.enabled && (!u.enabled || !p.enabled || !p.credentialRef))
                throw new ModelConfigError("INVALID_CONFIG", "供应通道不存在、未启用或协议不兼容");
            if(ch.enabled&&m.modality==="text"&&!u.capabilities.generate)throw new ModelConfigError("INVALID_CONFIG","文字供应通道需要支持文字生成");
        }
        for (const f of Object.values(config.business || {}))
            if (f?.options.some(o => o.enabled && o.modelId === m.id && o.routing?.enabled))
                throw new ModelConfigError("INVALID_CONFIG", "请先停用该模型的工具阶段路由，再启用供应通道");
    }
}
export function channelEditable(config: ModelConfig, ids: string[]) { const models = config.publicModels.filter(m => ids.includes(m.id)); return models.length > 0 && models.every(m => ["image","text"].includes(m.modality) && m.target.type === "upstream") && models.every(m => !config.defaultImagePreset?.enabled || !config.defaultImagePreset.aliases.some(a => a.id === m.id)) && models.every(m => {const u=config.upstreamModels.find(u=>u.id===m.target.id);return channelProtocol(config.providers.find(p=>p.id===u?.providerId)?.protocol || "",u?.parameterMap);}); }
export function applyChannelPolicy(source: ModelConfig, row: {
    id: string;
    publicIds: string[];
}, raw: unknown) { if (!channelEditable(source, row.publicIds))
    throw new ModelConfigError("MODEL_CHANNEL_ADAPTER", "此模型采用成本预设或外部适配器，暂不能统一供应通道", 400); const config = structuredClone(source), policy = raw === null ? null : channelPolicySchema.parse(raw); for (const m of config.publicModels)
    if (row.publicIds.includes(m.id) || m.modality === "image" && imageModelDisplayId(m.id) === row.id) {
        if (policy) {
            const oldTargets = new Set(config.publicModels.filter(v => row.publicIds.includes(v.id)).map(v => v.target.id));
            m.supplierRouting = { ...structuredClone(policy), channels: policy.channels.map(c => ({ ...c, upstreamId: oldTargets.has(c.upstreamId) ? m.target.id : c.upstreamId })) };
        }
        else
            delete m.supplierRouting;
    } validateChannelPolicies(config); return config; }
