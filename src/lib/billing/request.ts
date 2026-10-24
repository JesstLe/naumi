import { randomUUID } from "node:crypto";
import { BillingError, type BillingQuote } from "./types";
import { billingJson } from "./access";
import { ModelConfigError } from "../model-config/types";
/** Compatibility entry point. The server quote, not browser echoes, prices a
 * creation. Wallet reservation and operation identity are checked separately. */
export function assertQuotedVersion(_client: {
    version?: number;
    credits?: number;
}, current: BillingQuote) {
    return current;
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
/** Transport-neutral error projection shared by HTTP and trusted typed callers. */
export function billingFailure(error: unknown): {status:number;error:string;code?:string;accepted?:false} {
    if (error instanceof ModelConfigError)
        return {status:error.status,error:error.message,code:error.code,...(error.code==="IMAGE_QUOTE_EXPIRED"?{accepted:false as const}:{})};
    if (error instanceof BillingError)
        return {status:error.status,error:error.message,code:error.code};
    return {status:503,error:"计费服务暂时不可用，请稍后重试"};
}
export function billingErrorResponse(error: unknown) {
    const {status,...body}=billingFailure(error);
    return billingJson(body,status);
}
