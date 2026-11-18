import assert from "node:assert/strict";
import { Pool } from "pg";
import { ADMIN_QUERY_INDEXES } from "../../src/lib/bi/query-indexes";
import {ensurePlatformOverviewIndex} from './platform-overview-index';

// Production operator runs inside its existing three-lock host transaction, before
// candidate readiness. No business rows are modified; program rollback may retain indexes.
async function main(){
  assert.ok(process.argv.includes("--apply")||process.argv.includes("--verify"),"Use --apply or --verify");
  if(process.argv.includes("--apply"))assert.equal(process.env.NAUMI_DEPLOY_THREE_LOCKS_HELD,"1","Existing host transaction must hold all three deploy locks");
  const scopes=process.argv.filter(arg=>arg.startsWith('--scope='));
  assert.ok(scopes.length===0||scopes.length===1&&scopes[0]==='--scope=platform-overview',"Unknown index scope");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,application_name:"naumi-admin-query-indexes"});
  try{
    await pool.query("SET lock_timeout='3s'");await pool.query("SET statement_timeout='120s'");
    if(scopes.length){
      const definition=await ensurePlatformOverviewIndex(pool,process.argv.includes('--apply'));
      console.log('PLATFORM_OVERVIEW_INDEX=VALID definition='+definition);
      return;
    }
    if(process.argv.includes("--apply"))for(const index of ADMIN_QUERY_INDEXES)await pool.query(index.sql);
    for(const index of ADMIN_QUERY_INDEXES){
      const r=(await pool.query(`SELECT i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i WHERE i.indexrelid=to_regclass($1)`,[index.name])).rows[0];
      assert.ok(r?.indisvalid&&r?.indisready,`${index.name} must be valid; never ignore a failed concurrent build`);
      console.log(`${index.name}=VALID definition=${r.definition}`);
    }
    console.log("ADMIN_QUERY_INDEXES=PASS supplierCalls=0 businessRowsWritten=0");
  }finally{await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
