import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fleetBusinessClientCases } from "./lib/fleet-business-client-cases";

async function main() {
  const source = path.resolve(process.argv[2] || ".");
  const actual = await import(pathToFileURL(path.join(source, "src/components/admin/business-data/client.ts")).href);
  const results = await fleetBusinessClientCases(actual.readBusinessResponse, actual.BusinessReadError);
  const failures = results.filter(item => !item.passed), record = { layer: "actual-client-finite-http-fixture", source, results, failures: failures.length, businessWrites: 0, SSH: 0 };
  if (process.argv[3]) await fs.writeFile(path.resolve(process.argv[3]), JSON.stringify(record, null, 2) + "\n");
  console.log(`FLEET_BUSINESS_CLIENT_REVIEW=${failures.length ? "FAIL" : "PASS"} cases=${results.length} failed=${failures.length} BUSINESS_WRITES=0 SSH=0`);
  process.exitCode = failures.length ? 3 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
