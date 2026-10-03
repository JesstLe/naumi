import assert from "node:assert/strict";
import {
  QUALITY_QUOTES,
  PRICING_PACKAGES,
  IMAGE_TIERS,
  SUITE_BUNDLES,
  budgetCredits,
  yuanFromCredits,
  monthlyStandard2KImages,
} from "../src/lib/pricing";

// Independent fixtures transcribed from 2026-10-02 research workbook columns L/N.
const minima = [
  1.1, 1.69, 4.93, 8.29, 17.87, 1.59, 2.81, 9.38, 16.2, 35.68, 2.24, 4.26,
  15.19, 26.52, 58.9,
];
const protectedRates = [
  1.69, 2.61, 7.61, 12.79, 27.59, 2.45, 4.33, 14.48, 25, 55.08, 3.45, 6.57,
  23.44, 40.93, 90.9,
];
const cheapest = PRICING_PACKAGES[4];
assert.equal(QUALITY_QUOTES.length, 15);
assert.equal(
  new Set(QUALITY_QUOTES.map((q) => `${q.resolution}/${q.quality}`)).size,
  15,
);
QUALITY_QUOTES.forEach((q, i) => {
  assert.equal(q.minimumCredits, minima[i]);
  assert.equal(q.protectedCredits, protectedRates[i]);
  assert.equal(
    budgetCredits(q.variableCostYuan, cheapest, 0),
    minima[i],
    "Break-even formula must reconcile to the workbook",
  );
  assert.equal(
    budgetCredits(q.variableCostYuan, cheapest),
    protectedRates[i],
    "35% scenario must reconcile to the workbook",
  );
  assert.ok(
    ((q.targetCredits * cheapest.priceYuan) / cheapest.credits) * 0.994 <
      q.variableCostYuan,
    "All cheapest-plan target scenarios are loss-making",
  );
  assert.ok(
    ((q.minimumCredits * cheapest.priceYuan) / cheapest.credits) * 0.994 >=
      q.variableCostYuan,
    "Upward rounding must not understate break-even",
  );
});
assert.deepEqual(
  PRICING_PACKAGES.map((p) => [p.priceYuan, p.credits, p.monthlyCredits]),
  [
    [29, 190, 190],
    [99, 775, 775],
    [299, 2500, 2500],
    [1099, 12000, 1000],
    [4499, 60000, 5000],
  ],
);
assert.deepEqual(
  PRICING_PACKAGES.map(monthlyStandard2KImages),
  [47, 193, 625, 250, 1250],
);
assert.equal(
  IMAGE_TIERS[0].model,
  "GPT 2 EXT",
  "Fixed route must not be mislabeled GPT2.5",
);
const standard = PRICING_PACKAGES[1];
assert.equal(yuanFromCredits(4, standard), 0.51);
assert.deepEqual(
  SUITE_BUNDLES.map((s) =>
    yuanFromCredits(s.images * 4 + s.orchestrationCredits, standard),
  ),
  [4.16, 7.82],
);
assert.equal(yuanFromCredits(40.93, cheapest), 3.07);
assert.equal(yuanFromCredits(40.93, standard), 5.23);
console.log(
  "PRICING_PROPOSAL=PASS: source numbers, 15 quality scenarios, rounding, packages and suites reconciled",
);
