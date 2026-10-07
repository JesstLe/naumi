import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve(process.argv[2] || ".");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
try {
  const client = read("src/lib/billing/client.tsx");
  assert(!client.includes("window.confirm"), "fee confirmation is still present");
  assert(client.includes("quoteAndSubmit"), "quote-first submission missing");
  assert(client.includes("q.version !== catalog.version") && client.includes("return submit(url, init, q)"), "quote version validation missing");
  for (const header of ["x-naumi-billing-version", "x-naumi-billing-credits", "x-naumi-billing-operation-id"]) assert(client.includes(header), `missing ${header}`);
  for (const path of ["src/components/canvas/canvas-client.tsx", "src/components/genchat/genchat-client.tsx"]) {
    const source = read(path);
    assert(source.includes("billing.quoteAndSubmit"), `${path} still uses old submission`);
    assert(!source.includes("提交前确认报价") && !source.includes("confirmAndSubmit"), `${path} contains obsolete confirmation`);
  }
  for (const name of ["generate", "cutout", "retouch", "replicate", "garment3d", "tryon", "suite", "aplus"]) {
    assert(read(`src/components/${name}/${name}-client.tsx`).includes("billing.submit"), `${name} must retain quoted direct submission`);
  }
  assert(read("src/components/admin/admin-artworks.tsx").includes("window.confirm"), "unrelated destructive confirmation was removed");
  assert(read("src/lib/billing/agent.ts").includes("confirm=true"), "Agent spending authorization must remain separate");
  console.log("DIRECT_SUBMISSION=PASS CANVAS=PASS TOOLBOX=PASS GENCHAT=PASS QUOTE_AND_IDEMPOTENCY=RETAINED");
} catch (error) {
  console.error(`DIRECT_SUBMISSION=FAIL ${(error as Error).message}`);
  process.exitCode = 1;
}
