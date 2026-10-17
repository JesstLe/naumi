// Executed through stdin inside an owned fixture container, never baked into the runtime image.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,sign} from 'node:crypto';
assert(process.platform==='linux'&&process.getuid()===1000);
const c=JSON.parse(await readFile('/scratch/smoke/runtime.json','utf8'));
const fixture=JSON.parse(await readFile('/scratch/smoke/fixture.json','utf8'));
const role=process.env.RUNTIME_ROLE,base='http://127.0.0.1:'+(role==='worker'?c.workerPort:c.apiPort);
const deadline=AbortSignal.timeout(10000);
const request=(path,options={})=>fetch(base+path,{...options,signal:deadline});
const readiness=await request('/readyz');assert.equal(readiness.status,200);const ready=await readiness.json();
assert.equal(ready.role,role);assert.equal(ready.releaseId,c.releaseId);assert.equal(ready.ready,true);
assert.equal(ready.checks.sourceSessionVerification,'external-login-probe-required');
await assert.rejects(writeFile('/app/forbidden','no'),/EROFS|EACCES/);
const now=Math.floor(Date.now()/1000),claims={iss:'naumi-workflow-bff',aud:'enterprise-workflow-source',sourceInstance:fixture.tenant.sourceInstance,sourceEnterprise:fixture.tenant.sourceEnterprise,sourceSubject:'worker@runtime.fixture.invalid',teamId:fixture.team,iat:now,exp:now+45,jti:randomUUID()};
const encoded=[{alg:'EdDSA',typ:'JWT',kid:'runtime'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
const token=encoded+'.'+sign(null,Buffer.from(encoded),fixture.privateKey).toString('base64url');
if(role==='api') {
  assert.equal((await request('/v1/orders')).status,401);
  const headers={authorization:'Bearer '+token};
  const order=await request('/v1/orders/'+fixture.orderId,{headers});assert.equal(order.status,200);assert.equal((await order.json()).order.operations.status,'signed');
  const asset=await request('/v1/delivery/download?id='+fixture.assetId,{headers});assert.equal(asset.status,200);assert.deepEqual(Buffer.from(await asset.arrayBuffer()),Buffer.from(fixture.bytes,'base64'));
} else {
  assert.equal(role,'worker');assert.equal(ready.acceptingWork,false);
  assert.equal((await request('/v1/orders',{headers:{authorization:'Bearer '+token}})).status,404);
}
const headers={authorization:'Bearer '+c.controlToken,'content-type':'application/json'};
const stateResponse=await request('/internal/lifecycle/status',{headers});assert.equal(stateResponse.status,200);const state=await stateResponse.json();
const target={installationId:c.installationId,releaseId:c.releaseId,slot:c.slot,bootId:state.bootId,role,operationId:randomUUID(),reason:'isolated production-image acceptance'};
const drain=await request('/internal/lifecycle/drain',{method:'POST',headers,body:JSON.stringify(target)});assert.equal(drain.status,202);
assert.equal((await request('/readyz')).status,503);
// Lifecycle stop closes PID 1 only after its accepted work is drained.
const stopped=await request('/internal/lifecycle/stop',{method:'POST',headers,body:JSON.stringify(target)});assert.equal(stopped.status,202);
console.log('LINUX_CONTAINER_PASS: role='+role+' uid1000=1 readonly=1 actual_entrypoint=1 persisted_bytes='+(role==='api'?1:'not-applicable')+' drain503=1 stop202=1');
