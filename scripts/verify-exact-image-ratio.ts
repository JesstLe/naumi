import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync,existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import ts from "typescript";
import sharp from "sharp";
import {
  exactImageRequestSize,
  imageRatioMismatch,
} from "../src/lib/imagegen/request-size";

async function main() {
  const mode = process.argv[2] || "MODIFIED",
    root = resolve(process.argv[3] || "."),
    out = resolve(process.argv[4] || "output/canvas-exact-ratio47-20261019");
  mkdirSync(out, { recursive: true });
  const source = require("./lib/image-generation-source.cjs")(root),
    ast = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);
  const declarations = ast.statements.filter(
    (n) =>
      ts.isFunctionDeclaration(n) &&
      ["sizeFor", "enforceOutputShape", "attachImageDimensions"].includes(
        n.name?.text || "",
      ),
  );
  const shared=existsSync(join(root,"src/lib/imagegen/complete-image-delivery.ts"));
  assert.equal(declarations.length, shared?1:3);
  const mod = { exports: {} as any };
  const js = ts.transpileModule(
    declarations.map((n) => n.getText(ast)).join("\n") +
      (shared?"\nmodule.exports={sizeFor}":"\nmodule.exports={sizeFor,enforceOutputShape,attachImageDimensions}"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    },
  ).outputText;
  new Function(
    "require",
    "module",
    "dataUrlToBytes",
    "exactImageRequestSize",
    js,
  )(
    require,
    mod,
    (url: string) => ({ bytes: Buffer.from(url.split(",")[1], "base64") }),
    exactImageRequestSize,
  );
  if(shared)Object.assign(mod.exports,require("./lib/delivery-pixels.cjs")(root));
  const expected = mode === "MODIFIED" ? "1152x1536" : "1024x1536";
  assert.equal(mod.exports.sizeFor("3:4", "gpt-image-2", true), expected);
  let checks = 1;
  if (mode === "MODIFIED") {
    for (const ratio of [
      "1:1",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "9:16",
      "16:9",
      "4:5",
      "5:4",
      "1:2",
      "2:1",
      "21:9",
    ]) {
      const [w, h] = exactImageRequestSize(ratio, "gpt-image-2")!
          .split("x")
          .map(Number),
        [rw, rh] = ratio.split(":").map(Number);
      assert.equal(w % 16, 0);
      assert.equal(h % 16, 0);
      assert.equal(w * rh, h * rw);
      assert.equal(
        imageRatioMismatch(ratio, { width: w, height: h }),
        undefined,
      );
      checks += 4;
    }
    assert.equal(exactImageRequestSize("auto", "gpt-image-2"), "auto");
    assert.equal(exactImageRequestSize("3:4", "gpt-image-1"), undefined);
    assert.equal(
      mod.exports.sizeFor("3:4", "gpt-image-2", false),
      "1024x1536",
      "old frozen contract retained",
    );
    assert.equal(mod.exports.sizeFor("3:4", "dall-e-3", true), "1024x1792");
    assert.throws(() => exactImageRequestSize("100:1", "gpt-image-2"));
    assert.equal(
      imageRatioMismatch("3:4", { width: 1536, height: 2048 }),
      undefined,
    );
    assert.equal(
      imageRatioMismatch("2:3", { width: 2731, height: 4096 }),
      undefined,
    );
    assert.match(
      imageRatioMismatch("3:4", { width: 1024, height: 1536, ratio: "2:3" })!,
      /2:3.*3:4.*未自动重试/,
    );
    assert.match(imageRatioMismatch("3:4", {})!, /核验未完成/);
    assert.equal(imageRatioMismatch("auto", {}), undefined);
    checks += 10;
  }
  const bytes = await sharp({
    create: { width: 1024, height: 1536, channels: 3, background: "#638467" },
  })
    .png()
    .toBuffer();
  const images = [
    { ratio: "3:4", url: "data:image/png;base64," + bytes.toString("base64") },
  ];
  const same = await mod.exports.enforceOutputShape(images, {
    targetWidth: 0,
    targetHeight: 0,
  });
  assert.equal(same, images);
  const actual = (await mod.exports.attachImageDimensions(same))[0];
  assert.equal(actual.ratio, "2:3");
  assert.equal(actual.url, images[0].url);
  checks += 3;
  const report = {
    mode,
    checks,
    requested: "3:4",
    size: expected,
    oldFrozenSize: mod.exports.sizeFor("3:4", "gpt-image-2", false),
    noCrop: true,
    realSupplierCalls: 0,
  };
  writeFileSync(join(out, `${mode}.json`), JSON.stringify(report, null, 2));
  console.log(
    `${mode}=PASS CHECKS=${checks} REQUEST=3:4 SIZE=${expected} NO_CROP=PASS FROZEN_LEGACY=1024x1536 SUPPLIER_CALLS=0 EXIT=0`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
