import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { FEATURE_IDS } from "../src/lib/billing/rules/registry";
import { fixtureConfig, facts } from "./billing-unit-fixture";
import { quote, settlementFor } from "../src/lib/billing/quote";
const sources: Record<string, string> = { "image.generate": "src/app/api/generate-image/route.ts", "image.suite": "src/app/api/suite/route.ts", "image.aplus": "src/app/api/aplus/route.ts", "canvas.image": "src/lib/canvas-image-tasks.ts", "video.generate": "src/lib/video/service.ts", "competitor.action": "src/app/api/competitors/[id]/action/route.ts" };
const config = fixtureConfig();
for (const feature of FEATURE_IDS) {
    const source = sources[feature] || `src/app/api/${feature.startsWith("canvas.") ? "canvas/" : ""}${feature.split(".")[1]}/route.ts`, text = readFileSync(source, "utf8");
    assert.ok(text.includes(`"${feature}"`), `${feature} is wired explicitly at the real entry`);
    assert.match(text, feature.startsWith("tool.") || ["canvas.expand", "canvas.annotate", "canvas.text-edit", "canvas.text-generate", "canvas.assistant", "canvas.ocr", "competitor.action"].includes(feature) ? /withBillingRequest/ : /quoteFor(Request|Actor)/);
    const baseline = quote({ version: 1, config }, facts({ feature })), expected = ["tool.cutout", "tool.upscale", "tool.ipcheck"].includes(feature) ? 1 : ["tool.printfile", "canvas.text-generate", "canvas.assistant", "canvas.ocr"].includes(feature) ? 0 : feature === "video.generate" ? 20 : 6;
    assert.equal(baseline.requestedCredits, expected, `${feature} preserves the characterized default`);
    const changed = structuredClone(config);
    changed.features[feature].enabled = true;
    changed.features[feature].pricing = { mode: "fixed", credits: 3 };
    const q = quote({ version: 2, config: changed }, facts({ feature }));
    assert.equal(q.requestedCredits, 3);
    assert.equal(settlementFor(q, { state: "succeeded", items: [{ id: "success", state: "succeeded", executedQuality: "medium" }] }).charge, 3);
    const other = feature === "image.generate" ? "image.suite" : "image.generate";
    assert.equal(quote({ version: 2, config: changed }, facts({ feature: other })).requestedCredits, quote({ version: 1, config }, facts({ feature: other })).requestedCredits);
}
function scan(dir: string) { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory())
        scan(path);
    else if (/\.tsx?$/.test(path) && path !== "src/lib/billing/server.ts")
        assert.doesNotMatch(readFileSync(path, "utf8"), /\b(?:POINTS_PER_IMAGE|HIGH_QUALITY_COST|TOOL_COST|RMB_PACK_FEN|RMB_PLAN_FEN|CONFIRM_THRESHOLD|HIGH_QUALITY_MIN_PAID_CENTS)\b/, `${path} retains an obsolete pricing source`);
} }
scan("src");
assert.match(readFileSync("src/lib/db.ts", "utf8"), /AS consumed7d/);
console.log(`PASS ${FEATURE_IDS.length} real entry mappings, default and isolated price changes, no obsolete pricing tables`);
