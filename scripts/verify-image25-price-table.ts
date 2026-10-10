import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  buildImage25PriceTable, IMAGE25_QUALITIES, IMAGE25_TIERS, IMAGE25_NATIVE_MODELS,
  priceTableConversion, image25TablePayload, usdNanos, decimalNanos,
  IMAGE25_BUDGET_FX, type TableConversion,
} from "../src/lib/model-config/image25-price-table";

async function main() {
  const raw = await readFile("docs/apimart-image25-pricing-20261008.json", "utf8"), source = JSON.parse(raw);
  const before = createHash("sha256").update(raw).digest("hex");
  const rows = buildImage25PriceTable();
  assert.equal(rows.length, 45);
  assert.equal(new Set(rows.map(r => `${r.resolution}:${r.ratio}`)).size, 45);
  assert.deepEqual(IMAGE25_NATIVE_MODELS, ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]);
  let comparisons = 0;
  for (const [i, row] of Array.from(rows.entries())) {
    assert.equal(row.ratio, source.native.output_reference_matrix[i].size);
    assert.equal(row.pixels, source.native.output_reference_matrix[i].pixels);
    for (const q of IMAGE25_QUALITIES) for (const tier of IMAGE25_TIERS) {
      const cell = row.prices[q][tier];
      assert.equal(cell.outputTokens, source.native.output_reference_matrix[i].qualities[q].output_tokens_reference);
      assert.equal(cell.outputUsd, source.native.output_reference_matrix[i].qualities[q].output_only_usd_estimate[tier]);
      assert.equal(usdNanos(cell.saleUsd), usdNanos(cell.outputUsd) * BigInt(3));
      // Independent million-token equation, not reusing the table's price.
      const rateText = source.native.usd_per_million_tokens[tier].image_output;
      const [whole, fraction = ""] = rateText.split(".");
      const rateTenths = BigInt(whole) * BigInt(10) + BigInt(fraction || "0");
      assert.equal(usdNanos(cell.saleUsd), BigInt(cell.outputTokens) * rateTenths * BigInt(300));
      comparisons++;
    }
  }
  assert.equal(comparisons, 900);
  assert.equal(rows[0].prices.medium.gold.saleUsd, "0.031608");
  assert.equal(rows[15].prices.medium.gold.saleUsd, "0.064224");
  assert.equal(rows[30].prices.medium.gold.saleUsd, "0.106776");
  assert.equal(rows[44].prices.max.diamond.saleUsd, "0.3441528");
  assert.deepEqual(priceTableConversion("0.031608"), { cny: null, credits: null });
  const fx: TableConversion = { rateMicros: "7000000", basis: "budget", evidence: "isolated test rate, not production FX", updatedAt: "2026-10-08T00:00:00Z", creditsPerCnyMicros: "10000000", rounding: "ceil", modelVersion: 2 };
  assert.deepEqual(priceTableConversion("0.031608", fx), { cny: "0.221256", credits: "3" });
  assert.deepEqual(priceTableConversion("0.031608", fx, 3), { cny: "0.663768", credits: "7" });
  assert.deepEqual(priceTableConversion("0", fx), { cny: "0.000000", credits: "0" });
  assert.deepEqual(priceTableConversion("0.031608", { ...fx, rateMicros: "0" }), { cny: null, credits: null });
  assert.equal(priceTableConversion("0.031608", { ...fx, creditsPerCnyMicros: "0" }).credits, null);
  assert.equal(priceTableConversion("0.000000001", { ...fx, rateMicros: "1000000" }).credits, "1");
  assert.equal(priceTableConversion("0.05", { ...fx, rateMicros: "1000000", rounding: "nearest" }).credits, "1");
  assert.equal(priceTableConversion("0.099999999", { ...fx, rateMicros: "1000000", rounding: "floor" }).credits, "0");
  for (const bad of ["-1", "NaN", "0.0000000001", "1e-6", "", "01", " 1"]) assert.throws(() => usdNanos(bad));
  assert.throws(() => priceTableConversion("1", fx, 0));
  assert.throws(() => priceTableConversion("1", fx, 1.5));
  assert.equal(decimalNanos(usdNanos("0.000000001")), "0.000000001");
  const payload = image25TablePayload(IMAGE25_BUDGET_FX, "预算汇率：1 USD = 7 CNY；非实际充值汇率。人民币仅为参考，真实扣费未变更。");
  assert.equal(payload.multiplier, 3);
  assert.equal(payload.liveBillingChanged, false);
  assert.equal(payload.conversion?.rateMicros, "7000000");
  assert.equal(payload.conversion?.basis, "budget");
  assert.equal(payload.displayCurrency, "CNY");
  for (const row of payload.rows) for (const q of IMAGE25_QUALITIES) for (const tier of IMAGE25_TIERS) {
    const cell = row.prices[q][tier];
    const saleMicros = (usdNanos(cell.saleUsd) * BigInt(7) + BigInt(500)) / BigInt(1000);
    const independentCny = `${saleMicros / BigInt(1000000)}.${(saleMicros % BigInt(1000000)).toString().padStart(6, "0")}`;
    assert.equal(cell.saleCny, independentCny);
  }
  assert.equal(priceTableConversion(rows[15].prices.medium.gold.saleUsd, IMAGE25_BUDGET_FX).cny, "0.449568");
  assert.equal(priceTableConversion(rows[30].prices.medium.gold.saleUsd, IMAGE25_BUDGET_FX).cny, "0.747432");
  assert.equal(priceTableConversion(rows[0].prices.medium.gold.saleUsd, IMAGE25_BUDGET_FX).credits, null);
  const publishedFx = { ...fx, basis: "admin-rate" as const, rateMicros: "7250000", modelVersion: 4 };
  assert.equal(image25TablePayload(publishedFx).rows[0].prices.medium.gold.saleCny, "0.229158");
  assert.equal(image25TablePayload(publishedFx).conversion?.modelVersion, 4);
  assert.equal(image25TablePayload({ ...publishedFx, rateMicros: "0" }).conversion, null);
  assert.ok(!JSON.stringify(payload).includes("gpt-image-2.5-ext"));
  assert.deepEqual(payload.qualities, ["low", "medium", "high", "xhigh", "max"]);
  // Price reference must not migrate or reinterpret existing full-cost billing.
  const livePreset = await readFile("src/lib/model-config/image-preset.ts", "utf8");
  assert.ok(livePreset.includes("factorBps: 15000"));
  assert.ok(livePreset.includes('qualityCap: z.literal("medium")'));
  const text = `# APIMart image2.5 原生单张价格表（输出参考价 ×3）\n\n日期：2026-10-08。Flare / Sunburst 同价。以下按公开黄金档人民币展示，预算汇率 1 USD = 7 CNY（非实际充值汇率），账号折扣尚未核验。\n\n售价=输出参考价×3；用于覆盖输入与综合成本，不表示完整成本已经核实，不以“售价减输出价”计算确定利润。此表尚未应用到真实扣费，原有完整成本×1.5规则未改写。EXT不适用本表。\n\n每个质量单元格为 **输出参考价 / 售价（CNY元/张）**，美元原值保存在JSON及Excel中。高于medium的档位为原生能力参考；实际有效参数为medium时，应采用medium价格。auto、自定义像素没有固定参考价。人民币售价 = 输出参考USD ×3 ×7，标为预算折算估计，最终展示保留六位小数；汇率可在Excel调整，后台优先已生效汇率。\n\n|比例|分辨率|文档像素|low 输出/售价|medium 输出/售价|high 输出/售价|xhigh 输出/售价|max 输出/售价|\n|---|---|---|---:|---:|---:|---:|---:|\n` + rows.map(r => `|${r.ratio}|${r.resolution.toUpperCase()}|${r.pixels}|${IMAGE25_QUALITIES.map(q => `${priceTableConversion(r.prices[q].gold.outputUsd, IMAGE25_BUDGET_FX).cny} / **${priceTableConversion(r.prices[q].gold.saleUsd, IMAGE25_BUDGET_FX).cny}**`).join("|")}|`).join("\n") + `\n\n共有45组规格、225项质量价格；原生两个model共用。机读JSON另外包含黄金、铂金、钻石和网站官方四档，共900项价格。\n\n来源核查日期：${source.checked_date}。\n\n- [原生参数与token矩阵](${source.sources.native})\n- [APIMart价格中心](${source.sources.pricing})\n\n后台入口：\`/admin/billing/price-table\`。数据仅包含公开参考信息，不含密钥、用户信息或供应商账户余额。\n`;
  await writeFile("docs/apimart-image25-sale-table-20261008.md", text);
  await writeFile("docs/apimart-image25-sale-table-20261008.json", JSON.stringify(payload, null, 2) + "\n");
  assert.equal(JSON.parse(await readFile("docs/apimart-image25-sale-table-20261008.json", "utf8")).rows.length, 45);
  assert.ok((await readFile("docs/apimart-image25-sale-table-20261008.md", "utf8")).includes("0.249144 / **0.747432**"));
  assert.equal(createHash("sha256").update(await readFile("docs/apimart-image25-pricing-20261008.json", "utf8")).digest("hex"), before);
  console.log("IMAGE25_PRICE_TABLE=PASS SPECS=45 QUALITIES=225 TIER_COMPARISONS=900 MULTIPLIER=3 EXACT_DECIMAL=PASS CNY_COMPARISONS=900 BUDGET_FX=7 FX_MISSING_NOT_ZERO=PASS FINAL_POINTS_ROUNDING=PASS SOURCE_UNCHANGED=PASS LIVE_BILLING_UNCHANGED=PASS PAID_CALLS=0 ARTIFACTS_REOPENED=PASS");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
