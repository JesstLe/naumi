import assert from "node:assert/strict";
import baseline from "./fixtures/billing-baseline.json";
import {imageBillCredits as legacyPrice,getCreditPack as legacyPack} from "../src/lib/billing/legacy";
import {fixtureConfig,facts} from "./billing-unit-fixture";
import {quote} from "../src/lib/billing/quote";
const config=fixtureConfig(),imageBillCredits=(q:string,r="1K")=>legacyPrice(config,q,r),getCreditPack=(id:string)=>legacyPack(config,id);

for (const c of baseline.imageCases) assert.equal(c.quantity * imageBillCredits(c.quality,c.resolution),c.credits,`${c.quality}/${c.resolution}`);
for (const c of baseline.fixedCases) assert.equal(quote({version:0,config},facts({feature:c.feature as import("../src/lib/billing/types").FeatureId})).requestedCredits,c.credits,c.feature);
for (const c of baseline.products) {
  const p=getCreditPack(c.id)!;
  assert.equal(p.fen,c.amountFen,c.id);
  assert.equal(p.credits,c.credits,c.id);
}
console.log("PASS existing billing prices and product totals");
