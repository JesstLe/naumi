import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {localAppOrigin,localFleetStatus} from '../src/lib/fleet/local-status';
async function main(){for(const origin of ['http://169.254.169.254','http://100.100.100.200','https://evil.test','http://token@app','http://app/path'])assert.throws(()=>localAppOrigin(origin));assert.equal(localAppOrigin('http://app:3000'),'http://app:3000');
  const previous=globalThis.fetch,source='1'.repeat(40);Object.assign(process.env,{FLEET_APP_ORIGIN:'http://app:3000',FLEET_DESKTOP_ORIGIN:'http://app:3001',FLEET_ENTERPRISE_ORIGIN:'http://app:3002',SOURCE_COMMIT:'f'.repeat(40),BUILD_VERSION:'999'});
  const directory=await mkdtemp(path.join(tmpdir(),'fleet-local-status-'));
  try{globalThis.fetch=async()=>Response.json({commit:source,version:123});assert.equal((await localFleetStatus('s3')).source,source);assert.equal((await localFleetStatus('s3')).version,'123');
    globalThis.fetch=async(input)=>Response.json({commit:String(input).includes('3002')?'2'.repeat(40):source,version:123});assert.equal((await localFleetStatus('s3')).source,'unknown');globalThis.fetch=async()=>{throw Error('offline');};assert.equal((await localFleetStatus('s3')).source,'unknown');delete process.env.FLEET_ENTERPRISE_ORIGIN;assert.equal((await localFleetStatus('s3')).source,'unknown');
    process.env.FLEET_ACTIVE_SLOTS_FILE=path.join(directory,'active-status.json');
    await writeFile(process.env.FLEET_ACTIVE_SLOTS_FILE,JSON.stringify({schemaVersion:1,ports:{ui:13107,desktop:13108,enterprise:13109}}),{mode:0o600});
    const visited:string[]=[];globalThis.fetch=async(input)=>{visited.push(String(input));return Response.json({commit:source,version:123});};
    assert.equal((await localFleetStatus('s3')).source,source);assert.deepEqual(visited,['http://127.0.0.1:13107/api/version','http://127.0.0.1:13108/api/version','http://127.0.0.1:13109/api/version']);
    await writeFile(process.env.FLEET_ACTIVE_SLOTS_FILE,JSON.stringify({schemaVersion:1,ports:{ui:13107,desktop:13107,enterprise:13109}}));assert.equal((await localFleetStatus('s3')).source,'unknown');
    await writeFile(process.env.FLEET_ACTIVE_SLOTS_FILE,'{}');assert.equal((await localFleetStatus('s3')).source,'unknown');
    console.log('FLEET_LOCAL_STATUS=PASS ACTUAL_THREE_SLOTS=1 CONNECTOR_ENV_NOT_SITE_VERSION=1 MIXED_UNKNOWN=1 OFFLINE_UNKNOWN=1 MISSING_UNKNOWN=1 METADATA_DENIED=1 SWITCHED_SLOT_FILE=1 INVALID_FILE_NO_STALE_FALLBACK=1');
  }finally{globalThis.fetch=previous;delete process.env.FLEET_ACTIVE_SLOTS_FILE;await rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
