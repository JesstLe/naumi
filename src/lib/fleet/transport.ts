import 'server-only';
import https from 'node:https';
import {isIP} from 'node:net';
import {rootCertificates} from 'node:tls';
import {X509Certificate} from 'node:crypto';
import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {centralUrl} from './contracts';

export async function configuredCentralCA(){
  const file=process.env.FLEET_CENTRAL_CA_FILE;
  if(!file)return undefined;
  if(!path.isAbsolute(file))throw Error('FLEET_CA_PATH');
  if(process.platform==='linux'){
    for(let directory=path.dirname(file);;directory=path.dirname(directory)){
      const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==0&&info.uid!==process.getuid?.()||info.mode&0o022)throw Error('FLEET_CA_PARENT');
      if(path.dirname(directory)===directory)break;
    }
  }
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const stat=await handle.stat();if(!stat.isFile()||stat.size>20000||process.platform==='linux'&&((stat.uid!==0&&stat.uid!==process.getuid?.())||stat.mode&0o022))throw Error('FLEET_CA_FILE');
    const pem=await handle.readFile('utf8'),blocks=pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if(!blocks?.length||blocks.length>4||pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,'').trim())throw Error('FLEET_CA_FORMAT');
    for(const block of blocks){const cert=new X509Certificate(block);if(!cert.ca||Date.parse(cert.validFrom)>Date.now()||Date.parse(cert.validTo)<Date.now())throw Error('FLEET_CA_INVALID');}
    return [...rootCertificates,...blocks];
  }finally{await handle.close();}
}

/** Operator-pinned origin route retains hostname/SNI/TLS verification, never trusts a peer-supplied CA. */
export async function fleetFetch(input:string,init:RequestInit){
  const pin=process.env.FLEET_CENTRAL_RESOLVE_IP,caFile=process.env.FLEET_CENTRAL_CA_FILE;
  if(!pin&&!caFile)return fetch(input,init);
  const url=new URL(input);centralUrl(url.origin);if(url.username||url.password)throw Error('FLEET_TRANSPORT_CREDENTIAL_URL');
  if(!/^\/api\/fleet\/(poll|ack|releases\/(poll|ack))$/.test(url.pathname)||url.search||url.hash||init.method!=='POST'||typeof init.body!=='string'||Buffer.byteLength(init.body)>48000)throw Error('FLEET_TRANSPORT_REQUEST');
  if(pin&&(!isIP(pin)||/^(169\.254\.|100\.100\.100\.200$|0\.|127\.|::1$|::ffff:|fe[89ab][0-9a-f]:|ff)/i.test(pin)))throw Error('FLEET_ORIGIN_IP');
  const ca=await configuredCentralCA();
  const headers=Object.fromEntries(new Headers(init.headers));
  return new Promise<Response>((resolve,reject)=>{
    const request=https.request(url,{method:'POST',headers,ca,rejectUnauthorized:true,minVersion:'TLSv1.2',signal:init.signal||AbortSignal.timeout(30000),
      ...(pin?{lookup:(_hostname,options,callback)=>{const family=isIP(pin);if(options.all)callback(null,[{address:pin,family}]);else callback(null,pin,family);}}:{})},response=>{
      const chunks:Buffer[]=[];let bytes=0;
      response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>48000){response.destroy(Error('FLEET_RESPONSE_TOO_LARGE'));return;}chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>{
        const status=response.statusCode||502;if(status>=300&&status<400){reject(Error('FLEET_REDIRECT_DENIED'));return;}
        const resultHeaders=new Headers();for(const [key,value] of Object.entries(response.headers)){if(value!==undefined)resultHeaders.set(key,Array.isArray(value)?value.join(','):value);}
        resolve(new Response([204,205].includes(status)?null:Buffer.concat(chunks),{status,headers:resultHeaders}));
      });
    });
    request.on('error',reject);request.end(init.body);
  });
}
