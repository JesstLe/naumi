import assert from "node:assert/strict";
import { DurableImageJobs } from "../src/lib/durable-image-jobs";
import { getPool } from "../src/lib/db";
async function main() {
  const job=await new DurableImageJobs<{status:string;input:Buffer;progress:number}>("generate").get(process.argv[2]);
  assert.equal(job?.input.toString(),"resume-fixture");
  assert.equal(job?.progress,1);
  console.log("PASS cross-process snapshot");
  await getPool().end();
}
main().catch(error=>{console.error(error);process.exit(1);});
