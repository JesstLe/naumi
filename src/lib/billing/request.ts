import { randomUUID } from "node:crypto";
import { BillingError, type BillingQuote } from "./types";
import { billingJson } from "./access";
import {billingFailure} from "./failure";
export {billingFailure} from "./failure";
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
export function billingErrorResponse(error: unknown) {
    const {status,...body}=billingFailure(error);
    return billingJson(body,status);
}
