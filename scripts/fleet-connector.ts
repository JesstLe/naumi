import { connectorTick } from '../src/lib/fleet/connector';
import { storageDriver } from '../src/lib/storage';
import { centralUrl } from '../src/lib/fleet/contracts';
import {relayRelease} from '../src/lib/fleet/release-relay';
import {localFleetStatus} from '../src/lib/fleet/local-status';
let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
async function main() {
  if(process.env.FLEET_CONNECTOR_ENABLED!=='1') throw new Error('FLEET_CONNECTOR_DISABLED');
  const central=process.env.FLEET_CENTRAL_URL||'',instanceId=process.env.FLEET_INSTANCE_ID||'',token=process.env.FLEET_INSTANCE_TOKEN||'';
  centralUrl(central);if(!/^[a-f0-9-]{36}$/i.test(instanceId)||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('FLEET_INVALID_CONFIG');
  while(!stopping) {
    try {const result=await connectorTick({central,instanceId,token,status:await localFleetStatus(storageDriver),business:true});console.log('FLEET_TICK='+result.state);
      if(process.env.FLEET_RELEASE_RELAY_ENABLED==='1'){const relay=await relayRelease({central,instanceId,token,publicKey:process.env.FLEET_RELEASE_SIGNING_PUBLIC_KEY||'',inbox:process.env.FLEET_RELEASE_INBOX||'/var/lib/naumi-fleet/inbox',outbox:process.env.FLEET_RELEASE_OUTBOX||'/var/lib/naumi-fleet/outbox'});console.log('FLEET_RELEASE_RELAY='+relay.queued+':'+relay.acknowledged);}}
    catch {console.error('FLEET_TICK=RETRY_PENDING');if(process.argv.includes('--once'))process.exitCode=1;}
    if(process.argv.includes('--once'))break;
    await new Promise(resolve=>setTimeout(resolve,15000));
  }
}
main().catch(()=>{console.error('FLEET_CONNECTOR=INVALID_CONFIG');process.exitCode=1;});
