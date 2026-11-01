import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { FEATURE_IDS } from "../src/lib/billing/rules/registry";
import { fixtureConfig, facts } from "./billing-unit-fixture";
import { quote, settlementFor } from "../src/lib/billing/quote";
import {featureForRequest} from "../src/lib/model-config/feature-path";
const sources: Record<string, string> = { "image.generate": "src/app/api/generate-image/route.ts", "image.suite": "src/app/api/suite/route.ts", "image.aplus": "src/app/api/aplus/route.ts", "canvas.image": "src/lib/canvas-image-tasks.ts", "video.generate": "src/lib/video/creation.ts", "video.process":"src/lib/video/media-billing.ts", "competitor.action": "src/app/api/competitors/[id]/action/route.ts" };
const config = fixtureConfig();
for (const feature of FEATURE_IDS) {
    const source = sources[feature] || `src/app/api/${feature.startsWith("canvas.") ? "canvas/" : ""}${feature.split(".")[1]}/route.ts`, text = feature==="image.generate"?require("./lib/image-generation-source.cjs")():readFileSync(source, "utf8");
    const billedText=feature==="video.generate"?readFileSync("src/lib/video/submission.ts","utf8"):text;
    if(feature==="video.generate"){
        assert.match(text,/createValidatedVideo\(email,input/,"video creation owner retains validated transactional submission");
        assert.match(readFileSync("src/lib/video/service.ts","utf8"),/export\s*\{createVideoGeneration\}\s*from\s*["']\.\/creation["']/ ,"compatibility surface re-exports the same creation owner");
    }
    if(feature==="image.generate"){
        assert.equal(featureForRequest("/api/generate-image",{}),feature);
        assert.equal(featureForRequest("/api/generate-image",{origin:"canvas"}),"canvas.image");
        assert.match(text,/feature:featureForRequest\("\/api\/generate-image",p\)/,"shared image entry must select the actual image/canvas feature");
    }else assert.ok(text.includes(`"${feature}"`), `${feature} is wired explicitly at the real entry`);
    if(feature==="video.process"){
        assert.match(text,/\bquote\(/);const jobs=readFileSync("src/lib/video/media-jobs.ts","utf8");
        for(const functionName of ["mediaBillingQuote","confirmMediaQuote","reserveTaskBillingTx","settleTaskBillingTx"])assert.ok(jobs.includes(functionName),`media jobs retain ${functionName}`);
    }else assert.match(billedText, feature.startsWith("tool.") || ["canvas.expand", "canvas.annotate", "canvas.text-edit", "canvas.text-generate", "canvas.assistant", "canvas.ocr", "competitor.action"].includes(feature) ? /withBillingRequest/ : /quoteFor(Request|Actor)/,`${feature} retains its billing entry`);
    const baseline = quote({ version: 1, config }, facts({ feature })), expected = ["tool.cutout", "tool.upscale", "tool.ipcheck"].includes(feature) ? 1 : ["tool.printfile", "canvas.text-generate", "canvas.assistant", "canvas.ocr","video.process"].includes(feature) ? 0 : feature === "video.generate" ? 20 : 6;
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
assert.match(readFileSync("src/lib/accounts/administration.ts", "utf8"), /AS consumed7d/);
assert.match(readFileSync("src/lib/db.ts", "utf8"), /adminUsageSummary[^\n]*from ["']@\/lib\/accounts\/administration["']/);
console.log(`PASS ${FEATURE_IDS.length} real entry mappings, default and isolated price changes, no obsolete pricing tables`);
