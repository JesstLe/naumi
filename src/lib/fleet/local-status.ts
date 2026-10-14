import 'server-only';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {statusSchema} from './contracts';
export function localAppOrigin(raw:string){const url=new URL(raw);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['127.0.0.1','localhost','[::1]','app','naumi-app'].includes(url.hostname))throw Error('FLEET_LOCAL_APP_REQUIRED');return url.origin;}
export async function localFleetStatus(storage:'local'|'r2'|'s3'){
  let origins=[process.env.FLEET_APP_ORIGIN,process.env.FLEET_DESKTOP_ORIGIN,process.env.FLEET_ENTERPRISE_ORIGIN];
  let source='unknown',version='unknown';
  const statusFile=process.env.FLEET_ACTIVE_SLOTS_FILE;
  if(statusFile){
    try{
      if(!path.isAbsolute(statusFile))throw Error('LOCAL_STATUS_PATH');
      const handle=await open(statusFile,constants.O_RDONLY|constants.O_NOFOLLOW);
      try{
        const stat=await handle.stat();if(!stat.isFile()||stat.size>2000||process.platform==='linux'&&(stat.uid!==0||stat.mode&0o022))throw Error('LOCAL_STATUS_FILE');
        const data=JSON.parse(await handle.readFile('utf8'));
        if(data.schemaVersion!==1||Object.keys(data).sort().join(',')!=='ports,schemaVersion'||!data.ports||Object.keys(data.ports).sort().join(',')!=='desktop,enterprise,ui')throw Error('LOCAL_STATUS_INVALID');
        const ports=['ui','desktop','enterprise'].map(name=>data.ports[name]);
        if(new Set(ports).size!==3||!ports.every(p=>Number.isInteger(p)&&p>=1024&&p<=65535))throw Error('LOCAL_STATUS_PORTS');
        origins=ports.map(p=>'http://127.0.0.1:'+p);
      }finally{await handle.close();}
    }catch{return statusSchema.parse({source,version,storage,nas:'unknown',connector:1});}
  }
  if(origins.every(Boolean)){
    try{const states=await Promise.all(origins.map(async raw=>{const response=await fetch(localAppOrigin(raw!)+ '/api/version',{redirect:'error',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('LOCAL_UNHEALTHY');const text=await response.text();if(text.length>2000)throw Error('LOCAL_VERSION_INVALID');const value=JSON.parse(text);if(!/^[a-f0-9]{40}$/.test(value.commit)||!Number.isSafeInteger(Number(value.version))||Number(value.version)<1)throw Error('LOCAL_VERSION_INVALID');return {source:value.commit as string,version:String(value.version)};}));
      if(states.every(s=>s.source===states[0].source&&s.version===states[0].version)){source=states[0].source;version=states[0].version;}
    }catch{/* Unknown state blocks registration/follow; does not stop enterprise business. */}
  }
  return statusSchema.parse({source,version,storage,nas:'unknown',connector:1});
}
