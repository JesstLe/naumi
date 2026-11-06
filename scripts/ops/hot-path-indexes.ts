import assert from "node:assert/strict";
import { Pool } from "pg";
import { HOT_PATH_INDEXES } from "../../src/lib/persistence/hot-path-indexes";

// Production operator runs inside its existing three-lock host transaction, before
// candidate readiness. CONCURRENTLY does not block writes; no business rows change.
// app_image_jobs builds read the whole (TOASTed) table, hence the long timeout.
// Program rollback may keep the indexes: they are additive and unused by older code.
async function main(){
  assert.ok(process.argv.includes("--apply")||process.argv.includes("--verify"),"Use --apply or --verify");
  if(process.argv.includes("--apply"))assert.equal(process.env.NAUMI_DEPLOY_THREE_LOCKS_HELD,"1","Existing host transaction must hold all three deploy locks");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,application_name:"naumi-hot-path-indexes"});
  try{
    await pool.query("SET lock_timeout='3s'");await pool.query("SET statement_timeout='900s'");
    if(process.argv.includes("--apply"))for(const index of HOT_PATH_INDEXES){const started=Date.now();await pool.query(index.sql);console.log(`${index.name}=BUILT ms=${Date.now()-started}`);}
    for(const index of HOT_PATH_INDEXES){
      const r=(await pool.query(`SELECT i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) AS definition,pg_relation_size(i.indexrelid) AS bytes FROM pg_index i WHERE i.indexrelid=to_regclass($1)`,[index.name])).rows[0];
      assert.ok(r?.indisvalid&&r?.indisready,`${index.name} must be valid; drop and rebuild a failed concurrent build, never ignore it`);
      console.log(`${index.name}=VALID bytes=${r.bytes} definition=${r.definition}`);
    }
    console.log(`HOT_PATH_INDEXES=PASS count=${HOT_PATH_INDEXES.length} supplierCalls=0 businessRowsWritten=0`);
  }finally{await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
