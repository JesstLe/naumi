import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Offline guardrails for the quote preview. No server, credentials or paid API.
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exports = {};
const compiled = ts.transpileModule(source("src/components/pricing/pricing-catalog.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
new Function("exports", compiled)(exports);
assert.deepEqual(exports.PRICING_PLANS.month.map(({ price, beans }) => [price, beans]), [
  [29, 190], [99, 775], [299, 2500],
]);
assert.deepEqual(exports.PRICING_PLANS.year.map(({ price, beans }) => [price, beans]), [
  [1099, 12000], [4499, 60000],
]);
const page = source("src/components/pricing/pricing-page.tsx");
assert(!/fetch\(|openRecharge|CreditPacks|account\?tab=credits|mailto:/.test(page), "Quote page must not use checkout or invent contact details");
assert(page.includes('href="/contact"'), "Use the existing contact route");
assert(page.includes("aria-pressed") && page.includes("<details") && page.includes("focus-visible:ring-2"));
assert(page.includes("报价预览") && page.includes("待确认"));
assert(!/tier\.cost|1 豆 = 1 积分/.test(page), "Do not equate unconfirmed quote units with current billing");
const route = source("src/app/plans/page.tsx");
assert(route.includes('if (!pricingVisible) notFound()'));
assert(source('src/components/landing/pricing.tsx').includes('!commerceVisible || !pricingVisible'));
assert(route.includes('if (!publicCommerceEnabled) redirect("/")'));
assert(!route.includes('editionName'), 'Do not restore retired edition gates');
assert(!route.includes('redirect("/account?tab=credits")'));
console.log("PASS: five exact plan prices and allowances; quote-only CTA; accessibility markup; unconfirmed billing guardrails; current public pricing and commerce gates preserved.");
console.log("This offline check does not replace browser interaction or visual QA.");
