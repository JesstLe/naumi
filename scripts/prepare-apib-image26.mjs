import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { prepareAPIBImage26, sha256 } from './lib/apib-image26-preparation.mjs';

const [snapshotPath, catalogPath, manifestPath, outputPath, version, digest] = process.argv.slice(2);
if (!digest) throw new Error('Usage: node scripts/prepare-apib-image26.mjs SNAPSHOT CATALOG MANIFEST OUT EXPECTED_VERSION EXPECTED_DIGEST');
const bytes = await Promise.all([snapshotPath,catalogPath,manifestPath].map(path => readFile(resolve(path))));
const bundle = prepareAPIBImage26({snapshot:JSON.parse(bytes[0]),catalog:JSON.parse(bytes[1]),manifest:JSON.parse(bytes[2]),expectedVersion:Number(version),expectedDigest:digest});
bundle.inputHashes = Object.fromEntries(['snapshot','catalog','manifest'].map((name,i)=>[name,sha256(bytes[i])]));
await mkdir(resolve(outputPath)); // A repeated preparation must explicitly choose a new evidence directory.
for (const [name,value] of [['CANDIDATE_BUNDLE.json',bundle],['CONFIG.json',bundle.config],['CONTRACTS.json',bundle.contracts]])
  await writeFile(join(resolve(outputPath),name),JSON.stringify(value,null,2)+'\n',{encoding:'utf8',flag:'wx'});
console.log(`APIB_IMAGE26_PREPARED MODELS=${bundle.summary.selectedWireModels} ADDED=${bundle.additions.length} ENABLED=0 PROVIDER_CHANGES=0 BILLING_CHANGES=0 PRODUCTION_WRITES=0 SUPPLIER_POST=0 EXIT=0`);
