import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createModelFixture} from "./model-config-fixture";
async function main(){
 if(process.argv.includes("--child")){console.log("START_CORE");const db=await import("../src/lib/db");await db.ensureSchema();console.log("CORE_READY");await db.getPool().end();return;}
 const f=await createModelFixture(),barrier=await f.sql.connect(),application=`schema-lock-${randomUUID()}`;let output="",error="";
 await barrier.query("BEGIN");await barrier.query("SELECT pg_advisory_xact_lock(hashtextextended(current_database()||':'||current_schema()||':naumi-core-ddl',0))");
 const child=spawn(process.execPath,["--conditions","react-server","--import","tsx","scripts/verify-core-schema-lock.ts","--child"],{env:{...process.env,PGOPTIONS:`-c search_path=${f.schemaName}`,PGAPPNAME:application},windowsHide:true,stdio:["ignore","pipe","pipe"]});child.stdout.on("data",v=>output+=v);child.stderr.on("data",v=>error+=v);const exit=new Promise<number|null>(r=>child.once("exit",r));
 try{let waiting=false;for(let i=0;i<100;i++){waiting=(await f.sql.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event='advisory') AS waiting",[application])).rows[0].waiting;if(waiting||output.includes("CORE_READY")||child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));}assert.equal(waiting,true,`Core DDL must wait on the namespace initialization barrier: ${output} ${error}`);assert.equal((await f.sql.query("SELECT to_regclass('app_users') IS NULL AS absent")).rows[0].absent,true);await barrier.query("COMMIT");assert.equal(await exit,0,error);assert.ok(output.includes("CORE_READY"));console.log("PASS core schema namespace barrier: concurrent runtime initialization serializes before table locks");}
 finally{await barrier.query("ROLLBACK");barrier.release();if(child.exitCode===null){child.kill();await exit;}await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
