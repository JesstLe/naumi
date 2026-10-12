import {spawnSync} from "node:child_process";
import {createModelFixture} from "./model-config-fixture";
async function main(){
  const f=await createModelFixture();
  try{
    const result=spawnSync(process.execPath,["node_modules/tsx/dist/cli.mjs","scripts/verify-billing-agent.ts"],{env:{...process.env,PGOPTIONS:`-c search_path=${f.schemaName}`,NODE_OPTIONS:"--conditions=react-server"},encoding:"utf8",timeout:120_000});
    process.stdout.write(result.stdout||"");process.stderr.write(result.stderr||"");if(result.status!==0)throw new Error("Isolated billing confirmation regression failed");
  }finally{await (await import("../src/lib/db")).getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
