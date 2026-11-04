/** Separate-process helper: each source/central process fixes DATABASE_URL before
 * importing the immutable application pool. Input stays on stdin, not argv. */
import {readFileSync} from 'node:fs';

async function main(){
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1')throw Error('ISOLATED_FIXTURE_REQUIRED');
  const url=new URL(process.env.DATABASE_URL||'');
  if(url.hostname!=='127.0.0.1'||url.port!=='65298'||!['/fleet_central_103_20261104','/fleet_source_47_20261104'].includes(url.pathname))throw Error('NAMED_FIXTURE_REQUIRED');
  const input=JSON.parse(readFileSync(0,'utf8'));
  const {closeDatabasePools}=await import('../src/platform/db/pool');
  try{
    if(input.mode==='tick'){
      if(url.pathname!=='/fleet_source_47_20261104')throw Error('SOURCE_FIXTURE_REQUIRED');
      const {connectorTick}=await import('../src/lib/fleet/connector');
      console.log(JSON.stringify(await connectorTick({...input.options,isolated:true})));
    }else if(input.mode==='poll'){
      if(url.pathname!=='/fleet_central_103_20261104')throw Error('CENTRAL_FIXTURE_REQUIRED');
      const {pollFleetBusinessQuery}=await import('../src/lib/fleet/business-central');
      console.log(JSON.stringify(await pollFleetBusinessQuery(input.actor,input.requestId)));
    }else throw Error('UNKNOWN_MODE');
  }finally{await closeDatabasePools();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
