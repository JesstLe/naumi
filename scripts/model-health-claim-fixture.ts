import {Pool} from "pg";
import {configuredHealthTargets} from "../src/lib/model-health/targets";
import {createHealthRepository} from "../src/lib/model-health/repository";
async function main(){
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1"||new URL(process.env.DATABASE_URL||"https://invalid").hostname!=="127.0.0.1")throw Error("Requires isolated local fixture");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});
  try{const snapshot=JSON.parse(process.argv[2]);const claim=await createHealthRepository(pool).claim(configuredHealthTargets(snapshot.config),snapshot.version,false);console.log(JSON.stringify({id:claim?.id||null}));}
  finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
