import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "design/brand/naumi-logo-options-20261010/a-capsule-n");
const target = path.join(root, "public/brand/naumi");
let checks = 0;
function check(value) { assert.ok(value); checks++; }
for (const name of ["symbol-black", "symbol-white", "app-dark", "horizontal-black", "horizontal-white"]) {
  const svg = fs.readFileSync(path.join(target, `${name}.svg`), "utf8");
  check(svg === fs.readFileSync(path.join(source, `${name}.svg`), "utf8"));
  check(svg.includes('d="M73 179 L96 77 L160 179 L183 77"'));
  check(!/<(?:image|script|text)\b|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i.test(svg));
  const rendered = await sharp(Buffer.from(svg)).png().toBuffer();
  check(rendered.length > 100);
}
const png = fs.readFileSync(path.join(root, "public/logo.png"));
check(fs.readFileSync(path.join(target, "app-dark.png")).equals(fs.readFileSync(path.join(source, "app-dark.png"))));
check(png.equals(fs.readFileSync(path.join(source, "symbol-black.png"))));
const meta = await sharp(png).metadata();
check(meta.width === 512 && meta.height === 512 && meta.hasAlpha);
const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let transparent = 0, dark = 0, yellow = 0;
for (let i = 0; i < data.length; i += info.channels) {
  if (data[i + 3] === 0) transparent++;
  if (data[i + 3] === 255 && data[i] === 24 && data[i + 1] === 27 && data[i + 2] === 35) dark++;
  if (data[i + 3] > 0 && data[i] > 150 && data[i + 1] > 150 && data[i + 2] < 80) yellow++;
}
check(transparent > 100000 && dark > 10000 && yellow === 0);
// 导航仍仅渲染一个独立品牌名称；画布和 tab 共用高对比应用标。
const brand = fs.readFileSync(path.join(root, "src/lib/brand.ts"), "utf8");
check(brand.includes('customLogo || "/brand/naumi/symbol-black.svg"'));
check(brand.includes('customLogo || "/brand/naumi/app-dark.svg"'));
check(fs.readFileSync(path.join(root, "src/components/logo.tsx"), "utf8").includes("!logoHasText"));
check(fs.readFileSync(path.join(root, "src/components/logo.tsx"), "utf8").includes('logo === "/brand/naumi/symbol-black.svg" && "dark:brightness-0 dark:invert"'));
console.log(`NAUMI_LOGO=PASS checks=${checks}`);
