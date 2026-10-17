// Local-only collector for real collaborative-browser exports; not an application route.
import { createServer } from "node:http";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve("output/studio3d-workbench-20261017/browser");
await mkdir(root, { recursive: true });
const names = new Set([
  "project.naumi3d",
  "portrait.png",
  "multiview.zip",
  "product.glb",
  "browser-result.json",
  "square4k.png",
  "landscape2k.png",
]);
createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:14730");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  const name = req.url?.slice(1);
  if (
    req.method !== "POST" ||
    req.headers.origin !== "http://127.0.0.1:14730" ||
    !names.has(name)
  ) {
    res.writeHead(403);
    return res.end();
  }
  try {
    let length = 0;
    const chunks = [];
    for await (const c of req) {
      length += c.length;
      if (length > 45 * 1024 * 1024) throw Error("too large");
      chunks.push(c);
    }
    await writeFile(resolve(root, name), Buffer.concat(chunks));
    res.end("SAVED");
  } catch {
    res.writeHead(400);
    res.end("FAILED");
  }
}).listen(14731, "127.0.0.1", () =>
  console.log("STUDIO3D_AUDIT_COLLECTOR=http://127.0.0.1:14731"),
);
