import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = await readFile(path.join(root, "src/lib/storage.ts"), "utf8");
const config = await readFile(path.join(root, "src/lib/object-storage/config.ts"), "utf8");
const adapter = await readFile(path.join(root, "src/lib/object-storage/adapter.ts"), "utf8");
const compose = await readFile(path.join(root, "docker-compose.yml"), "utf8");
const env = await readFile(path.join(root, ".env.example"), "utf8");

assert.match(source, /storageDriver:\s*"local"\s*\|\s*"r2"\s*\|\s*"s3"/);
assert.match(config, /S3_ENDPOINT/);
assert.match(config, /S3_FORCE_PATH_STYLE/);
assert.match(source, /uploadImage[\s\S]*backend.put/);
assert.match(source, /deleteImageByUrl[\s\S]*backend.delete/);
assert.match(source, /readManagedObject/);
assert.match(adapter, /HEAD/);
assert.match(source, /fetchStoredObject/);
assert.match(compose, /STORAGE_DRIVER:/);
assert.match(compose, /S3_ENDPOINT:/);
assert.match(compose, /S3_ACCESS_KEY_ID:/);
assert.match(compose, /S3_SECRET_ACCESS_KEY:/);
assert.match(env, /STORAGE_DRIVER=(?:local)?/);
assert.match(env, /S3_ENDPOINT=/);
assert.match(env, /S3_BUCKET=/);

console.log("STORAGE_S3_CONTRACT=PASS checks=15");
