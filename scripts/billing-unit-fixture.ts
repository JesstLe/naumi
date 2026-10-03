import seed from "../src/lib/billing/bootstrap.json";
import { validateBillingConfig } from "../src/lib/billing/rules/schema";
import type { BillingFacts, BillingConfig } from "../src/lib/billing/types";
export function fixtureConfig(): BillingConfig { return validateBillingConfig(structuredClone(seed)); }
export function facts(overrides: Partial<BillingFacts> = {}): BillingFacts { return { feature: "image.generate", quantity: 1, quality: "medium", resolution: "1K", metered: true, byok: false, paidFen: 0, userGroup: "user", ...overrides }; }
