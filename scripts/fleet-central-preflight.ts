import {configuredCentralCA} from '../src/lib/fleet/transport';
import {centralUrl} from '../src/lib/fleet/contracts';
import https from 'node:https';
import {isIP} from 'node:net';
async function main(){
  const central=centralUrl(process.env.FLEET_CENTRAL_URL||''),url=new URL(central),pin=process.env.FLEET_CENTRAL_RESOLVE_IP;
  if(pin&&(!isIP(pin)||/^(169\.254\.|100\.100\.100\.200$|0\.|127\.|::1$|::ffff:|fe[89ab][0-9a-f]:|ff)/i.test(pin)))throw Error('ORIGIN_IP_INVALID');
  const ca=await configuredCentralCA();
  const results=[];
  for(const pathname of ['/api/version','/api/fleet/poll']){
    const method=pathname.endsWith('/poll')?'POST':'GET',body=method==='POST'?'{}':undefined;
    const result=await new Promise<{status:number;body:string}>((resolve,reject)=>{
      const request=https.request(central+pathname,{method,ca,rejectUnauthorized:true,minVersion:'TLSv1.2',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json'},...(pin?{lookup:(_hostname,options,callback)=>{const family=isIP(pin);if(options.all)callback(null,[{address:pin,family}]);else callback(null,pin,family);}}:{})},response=>{
        const chunks:Buffer[]=[];let bytes=0;response.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes>2000)return;chunks.push(b);});response.on('error',reject);response.on('end',()=>resolve({status:response.statusCode||0,body:bytes>2000?'':Buffer.concat(chunks).toString()}));
      });request.on('error',reject);request.end(body);
    });
    let json;try{json=result.body.trim().startsWith('{')?JSON.parse(result.body):null;}catch{json=null;}
    results.push({path:pathname,status:result.status,json:Boolean(json),...(pathname==='/api/version'&&json?{source:json.commit,version:json.version}:{}),...(pathname.endsWith('/poll')?{unauthenticatedDenied:[400,401].includes(result.status)&&Boolean(json)}:{})});
  }
  const ready=results[0].status===200&&results[0].json&&results[1].unauthenticatedDenied;
  console.log(JSON.stringify({tlsVerified:true,hostname:url.hostname,originPinned:Boolean(pin),credentialsSent:false,productionWrites:0,ready,checks:results}));
  if(!ready)process.exitCode=2;
}
main().catch(()=>{console.error('FLEET_CENTRAL_PREFLIGHT=TLS_OR_RESPONSE_FAILED CREDENTIALS_SENT=0');process.exitCode=1;});
