import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { prepareAPiB, sha256 } from "./lib/apib-onboarding.mjs";

const [snapshotPath, catalogPath, manifestPath, outputPath, version, digest] = process.argv.slice(2);
if (!digest) throw new Error("Usage: node scripts/prepare-apib-onboarding.mjs SNAPSHOT CATALOG MANIFEST OUT EXPECTED_VERSION EXPECTED_DIGEST");
const [snapshotBytes, catalogBytes, manifestBytes] = await Promise.all([snapshotPath, catalogPath, manifestPath].map(p => readFile(resolve(p))));
const bundle = prepareAPiB({ snapshot: JSON.parse(snapshotBytes), catalog: JSON.parse(catalogBytes), manifest: JSON.parse(manifestBytes), expectedVersion: Number(version), expectedDigest: digest });
bundle.inputHashes = { snapshot: sha256(snapshotBytes), catalog: sha256(catalogBytes), manifest: sha256(manifestBytes) };
await mkdir(resolve(outputPath), { recursive: true });
for (const [name, value] of [["CANDIDATE_BUNDLE.json", bundle], ["MODIFIED_FILE.json", bundle.config], ["ROUTING_INTENTS.json", bundle.intents], ["SUPPLIER_OBSERVATIONS.json", bundle.observations]]) await writeFile(join(resolve(outputPath), name), JSON.stringify(value, null, 2) + "\n", "utf8");
console.log(`PREPARED image=${bundle.summary.selectedImageModels} video=${bundle.summary.selectedVideoModels} enabled=0 productionWrites=0 generationCalls=0`);
