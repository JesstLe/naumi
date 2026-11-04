/** Separate-process helper: each source/central process fixes DATABASE_URL before
 * importing the immutable application pool. Input stays on stdin, not argv. */
import {readFileSync} from 'node:fs';
import {fleetFixtureUrl} from './lib/fleet-business-fixture-url';

async function main(){
  const url=fleetFixtureUrl(process.env.DATABASE_URL,'worker');
  process.env.DATABASE_URL=url.toString();
  const input=JSON.parse(readFileSync(0,'utf8'));
  if(input.mode==='tick'){
    if(url.pathname!=='/fleet_source_47_20261104')throw Error('SOURCE_FIXTURE_REQUIRED');
  }else if(input.mode==='poll'){
    if(url.pathname!=='/fleet_central_103_20261104')throw Error('CENTRAL_FIXTURE_REQUIRED');
  }else throw Error('UNKNOWN_MODE');
  const {closeDatabasePools}=await import('../src/platform/db/pool');
  try{
    if(input.mode==='tick'){
      const {connectorTick}=await import('../src/lib/fleet/connector');
      console.log(JSON.stringify(await connectorTick({...input.options,isolated:true})));
    }else if(input.mode==='poll'){
      const {pollFleetBusinessQuery}=await import('../src/lib/fleet/business-central');
      console.log(JSON.stringify(await pollFleetBusinessQuery(input.actor,input.requestId)));
    }else throw Error('UNKNOWN_MODE');
  }finally{await closeDatabasePools();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
