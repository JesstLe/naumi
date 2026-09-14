import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demos = path.join(root, "public", "demos");
await mkdir(demos, { recursive: true });

const source = (name) => path.join(demos, name);
const output = (name) => path.join(demos, name);

async function square(input, background = "#f5f5f7") {
  return sharp(input)
    .rotate()
    .resize(1024, 1024, { fit: "contain", background })
    .webp({ quality: 92 })
    .toBuffer();
}

// 商品精修：同一香水瓶，左侧模拟偏灰、轻微虚焦的原片，右侧保留干净成片。
const retouchSource = source("dewatermark-after.webp");
await sharp(retouchSource)
  .modulate({ brightness: 0.72, saturation: 0.72 })
  .blur(1.35)
  .linear(0.84, 18)
  .webp({ quality: 88 })
  .toFile(output("retouch-before.webp"));
await sharp(retouchSource)
  .sharpen({ sigma: 0.7 })
  .modulate({ brightness: 1.04, saturation: 1.04 })
  .webp({ quality: 94 })
  .toFile(output("retouch-after.webp"));

// 产品换色：同一件夹克保持轮廓和背景，只改变色相。
const recolorBefore = await square(source("tryon-before.webp"), "#ffffff");
await sharp(recolorBefore).toFile(output("recolor-before.webp"));
await sharp(source("tryon-before.webp"))
  .rotate()
  .modulate({ hue: 205, saturation: 1.22, brightness: 0.98 })
  .resize(1024, 1024, { fit: "contain", background: "#ffffff" })
  .webp({ quality: 92 })
  .toFile(output("recolor-after.webp"));

// 抠头像：从同一张宠物照片得到紧凑头像构图，避免引入不一致主体。
const avatarBefore = await square(source("upscale-after.webp"), "#f4f1eb");
await sharp(avatarBefore).toFile(output("avatar-before.webp"));
const avatarCrop = await sharp(source("upscale-after.webp"))
  .rotate()
  .extract({ left: 48, top: 105, width: 525, height: 525 })
  .resize(760, 760, { fit: "cover" })
  .webp({ quality: 94 })
  .toBuffer();
const avatarMask = Buffer.from(
  '<svg width="760" height="760" xmlns="http://www.w3.org/2000/svg"><circle cx="380" cy="380" r="370" fill="white"/></svg>'
);
const avatarRound = await sharp(avatarCrop)
  .composite([{ input: avatarMask, blend: "dest-in" }])
  .png()
  .toBuffer();
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#f5f5f7" } })
  .composite([{ input: avatarRound, left: 132, top: 132 }])
  .webp({ quality: 94 })
  .toFile(output("avatar-after.webp"));

// 爆款复刻：输入侧同时呈现商品原图和风格参考，结果侧呈现同商品商业场景图。
const product = await sharp(source("suite-before.webp"))
  .resize(460, 460, { fit: "contain", background: "#ffffff" })
  .webp({ quality: 90 })
  .toBuffer();
const reference = await sharp(source("style-after.webp"))
  .resize(460, 460, { fit: "cover" })
  .webp({ quality: 90 })
  .toBuffer();
await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#eef0f5" } })
  .composite([
    { input: product, left: 42, top: 282 },
    { input: reference, left: 522, top: 282 },
  ])
  .webp({ quality: 92 })
  .toFile(output("replicate-before.webp"));
await square(source("suite-after.webp"), "#e9eef7").then((buf) =>
  sharp(buf).toFile(output("replicate-after.webp"))
);

// Agent：一张输入图自动编排为精修、换色和营销场景等多个结果。
await square(source("suite-before.webp"), "#ffffff").then((buf) =>
  sharp(buf).toFile(output("agent-before.webp"))
);
const agentTiles = await Promise.all(
  ["retouch-after.webp", "recolor-after.webp", "suite-after.webp", "printfile-after.webp"].map((name) =>
    sharp(source(name)).resize(480, 480, { fit: "cover" }).webp({ quality: 90 }).toBuffer()
  )
);
await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#edf0f5" } })
  .composite([
    { input: agentTiles[0], left: 22, top: 22 },
    { input: agentTiles[1], left: 522, top: 22 },
    { input: agentTiles[2], left: 22, top: 522 },
    { input: agentTiles[3], left: 522, top: 522 },
  ])
  .webp({ quality: 92 })
  .toFile(output("agent-after.webp"));

// 模切线转 3D：使用可重复构建的矢量源，避免示例中文字和包装品牌失真。
const dielineSvg = Buffer.from(`
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#f5f5f3"/>
  <g transform="translate(82 286)">
    <g fill="#fff4d9" stroke="#d66b47" stroke-width="7">
      <rect x="190" y="120" width="210" height="330"/>
      <rect x="400" y="120" width="135" height="330"/>
      <rect x="535" y="120" width="210" height="330"/>
      <rect x="55" y="120" width="135" height="330"/>
      <path d="M190 120V22h210v98z"/>
      <path d="M190 450v98h210v-98z"/>
      <path d="M535 120V42h210v78z"/>
      <path d="M535 450v78h210v-78z"/>
    </g>
    <g stroke="#507fc4" stroke-width="5" stroke-dasharray="14 12" fill="none">
      <path d="M190 120v330M400 120v330M535 120v330M745 120v330"/>
      <path d="M190 120h210M190 450h210M535 120h210M535 450h210"/>
    </g>
    <g fill="#e9a35d" opacity=".8">
      <circle cx="295" cy="280" r="74"/>
      <path d="M570 185l140 200H570z"/>
      <path d="M85 212h76v146H85z"/>
    </g>
  </g>
</svg>`);
await sharp(dielineSvg).webp({ quality: 94 }).toFile(output("packaging3d-before.webp"));

const foldedSvg = Buffer.from(`
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="front" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff6dd"/><stop offset="1" stop-color="#efcc8c"/></linearGradient>
    <linearGradient id="side" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dfad63"/><stop offset="1" stop-color="#bc7545"/></linearGradient>
    <linearGradient id="top" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdf4"/><stop offset="1" stop-color="#e9c47e"/></linearGradient>
    <filter id="shadow"><feGaussianBlur stdDeviation="22"/></filter>
  </defs>
  <rect width="1024" height="1024" fill="#f5f5f3"/>
  <ellipse cx="520" cy="810" rx="310" ry="72" fill="#8d7964" opacity=".22" filter="url(#shadow)"/>
  <g stroke="#9a5b36" stroke-width="5" stroke-linejoin="round">
    <path d="M270 300l330-105 178 112-330 111z" fill="url(#top)"/>
    <path d="M270 300l178 118v405L270 694z" fill="url(#front)"/>
    <path d="M448 418l330-111v389L448 823z" fill="url(#side)"/>
  </g>
  <circle cx="358" cy="555" r="86" fill="#e99a55" opacity=".92"/>
  <path d="M518 470l188 190H518z" fill="#f5d28d" opacity=".9"/>
  <path d="M494 728l226-76" stroke="#fff3d2" stroke-width="26" opacity=".72"/>
  <path d="M322 683h80" stroke="#bd6f45" stroke-width="18" stroke-linecap="round" opacity=".75"/>
</svg>`);
await sharp(foldedSvg).webp({ quality: 94 }).toFile(output("packaging3d-after.webp"));

process.stdout.write("Missing tool demo assets generated in public/demos\n");
