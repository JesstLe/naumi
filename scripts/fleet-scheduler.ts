import { planNightlyReleases } from '../src/lib/fleet/releases';
import { getPool } from '../src/lib/db';
async function main(){if(process.env.FLEET_CONTROL_ENABLED!=='1'||process.env.FLEET_SCHEDULER_ENABLED!=='1')throw Error('disabled');try{const result=await planNightlyReleases();console.log('FLEET_SCHEDULER='+JSON.stringify(result));}finally{await getPool().end();}}
main().catch(()=>{console.error('FLEET_SCHEDULER=FAILED');process.exitCode=1;});
