import React from "react";
import { createRoot } from "react-dom/client";
import { BillingProvider, useBilling } from "../src/lib/billing/client";
import { browserRandomUUID, browserSha256Hex } from "../src/lib/browser-crypto";
import { clientIntentKey } from "../src/lib/billing/client-intent";

/** Bundled with fixture auth aliases. All requests are mocked, never sent upstream. */
export async function runBrowserBillingCryptoFixture() {
  const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
  const originalFetch = window.fetch;
  const email = "http-crypto-fixture@example.invalid", url = "/api/http-crypto-fixture-generate";
  const q = { version: 1, credits: 6, reserveCredits: 6, feature: "image.generate", quantity: 1 } as const;
  const init = { method: "POST", body: JSON.stringify({ prompt: "HTTP fixture 中文", operationId: "draft" }) };
  const key = await clientIntentKey(email, url, init), oldValue = localStorage.getItem(key);
  const node = document.createElement("div"); node.hidden = true; document.body.appendChild(node);
  let root = createRoot(node), current: ReturnType<typeof useBilling> | null = null;
  let status = 500, code = "UPSTREAM_UNKNOWN";
  const calls: { id: string; bodyId: string; version: string; credits: string }[] = [];
  const Probe = () => { current = useBilling(); return null; };
  const mount = async () => {
    current = null;
    root.render(<BillingProvider><Probe /></BillingProvider>);
    for (let i = 0; i < 100; i++) { if ((current as ReturnType<typeof useBilling> | null)?.catalog) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error(`Fixture provider did not load: ${(current as ReturnType<typeof useBilling> | null)?.error || "render missing"}`);
  };
  window.fetch = async (input, request) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
    if (path === "/api/billing/catalog") return Response.json({ version: 1 });
    if (path === "/api/billing/quote") return Response.json(q);
    if (path === url) {
      const headers = new Headers(request?.headers), body = JSON.parse(request?.body as string);
      calls.push({ id: headers.get("x-naumi-billing-operation-id")!, bodyId: body.operationId, version: headers.get("x-naumi-billing-version")!, credits: headers.get("x-naumi-billing-credits")! });
      return Response.json(status === 200 ? { ok: true } : { code }, { status });
    }
    throw new Error(`Unmocked fixture request: ${path}`);
  };
  try {
    localStorage.removeItem(key);
    await mount();
    await current!.submit(url, init, q);
    assert(calls.length === 1, "HTTP submission did not reach mocked API");
    const id = calls[0].id;
    assert(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id), "UUID v4 invalid");
    assert(localStorage.getItem(key) === id, "500 must preserve intent ID");
    await current!.submit(url, init, q);
    assert(calls[1].id === id, "Retry changed ID");
    root.unmount(); root = createRoot(node); await mount();
    status = 409; code = "OPERATION_PENDING";
    await current!.submit(url, init, q);
    assert(calls[2].id === id && localStorage.getItem(key) === id, "Remount/pending lost intent ID");
    status = 200;
    await current!.submit(url, init, q);
    assert(calls[3].id === id && localStorage.getItem(key) === null, "Success must finish same intent");
    await current!.submit(url, init, q);
    assert(calls[4].id !== id, "New operation reused completed ID");
    assert(calls.every(call => call.id === call.bodyId && call.version === "1" && call.credits === "6"), "Frozen body/quote headers changed");
    const form = new FormData(); form.set("reference", new File(["fixture"], "reference.png", { type: "image/png" }));
    assert((await clientIntentKey(email, url, { body: form })).length === "naumi:billing-intent:".length + 64, "File hashing failed");
    assert(await browserSha256Hex(new TextEncoder().encode("abc")) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "Known SHA256 mismatch");
    assert(browserRandomUUID() !== browserRandomUUID(), "UUID collision");
    return { result: "BROWSER_BILLING_CRYPTO=PASS", isSecureContext, subtle: typeof crypto.subtle, randomUUID: typeof crypto.randomUUID, apiCalls: calls.length, retryId: "PRESERVED", remount: "PASS", pending: "PASS", successClears: "PASS", nextOperation: "NEW_ID", jsonAndFile: "PASS", actualProviderUsed: true, supplierCalls: 0 };
  } finally {
    root.unmount(); node.remove(); window.fetch = originalFetch;
    if (oldValue === null) localStorage.removeItem(key); else localStorage.setItem(key, oldValue);
  }
}

(window as any).runBrowserBillingCryptoFixture = runBrowserBillingCryptoFixture;
