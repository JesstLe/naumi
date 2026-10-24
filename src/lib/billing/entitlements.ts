import "server-only";
import { randomUUID } from "node:crypto";
import {getBillingRuntime} from "@/lib/billing/runtime";
import { fingerprint } from "./fingerprint";
import type { GrantInput, Tx, ConfigSnapshot, ExpiryPolicy } from "./types";
export async function signupGrantTx(tx: Tx, email: string, snapshot: ConfigSnapshot) {
    const policy = snapshot.config.credits.signup;
    if (policy.amount <= 0)
        return;
    const id = `signup-${fingerprint(email)}`;
    await (await getBillingRuntime()).service.grantTx(tx, { id, email, amount: policy.amount, source: "grant", reason: "新人赠送", expiry: policy.expiry,
        ledgerId: `led-${id}`, actor: "signup", fingerprint: String(snapshot.version) });
}
export async function administrativeGrantInput(tx: Tx, input: {
    email: string;
    amount: number;
    reason: string;
    actor: string;
    id?: string;
    expiry?: ExpiryPolicy;
    source?: GrantInput["source"];
    expiresAt?: string;
    orderId?: string;
}, snapshot: ConfigSnapshot): Promise<GrantInput> {
    const id = input.id ?? randomUUID(), operationId = `admin-${id}`;
    const previous = (await tx.query("SELECT quote FROM app_billing_operations WHERE id=$1", [operationId])).rows[0]?.quote as GrantInput | undefined;
    const expiry = input.expiry ?? previous?.expiry ?? (input.source === "purchase" ? snapshot.config.credits.purchase : snapshot.config.credits.admin);
    return { id: operationId, email: input.email, amount: input.amount, reason: input.reason, actor: input.actor, source: input.source ?? "admin", expiry,
        debitOrder: previous?.debitOrder ?? snapshot.config.credits.debitOrder,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}), ...(input.orderId ? { orderId: input.orderId } : {}), ledgerId: `led-${operationId}`,
        fingerprint: fingerprint({ email: input.email, amount: input.amount, reason: input.reason, actor: input.actor, expiry: input.expiry, source: input.source, expiresAt: input.expiresAt, orderId: input.orderId }) };
}
