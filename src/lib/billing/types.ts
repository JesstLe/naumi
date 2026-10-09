import type { PoolClient } from "pg";
import type { FeatureId } from "./rules/registry";
export type { FeatureId };
export type ExpiryPolicy = {
    unit: "days" | "months" | "years";
    value: number;
};
export type CostRate = {
    currency: "CNY" | "USD" | "credits";
    amountMicros: string;
    unit: "image" | "item" | "task";
    cnyPerUnitMicros?: string;
    source: "manual-estimate" | "legacy-credit-estimate";
};
export type Pricing = import("./api-cost").ApiCostPricing | {
    mode: "matrix";
    prices: Record<string, Record<string, number | null>>;
} | {
    mode: "fixed";
    credits: number;
} | {
    mode: "quality-resolution";
    quality: Record<string, number>;
    resolutionExtra: Record<string, number>;
} | {
    mode: "tiers";
    dimension: "quantity" | "resolution" | "quality";
    prices: Record<string, number>;
} | {
    mode: "cost-plus";
    costKey: string;
    creditsPerCnyMicros: string;
    factorBps: number;
    rounding: "ceil" | "floor" | "nearest";
    minimum: number;
    maximum: number;
} | {
    mode: "cny-fixed";
    amountMicros: string;
    creditsPerCnyMicros: string;
    rounding: "ceil" | "floor" | "nearest";
    variants?: { quality?: string; resolution?: string; amountMicros: string }[];
} | {
    mode: "usage";
    inputMicrosPerMillion: string;
    outputMicrosPerMillion: string;
    cachedInputMicrosPerMillion?: string;
    imageInputMicrosPerMillion?: string;
    authorizationCnyMicros: string;
    creditsPerCnyMicros: string;
    rounding: "ceil" | "floor" | "nearest";
};
export type SettlementPolicy = {
    qualityBasis: "requested" | "executed";
    successBasis: "successful-units" | "whole-request";
    failureBps: number;
    byokBps: number;
    reserveBps: number;
    unknown: "hold" | "manual";
};
export type BillingFacts = {
    ratio?: string;
    feature: FeatureId;
    quantity: number;
    quality: string;
    resolution: string;
    providerId?: string;
    modelId?: string;
    fallbackProviderId?: string;
    fallbackModelId?: string;
    metered: boolean;
    byok: boolean;
    paidFen: number;
    userGroup: string;
};
export type RuleCondition = {
    quality?: string[];
    resolution?: string[];
    byok?: boolean;
    userGroup?: string[];
    minQuantity?: number;
    maxQuantity?: number;
    minPaidFen?: number;
    providerId?: string[];
    modelId?: string[];
};
export type Rule = {
    id: string;
    priority: number;
    when: RuleCondition;
    pricing?: Pricing;
    settlement?: Partial<SettlementPolicy>;
};
export type FeatureTariff = {
    label: string;
    enabled: boolean;
    unit: "image" | "item" | "task";
    pricing: Pricing;
    settlement: SettlementPolicy;
    rules: Rule[];
};
export type BillingProduct = {
    id: string;
    kind: "pack" | "pro" | "plan-display";
    title: string;
    amountFen: number;
    baseCredits: number;
    bonusCredits: number;
    available: boolean;
    expiry: ExpiryPolicy;
};
export type BillingConfig = {
    schemaVersion: 1;
    features: Record<FeatureId, FeatureTariff>;
    costs: Record<string, CostRate>;
    products: Record<string, BillingProduct>;
    credits: {
        signup: {
            amount: number;
            expiry: ExpiryPolicy;
        };
        purchase: ExpiryPolicy;
        redeem: ExpiryPolicy;
        admin: ExpiryPolicy;
        debitOrder: "expires-first" | "created-first";
        staleReservationMinutes: number;
    };
    switches: {
        metering: "legacy-auto" | "on" | "off";
        commerce: boolean;
        recharge: boolean;
    };
    thresholds: {
        highQualityPaidFen: number;
        agentConfirmCredits: number;
    };
};
export type ConfigSnapshot = {
    version: number;
    config: BillingConfig;
};
export type BillingQuote = {
    refundExpiry?: ExpiryPolicy;
    imagePreset?: import("../model-config/image-preset").ImagePreset;
    requestedParameters?: import("../model-config/image-preset").ImageParameters;
    effectiveParameters?: import("../model-config/image-preset").ImageParameters;
    modelVersion?: number;
    procurement?: import("../model-config/business-schema").Procurement;
    legacyCompatible?: boolean;
    staleReservationMinutes?:number;
    debitOrder?: "expires-first" | "created-first";
    schemaVersion: 1;
    configVersion: number;
    engineVersion: 1;
    facts: BillingFacts;
    tariff: FeatureTariff;
    costRates: Record<string, CostRate>;
    requestedCredits: number;
    authorizedCredits: number;
    reserveCredits: number;
    matchedRuleId: string | null;
};
export type BillingResult = {
    apiCost?: { status: "reported" | "estimated" | "pending"; numerator?: string; denominator?: string; source: string; callIds: string[] };
    usage?: { inputTokens: number; outputTokens: number; cachedInputTokens?: number; imageInputTokens?: number };
    state: "succeeded" | "failed" | "unknown";
    items: {
        id: string;
        state: "succeeded" | "failed" | "unknown";
        executedQuality?: string;
        platformFunded?: boolean;
    }[];
};
export type Settlement = {
    state: "settle" | "hold" | "manual";
    charge: number;
    release: number;
};
export type CostEstimate = {
    currency: "CNY" | "USD" | "credits";
    amountMicros: string;
    source: string;
    actual: boolean;
};
export type Tx = PoolClient;
export type OperationInput = {
    id: string;
    email: string;
    quote: BillingQuote;
    reason: string;
    ledgerId: string;
    fingerprint: string;
};
export type GrantInput = {
    id: string;
    email: string;
    amount: number;
    source: "purchase" | "grant" | "migrate" | "admin";
    reason: string;
    expiry: ExpiryPolicy;
    orderId?: string;
    expiresAt?: string;
    debitOrder?: "expires-first" | "created-first";
    ledgerId: string;
    fingerprint: string;
    actor: string;
};
export type AdjustmentInput = GrantInput;
export type BillingService = {
    reconcileTx(tx:Tx,input:{id:string;operationId:string;actor:string;reason:string;proof:string;result:BillingResult}):Promise<{replayed:boolean;charge:number}>;
    reserveTx(tx: Tx, input: OperationInput): Promise<{
        replayed: boolean;
    }>;
    settleTx(tx: Tx, input: OperationInput, result: BillingResult): Promise<{
        replayed: boolean;
        charge: number;
        state?: "settled" | "released" | "manual" | "hold";
    }>;
    releaseTx(tx: Tx, input: OperationInput): Promise<{
        replayed: boolean;
    }>;
    grantTx(tx: Tx, input: GrantInput): Promise<{
        replayed: boolean;
    }>;
    adjustTx(tx: Tx, input: AdjustmentInput): Promise<{
        replayed: boolean;
    }>;
};
export type ConfigRuntime = {
    current(): Promise<ConfigSnapshot>;
    history(limit: number): Promise<{
        version: number;
        actor: string;
        createdAt: string;
        reason: string;
    }[]>;
    byVersion(version: number): Promise<ConfigSnapshot>;
    publish(input: {
        id: string;
        expectedVersion: number;
        expectedModelVersion?: number;
        config: BillingConfig;
        actor: string;
        reason: string;
    }): Promise<ConfigSnapshot>;
    restore(input: {
        id: string;
        expectedVersion: number;
        targetVersion: number;
        actor: string;
        reason: string;
    }): Promise<ConfigSnapshot>;
};
export type BillingErrorCode = "INVALID_CONFIG" | "CONFIG_CONFLICT" | "CONFIG_UNAVAILABLE" | "PRICE_CHANGED" | "INSUFFICIENT_CREDITS" | "OPERATION_CONFLICT" | "INVALID_RESULT" | "AUTHORIZATION_EXCEEDED";
export class BillingError extends Error {
    constructor(public code: BillingErrorCode, message: string, public status = 409) { super(message); this.name = "BillingError"; }
}
