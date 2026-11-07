import assert from "node:assert/strict";
import { Pool } from "pg";
import { slimStoredOperations } from "../../src/lib/reference-workbench/operation-storage";

// Run only after the release that stores image digests is the sole serving Web:
// older code compares the full stored body at submit time. Rows keep fingerprint,
// plans' assets/quotes, results and updated_at; no supplier or billing call.
//   --plan                       count candidates, change nothing
//   --apply [--vacuum-full]      rewrite rows (three deploy locks required)
async function main(){
  const apply=process.argv.includes("--apply"),vacuum=process.argv.includes("--vacuum-full");
  assert.ok(apply||process.argv.includes("--plan"),"Use --plan or --apply");
  if(apply)assert.equal(process.env.NAUMI_DEPLOY_THREE_LOCKS_HELD,"1","Existing host transaction must hold all three deploy locks");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,application_name:"naumi-reference-operation-slim"});
  const size=async()=>(await pool.query("SELECT pg_total_relation_size('app_reference_operations')::bigint AS bytes,(SELECT count(*) FROM app_reference_operations)::int AS rows")).rows[0];
  try{
    const before=await size();
    const result=await slimStoredOperations(async()=>{const c=await pool.connect();await c.query("SET lock_timeout='3s'");await c.query("SET statement_timeout='60s'");return c;},{apply});
    if(apply){const left=await slimStoredOperations(()=>pool.connect(),{apply:false});assert.equal(left.changed,0,"slimming must be complete and idempotent");}
    if(apply&&vacuum){await pool.query("SET lock_timeout='3s'");await pool.query("SET statement_timeout='120s'");const started=Date.now();await pool.query("VACUUM (FULL, ANALYZE) app_reference_operations");console.log(`VACUUM_FULL=DONE ms=${Date.now()-started}`);}
    const after=await size();
    console.log(`REFERENCE_OPERATION_SLIM=${apply?"APPLIED":"PLANNED"} candidates=${result.candidates} changed=${result.changed} recordBytesBefore=${result.bytesBefore} recordBytesAfter=${result.bytesAfter} tableBytesBefore=${before.bytes} tableBytesAfter=${after.bytes} rows=${after.rows} supplierCalls=0 billingWrites=0`);
  }finally{await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
