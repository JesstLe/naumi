import { AwsClient } from "aws4fetch";
import crypto from "node:crypto";
import { opendir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const sourceDir = path.resolve(process.env.MEDIA_DIR || "/data/media");
const endpoint = (process.env.S3_ENDPOINT || "").replace(/\/$/, "");
const bucket = process.env.S3_BUCKET || "";
const accessKeyId = process.env.S3_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";
const region = process.env.S3_REGION || "us-east-1";
const concurrency = Math.max(1, Math.min(8, Number(process.env.MIGRATION_CONCURRENCY || 3)));
const mode = process.argv.includes("--verify") ? "verify" : process.argv.includes("--probe") ? "probe" : "migrate";

if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  throw new Error("S3 migration configuration is incomplete");
}

const client = new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" });
const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".json": "application/json",
};

function objectUrl(key: string) {
  return `${endpoint}/${encodeURIComponent(bucket)}/${key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

async function request(key: string, init: RequestInit & { method: string }) {
  return client.fetch(objectUrl(key), init);
}

async function retry<T>(label: string, action: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await action();
    } catch (error) {
      last = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`${label}: ${last instanceof Error ? last.message : String(last)}`);
}

async function* filesUnder(dir: string): AsyncGenerator<{ full: string; key: string; size: number }> {
  const directory = await opendir(dir);
  for await (const entry of directory) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* filesUnder(full);
    } else if (entry.isFile()) {
      const info = await stat(full);
      const key = path.relative(sourceDir, full).split(path.sep).join("/");
      if (!key || key.startsWith("../")) throw new Error(`unsafe key: ${key}`);
      yield { full, key, size: info.size };
    }
  }
}

async function remoteSize(key: string): Promise<number | null> {
  const response = await retry(`HEAD ${key}`, () =>
    request(key, { method: "HEAD", signal: AbortSignal.timeout(60_000) })
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HEAD ${key}: ${response.status} ${response.statusText}`);
  const size = Number(response.headers.get("content-length"));
  return Number.isFinite(size) ? size : null;
}

async function upload(file: { full: string; key: string; size: number }) {
  const bytes = await readFile(file.full);
  const response = await retry(`PUT ${file.key}`, () =>
    request(file.key, {
      method: "PUT",
      body: bytes,
      headers: {
        "content-type": contentTypes[path.extname(file.key).toLowerCase()] || "application/octet-stream",
        "content-length": String(bytes.byteLength),
        "cache-control": "public, max-age=31536000, immutable",
      },
      signal: AbortSignal.timeout(180_000),
    })
  );
  if (!response.ok) throw new Error(`PUT ${file.key}: ${response.status} ${response.statusText}`);
}

async function probe() {
  const key = `verification/migration-probe-${Date.now()}-${crypto.randomUUID()}.txt`;
  const body = Buffer.from("naumi-garage-migration-probe", "utf8");
  const put = await request(key, {
    method: "PUT",
    body,
    headers: { "content-type": "text/plain", "content-length": String(body.byteLength) },
  });
  if (!put.ok) throw new Error(`probe PUT failed: ${put.status}`);
  const get = await request(key, { method: "GET" });
  if (!get.ok || Buffer.from(await get.arrayBuffer()).compare(body) !== 0) {
    throw new Error(`probe GET failed: ${get.status}`);
  }
  const del = await request(key, { method: "DELETE" });
  if (!del.ok) throw new Error(`probe DELETE failed: ${del.status}`);
  console.log("MEDIA_MIGRATION_PROBE=PASS PUT=PASS GET=PASS DELETE=PASS");
}

async function migrate() {
  const files: Array<{ full: string; key: string; size: number }> = [];
  for await (const file of filesUnder(sourceDir)) files.push(file);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  console.log(`MEDIA_MIGRATION_START mode=${mode} files=${files.length} bytes=${totalBytes} concurrency=${concurrency}`);

  let next = 0;
  let processed = 0;
  let uploaded = 0;
  let skipped = 0;
  let verifiedBytes = 0;
  const failures: string[] = [];

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= files.length) return;
      const file = files[index];
      try {
        let size = await remoteSize(file.key);
        if (size !== file.size) {
          if (mode === "verify") throw new Error(`size mismatch local=${file.size} remote=${size ?? "missing"}`);
          await upload(file);
          uploaded++;
          size = await remoteSize(file.key);
        } else {
          skipped++;
        }
        if (size !== file.size) throw new Error(`post-check size mismatch local=${file.size} remote=${size}`);
        verifiedBytes += file.size;
      } catch (error) {
        failures.push(`${file.key}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        processed++;
        if (processed % 50 === 0 || processed === files.length) {
          console.log(
            `MEDIA_MIGRATION_PROGRESS processed=${processed}/${files.length} uploaded=${uploaded} skipped=${skipped} failures=${failures.length}`
          );
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (failures.length) {
    for (const failure of failures.slice(0, 20)) console.error(`MEDIA_MIGRATION_FAILURE ${failure}`);
    throw new Error(`media migration failed for ${failures.length} object(s)`);
  }
  console.log(
    `MEDIA_MIGRATION_RESULT=PASS mode=${mode} files=${files.length} bytes=${totalBytes} verified_bytes=${verifiedBytes} uploaded=${uploaded} skipped=${skipped}`
  );
}

async function main() {
  if (mode === "probe") await probe();
  else await migrate();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
