import assert from "node:assert/strict";
import baseline from "./fixtures/billing-baseline.json";
import { imageBillCredits, getCreditPack, TOOL_COST } from "../src/lib/mock-data";

for (const c of baseline.imageCases) assert.equal(c.quantity * imageBillCredits(c.quality,c.resolution),c.credits,`${c.quality}/${c.resolution}`);
for (const c of baseline.fixedCases) assert.equal(TOOL_COST[c.feature.split(".")[1] as keyof typeof TOOL_COST],c.credits,c.feature);
for (const c of baseline.products) {
  const p=getCreditPack(c.id)!;
  assert.equal(p.fen,c.amountFen,c.id);
  assert.equal(p.credits,c.credits,c.id);
}
console.log("PASS existing billing prices and product totals");
