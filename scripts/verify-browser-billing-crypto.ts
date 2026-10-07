import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const root = resolve(process.argv[2] || ".");
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const setCrypto = (value: unknown) => Object.defineProperty(globalThis, "crypto", { configurable: true, value });
  const { clientIntentKey, frozenIntentBody } = await import(pathToFileURL(resolve(root, "src/lib/billing/client-intent.ts")).href);
  const request = (id: string, prompt = "HTTP 中文 🖼️") => ({ body: JSON.stringify({ prompt, operationId: id, idempotencyKey: id }), headers: { "content-type": "application/json" } });
  try {
    // Match an ordinary HTTP browser: CSPRNG exists, SubtleCrypto and UUID do not.
    setCrypto({ getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    let httpKey: string;
    try { httpKey = await clientIntentKey("fixture@example.invalid", "/api/generate-image", request("first")); }
    catch (error) { console.error(`HTTP_INTENT=FAIL ${(error as Error).message}`); process.exitCode = 1; return; }
    assert.equal(httpKey, await clientIntentKey("fixture@example.invalid", "/api/generate-image", request("retry")));
    assert.notEqual(httpKey, await clientIntentKey("fixture@example.invalid", "/api/generate-image", request("retry", "different")));
    assert.notEqual(httpKey, await clientIntentKey("other@example.invalid", "/api/generate-image", request("retry")));
    assert.notEqual(httpKey, await clientIntentKey("fixture@example.invalid", "/api/retouch", request("retry")));
    const payload = JSON.parse(frozenIntentBody(request("old"), "frozen").body as string);
    assert.equal(payload.operationId, "frozen"); assert.equal(payload.idempotencyKey, "frozen");
    const form = (contents: string) => { const data = new FormData(); data.set("prompt", "HTTP upload"); data.set("reference", new File([contents], "reference.png", { type: "image/png" })); data.set("billingVersion", "1"); return { body: data }; };
    const httpFileKey = await clientIntentKey("fixture", "/api/retouch", form("same"));
    assert.equal(httpFileKey, await clientIntentKey("fixture", "/api/retouch", form("same")));
    assert.notEqual(httpFileKey, await clientIntentKey("fixture", "/api/retouch", form("changed")));
    const { browserSha256Hex, browserRandomUUID } = await import(pathToFileURL(resolve(root, "src/lib/browser-crypto.ts")).href);
    for (const size of [0, 1, 55, 56, 63, 64, 65, 128, 65537, 1048576]) {
      const bytes = Uint8Array.from({ length: size + 8 }, (_, i) => i % 251).subarray(4, size + 4);
      assert.equal(await browserSha256Hex(bytes), createHash("sha256").update(bytes).digest("hex"));
    }
    const ids = new Set(Array.from({ length: 1000 }, () => browserRandomUUID()));
    assert.equal(ids.size, 1000);
    for (const id of Array.from(ids)) assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    console.log("HTTP_INTENT=PASS SHA256=PASS UUID_V4=PASS RETRY_IDENTITY=PASS FILE_FINGERPRINT=PASS");
    setCrypto(webcrypto);
    assert.equal(httpKey, await clientIntentKey("fixture@example.invalid", "/api/generate-image", request("https")));
    assert.equal(httpFileKey, await clientIntentKey("fixture", "/api/retouch", form("same")));
    assert.match(browserRandomUUID(), /^[a-f0-9-]{36}$/);
    console.log("HTTPS_PARITY=PASS EXISTING_INTENT_KEYS=UNCHANGED");
    setCrypto(undefined);
    assert.equal(await browserSha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.throws(browserRandomUUID, /浏览器不支持随机请求编号/);
    console.log("NO_CSPRNG=CONTROLLED_ERROR NO_WEAK_RANDOM_FALLBACK=PASS");
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
