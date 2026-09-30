import assert from "node:assert/strict";
import crypto from "node:crypto";

async function main() {
  const storage = await import("../src/lib/storage");
  const key = `verification/${storage.storageDriver}-${Date.now()}-${crypto.randomUUID()}.bin`;
  const expected = Buffer.from("naumi-garage-storage-verification-2026-09-30", "utf8");
  let url = "";

  try {
  assert.equal(storage.storageEnabled, true, "storage driver must be enabled");
  url = await storage.uploadImage(
    new Uint8Array(expected),
    "application/octet-stream",
    key,
    "no-store"
  );
  assert.equal(await storage.managedObjectExists(url), true);

  const complete = await storage.readManagedObject(url, 1024);
  assert.deepEqual(complete.bytes, expected);

  if (storage.storageDriver !== "local") {
    const ranged = await storage.fetchStoredObject(key, "bytes=6-11");
    assert.equal(ranged.status, 206);
    assert.equal(Buffer.from(await ranged.arrayBuffer()).toString("utf8"), "garage");
  }

  assert.equal(await storage.deleteImageByUrl(url), true);
  url = "";
  console.log(
    `STORAGE_DRIVER_VERIFICATION=PASS DRIVER=${storage.storageDriver} ` +
      `UPLOAD=PASS READ=PASS RANGE=${storage.storageDriver === "local" ? "SKIP" : "PASS"} DELETE=PASS`
  );
  } finally {
    if (url) await storage.deleteImageByUrl(url).catch(() => false);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
