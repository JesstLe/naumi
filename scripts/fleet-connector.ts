import { connectorTick } from '../src/lib/fleet/connector';
import { storageDriver } from '../src/lib/storage';
import { centralUrl } from '../src/lib/fleet/contracts';
let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
async function main() {
  if(process.env.FLEET_CONNECTOR_ENABLED!=='1') throw new Error('FLEET_CONNECTOR_DISABLED');
  const central=process.env.FLEET_CENTRAL_URL||'',instanceId=process.env.FLEET_INSTANCE_ID||'',token=process.env.FLEET_INSTANCE_TOKEN||'';
  centralUrl(central);if(!/^[a-f0-9-]{36}$/i.test(instanceId)||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('FLEET_INVALID_CONFIG');
  while(!stopping) {
    try {const result=await connectorTick({central,instanceId,token,status:{source:process.env.SOURCE_COMMIT||process.env.NAUMI_SOURCE_COMMIT||'unknown',version:process.env.BUILD_VERSION||process.env.NAUMI_BUILD_VERSION||'unknown',storage:storageDriver,nas:'unknown',connector:1}});console.log('FLEET_TICK='+result.state);}
    catch {console.error('FLEET_TICK=RETRY_PENDING');if(process.argv.includes('--once'))process.exitCode=1;}
    if(process.argv.includes('--once'))break;
    await new Promise(resolve=>setTimeout(resolve,15000));
  }
}
main().catch(()=>{console.error('FLEET_CONNECTOR=INVALID_CONFIG');process.exitCode=1;});
