import 'server-only';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {request as httpsRequest} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {isIP} from 'node:net';
import {statusSchema} from './contracts';
export function localAppOrigin(raw:string){const url=new URL(raw);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['127.0.0.1','localhost','[::1]','app','naumi-app','host.docker.internal'].includes(url.hostname))throw Error('FLEET_LOCAL_APP_REQUIRED');return url.origin;}
/** Host selection stays on the already allowlisted local transport; no URL,
 * port, credentials, control characters or metadata-host shortcut is accepted. */
export function localAppHost(raw:string){
  if(raw.length>253||raw!==raw.trim()||!raw.split('.').every(p=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(p))
    ||raw==='0.0.0.0'||raw.startsWith('169.254.')||raw==='100.100.100.200'||/(^|\.)metadata(\.|$)/i.test(raw))throw Error('FLEET_LOCAL_HOST_REQUIRED');
  if(/^\d+(?:\.\d+){3}$/.test(raw)&&raw.split('.').some(p=>Number(p)>255))throw Error('FLEET_LOCAL_HOST_REQUIRED');
  return raw.toLowerCase();
}
/** Connect only to the allowlisted same-host gateway, but verify TLS against
 * the explicitly selected virtual host. IP hosts use IP SAN verification and
 * no IP SNI. The default trusted roots remain in force; redirects are errors. */
async function localVersionText(origin:string,host?:string):Promise<string>{
  if(host&&new URL(origin).protocol==='https:')return new Promise((resolve,reject)=>{
    const request=httpsRequest(origin+'/api/version',{
      method:'GET',headers:{Host:host},agent:false,rejectUnauthorized:true,
      servername:isIP(host)?'':host,checkServerIdentity:(_hostname,certificate)=>checkServerIdentity(host,certificate),
      signal:AbortSignal.timeout(5000),
    },response=>{
      if(!response.statusCode||response.statusCode<200||response.statusCode>=300){request.destroy(Error('LOCAL_UNHEALTHY'));return;}
      const chunks:Buffer[]=[];let bytes=0;
      response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>2000)request.destroy(Error('LOCAL_VERSION_INVALID'));else chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
    });
    request.on('error',reject);request.end();
  });
  const response=await fetch(origin+'/api/version',{redirect:'error',signal:AbortSignal.timeout(5000),...(host?{headers:{Host:host}}:{})});
  if(!response.ok)throw Error('LOCAL_UNHEALTHY');
  return response.text();
}
export async function localFleetStatus(storage:'local'|'r2'|'s3'){
  const single=process.env.FLEET_SINGLE_APP_ORIGIN;
  let origins=single?[single]:[process.env.FLEET_APP_ORIGIN,process.env.FLEET_DESKTOP_ORIGIN,process.env.FLEET_ENTERPRISE_ORIGIN];
  let source='unknown',version='unknown';
  const statusFile=single?undefined:process.env.FLEET_ACTIVE_SLOTS_FILE;
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
    try{const host=single&&process.env.FLEET_SINGLE_APP_HOST?localAppHost(process.env.FLEET_SINGLE_APP_HOST):undefined;
      const states=await Promise.all(origins.map(async raw=>{const text=await localVersionText(localAppOrigin(raw!),host);if(text.length>2000)throw Error('LOCAL_VERSION_INVALID');const value=JSON.parse(text);if(!/^[a-f0-9]{40}$/.test(value.commit)||!Number.isSafeInteger(Number(value.version))||Number(value.version)<1)throw Error('LOCAL_VERSION_INVALID');return {source:value.commit as string,version:String(value.version)};}));
      if(states.every(s=>s.source===states[0].source&&s.version===states[0].version)){source=states[0].source;version=states[0].version;}
    }catch{/* Unknown state blocks registration/follow; does not stop enterprise business. */}
  }
  return statusSchema.parse({source,version,storage,nas:'unknown',connector:1});
}
