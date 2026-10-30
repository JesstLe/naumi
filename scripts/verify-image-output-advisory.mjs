import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(import.meta.url), baseline = process.argv.includes("--baseline");
const route = require("./lib/image-generation-source.cjs")(), parent = readFileSync("src/lib/imagegen/dispatch.ts", "utf8");
if (baseline) {
  assert.ok(route.includes("imagegenOutputError ||= images.map(image => imageRatioMismatch"));
  assert.ok(parent.includes("if(row?.error)throw new Error(row.error)"));
  console.log("BASELINE=REPRODUCED VALID_PAID_IMAGE_RATIO_MISMATCH=FAILED CHILD_AND_PARENT=BLOCKED");
} else {
  const code = await build({ entryPoints: ["src/lib/imagegen/output-advisory.ts"], bundle: true, platform: "node", format: "cjs", write: false });
  const mod = { exports: {} }; new Function("require", "module", "exports", code.outputFiles[0].text)(require, mod, mod.exports);
  const { imageRatioWarning, imageOutputNotice, presentImagegenOutput } = mod.exports;
  const cases = [["2:3",848,1264],["53:79",928,1152],["3:4",1024,1536],["9:16",1024,1024],["3:4",2048,1024]];
  for (const [ratio,width,height] of cases) {
    const before = {width,height,ratio: `${width}:${height}`}, old = JSON.stringify(before);
    const warning = imageRatioWarning(ratio,before);
    assert.ok(warning?.includes(`${width}×${height}`));
    assert.ok(!warning.includes("已结算") && !warning.includes("未自动重试"));
    assert.equal(JSON.stringify(before),old);
    assert.deepEqual(imageOutputNotice(undefined,warning,true),{warning});
  }
  assert.equal(imageRatioWarning("3:4",{width:1152,height:1536}),undefined);
  const legacy = "生成结果为 29:36（928×1152），与所选 53:79 不一致；原图已保留，实际生成积分已结算，任务未自动重试";
  const notice = imageOutputNotice(legacy,undefined,true);
  assert.ok(notice.warning?.includes("928×1152"));assert.equal(notice.error,undefined);
  assert.equal(imageOutputNotice(legacy,undefined,false).error,legacy,"no image must not become success");
  for (const error of ["模型未返回有效透明主体", "图片生成失败,请稍后重试", "生成结果为 malformed", "上游提交结果待核查"]) assert.equal(imageOutputNotice(error,undefined,true).error,error);
  const artifact = {artworkId:"fixture-art",url:"/media/fixture.png",width:928,height:1152,mime:"image/png",transparentPixels:0,totalPixels:928*1152};
  const result = {operationId:"fixture-op",jobId:"fixture-parent",status:"failed",stage:"editing",artifacts:[artifact],chargedCredits:10,error:{code:"EXECUTION_FAILED",message:legacy}};
  const original = JSON.stringify(result), presented = presentImagegenOutput(result,true);
  assert.equal(presented.status,"succeeded");assert.equal(presented.stage,"done");assert.equal(presented.error,undefined);
  assert.equal(presented.chargedCredits,10);assert.deepEqual(presented.artifacts,[artifact]);assert.ok(presented.warnings.length);
  assert.equal(JSON.stringify(result),original,"receipt projection must not rewrite historical state");
  for(const status of ["pending","needs_attention","cancelled"]) assert.equal(presentImagegenOutput({...result,status},true).status,status);
  assert.equal(presentImagegenOutput({...result,artifacts:[]},true).status,"failed");
  assert.equal(presentImagegenOutput(result,false).status,"failed","do not bypass other stages");
  const warn = mod.exports.imageOutputWarningText([notice.warning,notice.warning]);assert.equal(warn,undefined,"ratio diagnostics are retained internally but not shown to users");
  assert.equal(mod.exports.imageOutputWarningText(["a".repeat(5000)]).length,240);
  assert.ok(route.includes("imagegenOutputWarning"));assert.ok(parent.includes("warnings"));
  const canvas = readFileSync("src/components/canvas/canvas-client.tsx","utf8");
  if(canvas.includes("runCanvasDerivedImage(")){
    const controller=readFileSync("src/lib/canvas/image-task-controller.ts","utf8");
    assert.ok(canvas.includes("runCanvasBlankImage("));assert.ok(controller.includes("imageOutputWarningText(body.warnings)"));
    assert.ok(controller.includes("if(warning)input.notice(warning)"),"both Canvas applications use the real shared formatter");
  }else assert.equal(canvas.split("imageOutputWarningText(pj.warnings)").length-1,2,"legacy existing and pending-node generation both filter warnings");
  console.log("MODIFIED=PASS RATIO_DEVIATIONS=5 INTERNAL_DIAGNOSTICS=RETAINED USER_RATIO_NOTICE=HIDDEN ORIGINAL_BYTES_AND_DIMENSIONS=UNCHANGED REAL_ERRORS=RETAINED HISTORICAL_PROJECTION=READ_ONLY BILLING=UNCHANGED CANVAS_NOTICE=FILTERED");
}
console.log("PRODUCTION_WRITES=0 REAL_SUPPLIER_CALLS=0 AUTO_RETRIES=0");
