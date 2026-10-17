import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {releaseIdentity} from '../src/lib/release-runtime/identity';
import {transportObservation} from '../src/lib/release-runtime/http';
async function main(){
 Object.assign(process.env,{NAUMI_RELEASE_RUNTIME:'1',NAUMI_INSTANCE_ID:'transport-port-fixture',SOURCE_COMMIT:'a'.repeat(40),RELEASE_CONTROL_SECRET:randomBytes(32).toString('hex')});
 const identity=releaseIdentity(),original=globalThis.fetch,requests:string[]=[];let changedBoot=false;
 globalThis.fetch=async(input,init)=>{requests.push(String(input));assert.equal(new Headers(init?.headers).get('x-release-control-secret'),process.env.RELEASE_CONTROL_SECRET);assert.equal(init?.redirect,'error');return Response.json({identity:{...identity,...changedBoot?{bootId:randomUUID()}:{}},transport:{completeFromProcessStart:true,accountingFault:false,activeRequests:0}});};
 try{
  delete process.env.NAUMI_RELEASE_HTTP_CONTROL_PORT;assert.equal((await transportObservation()).verified,true);assert.equal(requests.at(-1),'http://127.0.0.1:3002/status');
  process.env.NAUMI_RELEASE_HTTP_CONTROL_PORT='18321';assert.equal((await transportObservation()).verified,true);assert.equal(requests.at(-1),'http://127.0.0.1:18321/status');
  changedBoot=true;assert.equal((await transportObservation()).verified,false);changedBoot=false;
  const count=requests.length;for(const port of ['','0','65536','3002/path','0xbb','3002.5']){process.env.NAUMI_RELEASE_HTTP_CONTROL_PORT=port;assert.equal((await transportObservation()).verified,false);}assert.equal(requests.length,count);
  console.log('RELEASE_TRANSPORT_PORT_PASS: default3002=1 configured_port=1 invalid_no_fetch=6 boot_identity_required=1 scope=unit');
 }finally{globalThis.fetch=original;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
