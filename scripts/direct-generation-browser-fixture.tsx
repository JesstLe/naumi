import React from "react";
import { createRoot } from "react-dom/client";
import { BillingProvider, useBilling } from "../src/lib/billing/client";
import { clientIntentKey } from "../src/lib/billing/client-intent";

export async function runDirectGenerationFixture() {
  const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
  const originalFetch = window.fetch, originalConfirm = window.confirm;
  const email = "http-crypto-fixture@example.invalid";
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node);
  let client: ReturnType<typeof useBilling> | null = null, confirmCount = 0, quotedVersion = 1;
  let responseStatus = 200, responseCode = "", lastError = "", confirmAllowed = false;
  const calls: { url: string; id: string; version: string; credits: string }[] = [];
  const stored = new Map<string, string | null>();
  const q = { version: 1, credits: 6, reserveCredits: 6, feature: "image.generate", quantity: 1 } as const;
  const requests = ["canvas", "toolbox", "genchat"].map(name => ({ name, url: `/api/fixture-${name}`, init: { method: "POST", body: JSON.stringify({ prompt: `direct ${name}`, operationId: "draft" }) } }));
  const Probe = () => { client = useBilling(); return null; };
  const mount = async () => {
    root.render(<BillingProvider><Probe /></BillingProvider>);
    for (let i = 0; i < 100; i++) { if ((client as ReturnType<typeof useBilling> | null)?.catalog) return; await new Promise(r => setTimeout(r, 10)); }
    throw new Error("Billing provider did not load");
  };
  const submit = async (index: number) => {
    const { url, init } = requests[index];
    if (index === 1) return client!.submit(url, init, { ...q, feature: "tool.cutout" });
    const direct = client!.quoteAndSubmit || (client as any).confirmAndSubmit;
    return direct(url, init, { feature: index === 0 ? "canvas.image" : "image.generate", quantity: 1 });
  };
  window.confirm = () => { confirmCount++; return confirmAllowed; };
  window.fetch = async (input, init) => {
    const path = String(input);
    if (path === "/api/billing/catalog") return Response.json({ version: 1 });
    if (path === "/api/billing/quote") return Response.json({ ...q, version: quotedVersion });
    if (requests.some(req => req.url === path)) {
      const h = new Headers(init?.headers);
      calls.push({ url: path, id: h.get("x-naumi-billing-operation-id")!, version: h.get("x-naumi-billing-version")!, credits: h.get("x-naumi-billing-credits")! });
      return Response.json(responseStatus === 200 ? { ok: true } : { code: responseCode }, { status: responseStatus });
    }
    throw new Error(`Unmocked request ${path}`);
  };
  try {
    for (const request of requests) {
      const key = await clientIntentKey(email, request.url, request.init);
      stored.set(key, localStorage.getItem(key)); localStorage.removeItem(key);
    }
    await mount();
    for (let index = 0; index < requests.length; index++) {
      // A real click handler goes through the application's shared billing provider.
      const button = document.createElement("button"); button.textContent = requests[index].name;
      node.appendChild(button);
      await new Promise<void>((resolve, reject) => { button.onclick = () => { void submit(index).then(() => resolve(), reject); }; button.click(); });
      button.remove();
    }
    assert(confirmCount === 0 && calls.length === 3, "fee confirmation still interrupts click-to-generate");
    const fixedFeeConfirmations=confirmCount;
    assert(calls.every(call => call.id && call.version === "1" && call.credits === "6"), "quote or operation headers missing");
    responseStatus = 503; responseCode = "OPERATION_PENDING";
    await submit(0); const pendingId = calls[3].id;
    await submit(0); assert(calls[4].id === pendingId, "pending retry changed operation ID");
    responseStatus = 402; responseCode = "INSUFFICIENT_CREDITS";
    assert((await submit(1)).status === 402, "balance rejection bypassed");
    responseStatus = 409; responseCode = "PRICE_CHANGED";
    assert((await submit(1)).status === 409, "server price validation bypassed");
    const before = calls.length;
    quotedVersion = 2;
    try { await client!.quoteAndSubmit("/api/fixture-canvas", requests[0].init, { feature: "canvas.expand", quantity: 1 }); }
    catch (error) { lastError = (error as Error).message; }
    assert(lastError.includes("价格已更新") && calls.length === before, "changed quote silently submitted");
    const costPlus={...q,mode:"api-cost-plus" as const,authorizedCredits:36,reserveCredits:36};
    lastError="";try{await client!.submit(requests[0].url,requests[0].init,costPlus);}catch(error){lastError=(error as Error).message;}
    assert(lastError.includes("已取消提交")&&calls.length===before,"declined cost-plus authorization submitted a request");
    confirmAllowed=true;responseStatus=200;responseCode="";
    assert((await client!.submit(requests[0].url,requests[0].init,costPlus)).status===200,"accepted cost-plus request was not submitted");
    assert(calls.length===before+1&&calls.at(-1)?.credits==="36"&&calls.at(-1)?.version==="1"&&confirmCount===2,"accepted cost-plus request lost the frozen authorization cap");
    return { result: "DIRECT_GENERATION_BROWSER=PASS", canvas: "ONE_CLICK", toolbox: "ONE_CLICK", genchat: "ONE_CLICK", feeConfirmations: fixedFeeConfirmations, apiCostPlusAuthorizations:confirmCount, apiCostPlusDeclined:"NO_POST",apiCostPlusAccepted:"FROZEN_CAP_36",retryID: "PRESERVED", balance402: "RETAINED", price409: "RETAINED", changedQuote: "BLOCKED_WITHOUT_GENERATION", quoteHeaders: "RETAINED", supplierCalls: 0, isSecureContext };
  } catch (error) {
    return { result: "DIRECT_GENERATION_BROWSER=FAIL", error: (error as Error).message, feeConfirmations: confirmCount, mockedGenerationCalls: calls.length, supplierCalls: 0 };
  } finally {
    root.unmount(); node.remove(); window.fetch = originalFetch; window.confirm = originalConfirm;
    Array.from(stored.entries()).forEach(([key, value]) => { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); });
  }
}
(window as any).runDirectGenerationFixture = runDirectGenerationFixture;
