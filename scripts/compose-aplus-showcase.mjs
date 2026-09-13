import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const outputDir = process.argv[2];
if (!outputDir) {
  throw new Error("usage: node compose-aplus-showcase.mjs <generated-directory>");
}

const sourceFiles = [
  "white-source-01-白底母图-1.png",
  "white-source-02-白底母图-2.png",
  "white-source-03-白底母图-3.png",
];
const aplus = [
  "aplus-01-hero.png",
  "aplus-02-selling.png",
  "aplus-03-scene.png",
  "aplus-04-angles.png",
  "aplus-05-story.png",
  "aplus-06-specs.png",
];

await mkdir(outputDir, { recursive: true });

// 电商详情页是模块纵向拼接的长图。每个模块保持完整比例，不裁切。
const detailWidth = 1536;
const detailModules = [];
let detailHeight = 0;

for (const filename of aplus) {
  const input = sharp(join(outputDir, filename));
  const metadata = await input.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`cannot read image dimensions: ${filename}`);
  }

  const moduleHeight = Math.round((metadata.height * detailWidth) / metadata.width);
  const image = await input
    .resize(detailWidth, moduleHeight, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
  detailModules.push({ input: image, left: 0, top: detailHeight });
  detailHeight += moduleHeight;
}

const detailTarget = join(outputDir, "detail-long.png");
await sharp({
  create: {
    width: detailWidth,
    height: detailHeight,
    channels: 3,
    background: "#ffffff",
  },
})
  .composite(detailModules)
  .png()
  .toFile(detailTarget);

// 双列版只在第 3、4 个模块之间换列，不从任何单张模块中间截断。
const columnGap = 32;
const columnHeight = detailHeight / 2;
const detailTwoColumnTarget = join(outputDir, "detail-two-column.png");
const leftColumn = await sharp(detailTarget)
  .extract({ left: 0, top: 0, width: detailWidth, height: columnHeight })
  .png()
  .toBuffer();
const rightColumn = await sharp(detailTarget)
  .extract({ left: 0, top: columnHeight, width: detailWidth, height: columnHeight })
  .png()
  .toBuffer();
await sharp({
  create: {
    width: detailWidth * 2 + columnGap,
    height: columnHeight,
    channels: 3,
    background: "#f5f5f4",
  },
})
  .composite([
    { input: leftColumn, left: 0, top: 0 },
    { input: rightColumn, left: detailWidth + columnGap, top: 0 },
  ])
  .png()
  .toFile(detailTwoColumnTarget);

// 使用竖版总览，为右侧详情长图留足高度；contain 保证六个模块全部露出。
const width = 1600;
const height = 2400;
const panel = { x: 64, y: 132, width: 1472, height: 2176 };
const sourceCard = { x: 98, y: 180, width: 386, height: 2080 };
const detailCard = { x: 754, y: 180, width: 730, height: 2080 };
const detailInset = 28;
const detailPreviewW = detailCard.width - detailInset * 2;
const detailPreviewH = detailCard.height - 82;

const baseSvg = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="800" y="78" text-anchor="middle" font-family="Microsoft YaHei, Arial, sans-serif" font-size="42" font-weight="700" fill="#171717">A+ 详情页</text>
  <rect x="${panel.x}" y="${panel.y}" width="${panel.width}" height="${panel.height}" rx="34" fill="#f5f5f4"/>
  <rect x="${sourceCard.x}" y="${sourceCard.y}" width="${sourceCard.width}" height="${sourceCard.height}" rx="22" fill="#ffffff" stroke="#e7e5e4" stroke-width="2"/>
  <rect x="${sourceCard.x + 22}" y="${sourceCard.y + 22}" width="112" height="34" rx="8" fill="#242424"/>
  <text x="${sourceCard.x + 78}" y="${sourceCard.y + 46}" text-anchor="middle" font-family="Microsoft YaHei, Arial, sans-serif" font-size="16" font-weight="600" fill="#ffffff">商品原图</text>
  <path d="M548 1198 H674 M646 1170 L674 1198 L646 1226" fill="none" stroke="#a8a29e" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="${detailCard.x}" y="${detailCard.y}" width="${detailCard.width}" height="${detailCard.height}" rx="22" fill="#ffffff" stroke="#e7e5e4" stroke-width="2"/>
  <rect x="${detailCard.x + 22}" y="${detailCard.y + 22}" width="128" height="34" rx="8" fill="#242424"/>
  <text x="${detailCard.x + 86}" y="${detailCard.y + 46}" text-anchor="middle" font-family="Microsoft YaHei, Arial, sans-serif" font-size="16" font-weight="600" fill="#ffffff">详情长图</text>
  <rect x="755" y="2344" width="42" height="10" rx="5" fill="#202020"/>
  <rect x="810" y="2344" width="22" height="10" rx="5" fill="#dedede"/>
  <rect x="845" y="2344" width="22" height="10" rx="5" fill="#dedede"/>
