import { build } from "esbuild";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const out = "dist/identity";
mkdirSync(out, { recursive: true });
const result = await build({
  entryPoints: ["scripts/provision-central-roster.ts"],
  outfile: out + "/provision.cjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["pg", "sharp", "next", "next/*"],
  metafile: true,
  alias: { "server-only": resolve("scripts/fleet-server-only.cjs") },
  tsconfig: "tsconfig.json",
});
const bytes = readFileSync(out + "/provision.cjs");
writeFileSync(
  out + "/manifest.json",
  JSON.stringify(
    {
      schema: 1,
      entry: "provision.cjs",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      source: Object.keys(result.metafile.inputs),
    },
    null,
    2,
  ),
);
console.log("IDENTITY_PROVISION_BUNDLE_CREATED");
