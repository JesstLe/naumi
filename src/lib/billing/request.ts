import { randomUUID } from "node:crypto";
import { BillingError, type BillingQuote } from "./types";
import { billingJson } from "./access";
import { ModelConfigError } from "../model-config/types";
export function assertQuotedVersion(client: {
    version?: number;
    credits?: number;
}, current: BillingQuote) {
    if (client.version === undefined && client.credits === undefined && (current.legacyCompatible === true || current.authorizedCredits === 0))
        return; // Compatibility is permitted only for verified unchanged terms.
    if (client.version !== current.configVersion || client.credits !== (current.tariff.pricing.mode==="api-cost-plus"?current.authorizedCredits:current.requestedCredits))
        throw new BillingError("PRICE_CHANGED", "价格已更新，请确认最新报价后重试", 409);
}
export function requestQuoteConfirmation(request: Request, body?: {
    billingVersion?: unknown;
    billingCredits?: unknown;
}) {
    const version = body?.billingVersion ?? request.headers.get("x-naumi-billing-version"), credits = body?.billingCredits ?? request.headers.get("x-naumi-billing-credits");
    return { version: version == null ? undefined : Number(version), credits: credits == null ? undefined : Number(credits) };
}
export function operationIdFor(request: Request, explicit?: string) {
    const id = explicit || request.headers.get("x-naumi-billing-operation-id");
    if (!id)
        return randomUUID();
    if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id))
        throw new BillingError("INVALID_RESULT", "计费操作编号无效", 400);
    return id;
}
export function billingErrorResponse(error: unknown) {
    if (error instanceof ModelConfigError)
        return billingJson({ error: error.message, code: error.code }, error.status);
    if (error instanceof BillingError)
        return billingJson({ error: error.message, code: error.code }, error.status);
    return billingJson({ error: "计费服务暂时不可用，请稍后重试" }, 503);
}