</svg>`);

const composites = [];
const sourceImageW = 320;
const sourceImageH = 600;
const sourceStartY = sourceCard.y + 100;
const sourceGap = 48;
for (let index = 0; index < sourceFiles.length; index++) {
  const image = await sharp(join(outputDir, sourceFiles[index]))
    .resize(sourceImageW, sourceImageH, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
  composites.push({
    input: image,
    left: sourceCard.x + Math.round((sourceCard.width - sourceImageW) / 2),
    top: sourceStartY + index * (sourceImageH + sourceGap),
  });
}

const detailPreview = await sharp(detailTarget)
  .resize(detailPreviewW, detailPreviewH, { fit: "contain", background: "#ffffff" })
  .png()
  .toBuffer();
composites.push({
  input: detailPreview,
  left: detailCard.x + detailInset,
  top: detailCard.y + 62,
});

const singleColumnShowcaseTarget = join(outputDir, "showcase-single-column.png");
await sharp(baseSvg).composite(composites).png().toFile(singleColumnShowcaseTarget);

// 默认总览使用更适合屏幕展示的双列分栏版。
const compactWidth = 1600;
const compactHeight = 1120;
const compactPanel = { x: 64, y: 118, width: 1472, height: 906 };
const compactSourceCard = { x: 92, y: 146, width: 326, height: 850 };
const compactDetailCard = { x: 548, y: 146, width: 960, height: 850 };
const compactSvg = Buffer.from(`
<svg width="${compactWidth}" height="${compactHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="800" y="72" text-anchor="middle" font-family="Microsoft YaHei, Arial, sans-serif" font-size="40" font-weight="700" fill="#171717">A+ 详情页</text>
  <rect x="${compactPanel.x}" y="${compactPanel.y}" width="${compactPanel.width}" height="${compactPanel.height}" rx="32" fill="#f5f5f4"/>
  <rect x="${compactSourceCard.x}" y="${compactSourceCard.y}" width="${compactSourceCard.width}" height="${compactSourceCard.height}" rx="20" fill="#ffffff" stroke="#e7e5e4" stroke-width="2"/>
  <rect x="${compactSourceCard.x + 20}" y="${compactSourceCard.y + 18}" width="106" height="32" rx="8" fill="#242424"/>
  <text x="${compactSourceCard.x + 73}" y="${compactSourceCard.y + 41}" text-anchor="middle" font-family="Microsoft YaHei, Arial, sans-serif" font-size="15" font-weight="600" fill="#ffffff">商品原图</text>
  <path d="M448 570 H500 M484 554 L500 570 L484 586" fill="none" stroke="#a8a29e" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="${compactDetailCard.x}" y="${compactDetailCard.y}" width="${compactDetailCard.width}" height="${compactDetailCard.height}" rx="20" fill="#ffffff" stroke="#e7e5e4" stroke-width="2"/>
  <rect x="${compactDetailCard.x + 20}" y="${compactDetailCard.y + 18}" width="128" height="32" rx="8" fill="#242424"/>
  <text x="${compactDetailCard.x + 84}" y="${compactDetailCard.y + 41}" text-anchor="middle" font-family="Microsoft YaHei, Arial, sans-serif" font-size="15" font-weight="600" fill="#ffffff">双列分栏</text>
  <rect x="744" y="1062" width="42" height="10" rx="5" fill="#202020"/>
  <rect x="799" y="1062" width="22" height="10" rx="5" fill="#dedede"/>
  <rect x="834" y="1062" width="22" height="10" rx="5" fill="#dedede"/>
</svg>`);

const compactComposites = [];
for (let index = 0; index < sourceFiles.length; index++) {
  const image = await sharp(join(outputDir, sourceFiles[index]))
    .resize(272, 232, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
  compactComposites.push({
    input: image,
    left: compactSourceCard.x + 27,
    top: compactSourceCard.y + 74 + index * 252,
  });
}

const compactDetailPreview = await sharp(detailTwoColumnTarget)
  .resize(compactDetailCard.width - 48, compactDetailCard.height - 90, {
    fit: "contain",
    background: "#ffffff",
  })
  .png()
  .toBuffer();
compactComposites.push({
  input: compactDetailPreview,
  left: compactDetailCard.x + 24,
  top: compactDetailCard.y + 64,
});

const showcaseTarget = join(outputDir, "showcase.png");
await sharp(compactSvg).composite(compactComposites).png().toFile(showcaseTarget);

process.stdout.write(
  `${detailTarget}\n${detailTwoColumnTarget}\n${singleColumnShowcaseTarget}\n${showcaseTarget}\n`,
);
