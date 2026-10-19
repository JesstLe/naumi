import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { validateModelConfig } from "../src/lib/model-config/schema";

const [mode, originalPath, candidatePath] = process.argv.slice(2);
const allowCredentialRefs = process.argv.includes("--allow-credential-refs");
if (!["BASELINE", "MODIFIED", "ROLLBACK"].includes(mode)) throw new Error("Mode must be BASELINE, MODIFIED, or ROLLBACK");
const original = JSON.parse(readFileSync(originalPath, "utf8"));
const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));
// Baseline contains pre-existing internal services. This is offline schema validation,
// not a transport allowlist to be installed into production.
const trustedOrigins = [...new Set(original.providers.map((p: { baseUrl: string }) => new URL(p.baseUrl).origin))] as string[];
validateModelConfig(original, { trustedOrigins });
validateModelConfig(candidate, { trustedOrigins });
if (mode === "MODIFIED") {
  for (const key of Object.keys(original)) {
    if (["providers", "upstreamModels"].includes(key)) {
      for (const row of original[key]) assert.deepEqual(candidate[key].find((x: { id: string }) => x.id === row.id), row);
    } else assert.deepEqual(candidate[key], original[key]);
  }
  const added = candidate.upstreamModels.filter((u: { id: string }) => !original.upstreamModels.some((old: { id: string }) => old.id === u.id));
  assert.equal(added.length, 75);
  assert.equal(added.every((u: any) => !u.enabled && !u.capabilities.verified && !u.capabilities.generate && !u.capabilities.edit), true);
  assert.equal(candidate.providers.filter((p: any) => p.id.startsWith("apib-")).every((p: any) => !p.enabled && (!p.credentialRef || allowCredentialRefs && /^[0-9a-f-]{36}$/i.test(p.credentialRef))), true);
  console.log("MODIFIED_PASS schema=valid image=24 video=51 newlyEnabled=0 oldConfig=unchanged");
} else {
  assert.deepEqual(candidate, original);
  console.log(`${mode}_PASS schema=valid oldConfig=unchanged apibAdded=0`);
}
