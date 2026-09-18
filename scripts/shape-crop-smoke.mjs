// 冒烟:验证生图画幅策略(sharp 行为级,与 src/app/api/generate-image/route.ts 同款逻辑)
//  1) attention 裁切能保住贴边主体(旧居中裁约只保一半)
//  2) padToRatio 留白后比例精确、内容零损失
//  3) 透明底留白后补白区 alpha=0(抠图主体不被裁)
//  4) detectUniformBorder 白底检出、渐变底不误报
// 运行:node scripts/shape-crop-smoke.mjs
// 证据:output/shape-crop-<date>/*.png + 控制台输出
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const outDir = `output/shape-crop-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
mkdirSync(outDir, { recursive: true });

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

// —— 与 route.ts 相同的三段逻辑(路由文件不可直接 import,改这里时同步改 route)——
async function cropToRatio(buf, ratio) {
  const [rw, rh] = ratio.split(":").map(Number);
  if (!(rw > 0 && rh > 0)) return buf;
  const sharp_ = sharp;
  const meta = await sharp_(buf).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;
  if (!W || !H) return buf;
  const target = rw / rh;
  const cur = W / H;
  let cw = W;
  let ch = H;
  if (cur > target + 0.01) cw = Math.round(H * target);
  else if (cur < target - 0.01) ch = Math.round(W / target);
  else return buf;
  cw = Math.min(cw, W);
  ch = Math.min(ch, H);
  return await sharp_(buf)
    .resize(cw, ch, { fit: "cover", position: sharp_.strategy.attention })
    .png()
    .toBuffer();
}

async function padToRatio(buf, ratio, background) {
  const [rw, rh] = ratio.split(":").map(Number);
  if (!(rw > 0 && rh > 0)) return buf;
  const meta = await sharp(buf).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;
  if (!W || !H) return buf;
  const target = rw / rh;
  const cur = W / H;
  let cw = W;
  let ch = H;
  if (cur > target + 0.01) ch = Math.round(W / target);
  else if (cur < target - 0.01) cw = Math.round(H * target);
  else return buf;
  return await sharp(buf)
    .resize(cw, ch, { fit: "contain", background, kernel: "lanczos3" })
    .png()
    .toBuffer();
}

async function detectUniformBorder(buf) {
  try {
    const { data, info } = await sharp(buf)
      .resize(32, 32, { fit: "fill" })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels < 3) return null;
    const at = (x, y) => {
      const i = (y * 32 + x) * info.channels;
      return { r: data[i], g: data[i + 1], b: data[i + 2] };
    };
    const samples = [];
    for (let i = 0; i < 32; i++) {
      samples.push(at(i, 0), at(i, 31), at(0, i), at(31, i));
    }
    const n = samples.length;
    const mean = samples.reduce(
      (acc, c) => ({ r: acc.r + c.r / n, g: acc.g + c.g / n, b: acc.b + c.b / n }),
      { r: 0, g: 0, b: 0 }
    );
    const uniform = samples.every(
      (c) =>
        Math.abs(c.r - mean.r) < 14 &&
        Math.abs(c.g - mean.g) < 14 &&
        Math.abs(c.b - mean.b) < 14
    );
    return uniform
      ? { r: Math.round(mean.r), g: Math.round(mean.g), b: Math.round(mean.b) }
      : null;
  } catch {
    return null;
  }
}

async function darkCount(buf) {
  // 先压平到白底:透明区 RGB(0,0,0) 会被误数成黑,flatten 后只统计不透明内容
  const { data } = await sharp(buf)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (const v of data) if (v < 32) dark++;
  return dark;
}

function solidPng(width, height, background) {
  return sharp({
    create: { width, height, channels: 4, background },
  })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// 1) attention 裁切:1024x1536 竖版白底,黑色主体(带内部细节)完全贴左缘,
//    裁 9:16(宽度 1024→864)。旧居中裁只保留主体右半,attention 应保住 >=95%。
// ---------------------------------------------------------------------------
{
  const subject = { left: 0, top: 600, width: 160, height: 336 };
  const block = await solidPng(subject.width, subject.height, { r: 12, g: 12, b: 12, alpha: 1 });
  const detail = await solidPng(40, 40, { r: 250, g: 250, b: 250, alpha: 1 });
  const scene = await sharp(await solidPng(1024, 1536, { r: 255, g: 255, b: 255, alpha: 1 }))
    .composite([
      { input: block, left: subject.left, top: subject.top },
      { input: detail, left: subject.left + 60, top: subject.top + 148 },
    ])
    .png()
    .toBuffer();

  const fullDark = await darkCount(scene);
  const t0 = Date.now();
  const cropped = await cropToRatio(scene, "9:16");
  const elapsed = Date.now() - t0;
  const meta = await sharp(cropped).metadata();
  check(
    "attention 输出比例精确 9:16",
    Math.abs(meta.width / meta.height - 9 / 16) < 0.01,
    `${meta.width}x${meta.height}`
  );
  const keptDark = await darkCount(cropped);
  check(
    "attention 保住贴边主体 >=95%",
    keptDark / fullDark >= 0.95,
    `保留 ${((keptDark / fullDark) * 100).toFixed(1)}%,耗时 ${elapsed}ms`
  );
  // 对照:同样的窗口用旧居中裁,量化差异
  const center = await sharp(scene)
    .extract({ left: 80, top: 0, width: 864, height: 1536 })
    .png()
    .toBuffer();
  const centerDark = await darkCount(center);
  console.log(`      对照:旧居中裁只保留 ${((centerDark / fullDark) * 100).toFixed(1)}% 主体`);
  writeFileSync(`${outDir}/1-attention-scene.png`, scene);
  writeFileSync(`${outDir}/2-attention-cropped.png`, cropped);
}

// ---------------------------------------------------------------------------
// 2) 留白补比例:1536x1024 横版白底,居中黑主体,pad 到 9:16。
//    期望 1536x2731(比例精确)、黑主体像素数完全不变(内容零损失)。
// ---------------------------------------------------------------------------
{
  const scene = await sharp(await solidPng(1536, 1024, { r: 255, g: 255, b: 255, alpha: 1 }))
    .composite([{ input: await solidPng(400, 400, { r: 12, g: 12, b: 12, alpha: 1 }), left: 568, top: 312 }])
    .png()
    .toBuffer();
  const white = await detectUniformBorder(scene);
  check("白底被识别为纯色边框", !!white && white.r >= 250, JSON.stringify(white));
  const fullDark = await darkCount(scene);
  const padded = await padToRatio(scene, "9:16", white ?? { r: 255, g: 255, b: 255 });
  const meta = await sharp(padded).metadata();
  check(
    "留白后比例精确 9:16",
    Math.abs(meta.width / meta.height - 9 / 16) < 0.01,
    `${meta.width}x${meta.height}`
  );
  const keptDark = await darkCount(padded);
  check("留白后主体零损失", keptDark === fullDark, `黑像素 ${fullDark} → ${keptDark}`);
  writeFileSync(`${outDir}/3-pad-white-before.png`, scene);
  writeFileSync(`${outDir}/4-pad-white-after.png`, padded);
}

// ---------------------------------------------------------------------------
// 3) 透明底留白:1024x1536 全透明画布 + 不透明黑主体,pad 到 9:16。
//    期望补白区 alpha=0、主体像素不变。
// ---------------------------------------------------------------------------
{
  const scene = await sharp(await solidPng(1024, 1536, { r: 0, g: 0, b: 0, alpha: 0 }))
    .composite([{ input: await solidPng(300, 300, { r: 12, g: 12, b: 12, alpha: 1 }), left: 362, top: 618 }])
    .png()
    .toBuffer();
  const fullDark = await darkCount(scene);
  const padded = await padToRatio(scene, "9:16", { r: 0, g: 0, b: 0, alpha: 0 });
  const meta = await sharp(padded).metadata();
  check("透明留白后仍带 alpha", !!meta.hasAlpha, `${meta.width}x${meta.height}`);
  const corner = await sharp(padded)
    .extract({ left: 5, top: 5, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  check("补白区透明 alpha=0", corner[3] === 0, `corner rgba=${corner[0]},${corner[1]},${corner[2]},${corner[3]}`);
  const keptDark = await darkCount(padded);
  check("透明留白主体零损失", keptDark === fullDark, `黑像素 ${fullDark} → ${keptDark}`);
  writeFileSync(`${outDir}/5-pad-alpha-after.png`, padded);
}

// ---------------------------------------------------------------------------
// 4) 纯色边框检测防误报:横向渐变底(类似天空/墙面过渡)不得判为纯色边。
// ---------------------------------------------------------------------------
{
  const W = 96;
  const H = 96;
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      raw[i] = Math.min(255, x * 2.6);
      raw[i + 1] = Math.min(255, 120 + x * 1.1);
      raw[i + 2] = 240;
    }
  }
  const gradient = await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
    .png()
    .toBuffer();
  const detected = await detectUniformBorder(gradient);
  check("渐变底不误报为纯色边框", detected === null, JSON.stringify(detected));
  writeFileSync(`${outDir}/6-gradient-negative.png`, gradient);
}

console.log(failed === 0 ? `\n全部通过 ✅ 证据目录: ${outDir}` : `\n${failed} 项失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
