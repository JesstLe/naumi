import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { createInterface } from "node:readline";

const [sessionFile, outputDir] = process.argv.slice(2);
if (!sessionFile || !outputDir) {
  throw new Error("usage: node extract-session-attachments.mjs <session.jsonl> <output-dir>");
}

mkdirSync(outputDir, { recursive: true });
const wanted = [
  "2d085eb4d4b7469fa255cee0f28f2098.jpg",
  "bd3381eeefdaf7ee6727556947bb4eae.jpg",
  "ea371a003b59797cc6bfbdc9b3738f2d.jpg",
];
const saved = new Set();
const rl = createInterface({ input: createReadStream(sessionFile), crlfDelay: Infinity });

for await (const line of rl) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  const payload = row?.payload;
  if (payload?.type !== "message" || payload?.role !== "user" || !Array.isArray(payload.content)) {
    continue;
  }
  const texts = payload.content
    .filter((item) => item?.type === "input_text")
    .map((item) => item.text || "")
    .join("\n");
  if (!wanted.some((name) => texts.includes(name))) continue;
  const images = payload.content.filter(
    (item) => item?.type === "input_image" && typeof item.image_url === "string"
  );
  for (let i = 0; i < Math.min(images.length, wanted.length); i++) {
    const match = /^data:image\/([^;]+);base64,(.+)$/s.exec(images[i].image_url);
    if (!match) continue;
    const fallbackExt = match[1] === "jpeg" ? ".jpg" : `.${match[1]}`;
    const name = extname(wanted[i]) ? wanted[i] : `${basename(wanted[i])}${fallbackExt}`;
    const path = join(outputDir, name);
    writeFileSync(path, Buffer.from(match[2], "base64"));
    saved.add(name);
  }
  if (saved.size === wanted.length) break;
}

if (saved.size !== wanted.length) {
  throw new Error(`only recovered ${saved.size}/${wanted.length} source images`);
}
for (const name of wanted) process.stdout.write(`${join(outputDir, name)}\n`);
