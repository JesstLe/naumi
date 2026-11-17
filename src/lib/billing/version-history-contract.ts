export const BILLING_HISTORY_CURSOR_HEADER = 'X-Naumi-Billing-Next-Version';
export const BILLING_HISTORY_PAGE_SIZE = 50;

export type BillingVersionSummary = {
    version: number;
    actor: string;
    reason: string;
    createdAt: string;
};
