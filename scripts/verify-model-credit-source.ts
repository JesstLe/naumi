/** P1-c: the model-management price shows which layer actually priced it.
 * Fixture precedence through the real quote path; optional real-config distribution:
 *   NAUMI_CREDIT_SOURCE_MODEL=<model.json> NAUMI_CREDIT_SOURCE_BILLING=<billing.json> (exported read-only, kept outside the repo).
 * Zero network, zero supplier calls. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fixtureModelConfig } from "./model-config-unit-fixture";
import { fixtureConfig } from "./billing-unit-fixture";
import { modelCreditView, editManagedModelCredits } from "../src/lib/model-config/management-pricing";
import type { ManagedModelRow } from "../src/lib/model-config/management";

let checks = 0;
const eq = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); checks++; };
const models = { version: 3, digest: "b".repeat(64), config: fixtureModelConfig("https://fixture.invalid/v1", randomUUID()) } as any;
const base = { version: 5, config: fixtureConfig() } as any;
const view = (billing: any) => modelCreditView(billing, models, "image.generate", "image-a");

const tariff = view(base);
eq(tariff.source.kind, "tariff", "no rule: tariff default");
eq(tariff.source.label, "价目表默认价", "label");

const ruled = structuredClone(base);
ruled.config.features["image.generate"].rules.push({ id: "fixture-tariff-rule", priority: 1, when: { modelId: ["image-a"] }, pricing: { mode: "fixed", credits: 7 } });
const byRule = view(ruled);
eq([byRule.source.kind, byRule.credits], ["tariff-rule", 7], "matching tariff rule priced the quote");

const row = { id: "image-a", modality: "image", publicIds: ["image-a"], features: [{ id: "image.generate", label: "自由生图" }] } as unknown as ManagedModelRow;
const managed = { version: 6, config: editManagedModelCredits(ruled, models, row, ["image.generate"], { mode: "fixed", credits: 9 }) } as any;
const byModel = view(managed);
eq([byModel.source.kind, byModel.credits], ["model-rule", 9], "this page's model credit rule wins over the tariff rule");
eq(byModel.source.label, "本页积分设置", "label");

const cleared = { version: 7, config: editManagedModelCredits(managed, models, row, ["image.generate"], null) } as any;
eq([view(cleared).source.kind, view(cleared).credits], ["tariff-rule", 7], "clearing the model price falls back to the tariff rule");

let distribution = "";
if (process.env.NAUMI_CREDIT_SOURCE_MODEL && process.env.NAUMI_CREDIT_SOURCE_BILLING) {
  const m = JSON.parse(readFileSync(process.env.NAUMI_CREDIT_SOURCE_MODEL, "utf8")), b = JSON.parse(readFileSync(process.env.NAUMI_CREDIT_SOURCE_BILLING, "utf8")).snapshot;
  const snapshot = { version: m.version, digest: m.digest, config: m.config };
  const counts: Record<string, number> = {};
  for (const pm of m.config.publicModels.filter((x: any) => x.enabled && x.modality === "image"))
    for (const feature of ["image.generate", "image.suite", "image.aplus", "canvas.image"])
      try { const v = modelCreditView(b, snapshot as any, feature as any, pm.id); counts[v.source.kind] = (counts[v.source.kind] || 0) + 1; } catch { counts.unavailable = (counts.unavailable || 0) + 1; }
  distribution = " REAL_CONFIG=" + Object.entries(counts).map(([k, n]) => `${k}:${n}`).join(",");
}
console.log(`MODEL_CREDIT_SOURCE=PASS CHECKS=${checks} PRECEDENCE_TESTED=MODEL_RULE>TARIFF_RULE>TARIFF QUOTE_PATH=REAL${distribution} SUPPLIER_CALLS=0`);
