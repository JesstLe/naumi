import type { Procurement } from "../model-config/business-schema";
export type CostStatus = "pending" | "estimated" | "reported" | "reconciled";
export type FxSnapshot = { currency: "USD" | "CNY"; rateMicros: string; basis: "recharge" | "admin-rate" | "budget"; evidence: string; updatedAt: string };
export type CostContext = { operationId: string; orderId?: string; userEmail?: string; feature: string; publicModelId?: string; modelVersion?: number; billingVersion?: number; phase: string; matchedRuleId?: string; parentCallId?: string };
export type CostReceipt = {
  state: string; taskId?: string; requestId?: string; actualModel?: string; amountMicros?: string | null;
  currency?: "USD" | "CNY"; creditsMicros?: string | null; usage?: Record<string, unknown> | null;
  status: CostStatus; completedAt?: string; postingTimeKnown?: boolean; delivered?: number;
  source: string; evidence: Record<string, unknown>;
  outputs?: { index: number; supplierRefHash?: string; state: string }[];
};
export type AccountInput = { id: string; providerId: string; protocol: string; baseUrl: string; credentialRef?: string; label?: string };
export type CallInput = CostContext & { id?: string; attemptId: string; taskId?: string; accountId: string; providerId: string; model: string; procurement?: Procurement; fx?: FxSnapshot | null; startedAt?: string };
export type CostFilter = { email?: string; feature?: string; publicModel?: string; model?: string; operation?: string; order?: string; account?: string; status?: CostStatus; from?: string; to?: string; page?: number };
