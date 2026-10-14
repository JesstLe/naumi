import { connectorTick, applyFleetCommand } from '../src/lib/fleet/connector';
import { getPool, getUser, getOrCreateUser, ensureSchema, setUserRole } from '../src/lib/db';
import { userFeaturePolicy } from '../src/lib/feature-access/server';
async function main() {
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL!).hostname!=='127.0.0.1')throw Error('Requires isolated DB');
  const mode=process.argv[2];
  try {
    if(mode==='seed'){await ensureSchema();await getOrCreateUser('staff@enterprise.test','员工');await getOrCreateUser('owner@enterprise.test','企业管理员');await setUserRole('owner@enterprise.test','admin');}
    else if(mode==='inspect')console.log(JSON.stringify({user:{...await getUser('staff@enterprise.test'),banned:(await getPool().query('SELECT banned FROM app_users WHERE email=$1',['staff@enterprise.test'])).rows[0].banned},policy:await userFeaturePolicy('staff@enterprise.test'),receipts:(await getPool().query('SELECT id,result FROM app_fleet_applied')).rows}));
    else if(mode==='direct'){const command=JSON.parse(process.env.FLEET_TEST_COMMAND!);console.log(JSON.stringify(await applyFleetCommand(command,process.env.FLEET_INSTANCE_ID!)));}
    else console.log(JSON.stringify(await connectorTick({central:process.env.FLEET_CENTRAL_URL!,instanceId:process.env.FLEET_INSTANCE_ID!,token:process.env.FLEET_INSTANCE_TOKEN!,isolated:true,status:{source:'6c7c120',version:'fixture',storage:'s3',nas:'unknown',connector:1}})));
  } finally {await getPool().end();}
}
main().catch(()=>{console.error('FLEET_WORKER=FAILED');process.exitCode=1;});
