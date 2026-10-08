// Exercise the live probe in a no-network, no-credential local transport fixture.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const objects=new Map<string,Buffer>();
let mode='success';let count=0;
const server=createServer(async(req,res)=>{
 count++;
 const key=(req.url||'/').replace(/^\/fixture-bucket\//,'').replace(/^\//,'');
 if(!req.headers.authorization){res.writeHead(403);res.end();return;}
 assert.match(req.headers.authorization,/^AWS4-HMAC-SHA256 Credential=fixture-access\//);
 if(req.method==='PUT'){const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);objects.set(key,Buffer.concat(chunks));res.writeHead(200);res.end();return;}
 if(req.method==='DELETE'){
  if(mode==='cleanup-failure'){res.writeHead(403);res.end();return;}
  objects.delete(key);res.writeHead(204);res.end();return;
 }
 const b=objects.get(key);if(!b){res.writeHead(404);res.end();return;}
 const headers={'content-type':'application/octet-stream','content-length':String(b.length),'accept-ranges':'bytes'};
 if(req.method==='HEAD'){res.writeHead(200,headers);res.end();return;}
 const m=String(req.headers.range||'').match(/^bytes=(\d+)-(\d+)$/);
 if(m){const start=Number(m[1]),end=Number(m[2]);res.writeHead(206,{...headers,'content-length':String(end-start+1),'content-range':`bytes ${start}-${end}/${b.length}`});res.end(b.subarray(start,end+1));return;}
 res.writeHead(200,headers);res.end(mode==='read-failure'?Buffer.alloc(b.length):b);
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const port=(server.address() as {port:number}).port;
try{
 for(const [scenario,expected] of [['success',0],['read-failure',2],['cleanup-failure',74]] as const){
  mode=scenario;
  const child=spawn(process.execPath,['--conditions','react-server','/tmp/verify-oss-live.ts'],{env:{...process.env,STORAGE_DRIVER:'s3',S3_ENDPOINT:`http://oss-fixture.local:${port}`,S3_REGION:'fixture-region',S3_ACCESS_KEY_ID:'fixture-access',S3_SECRET_ACCESS_KEY:'fixture-only',S3_BUCKET:'fixture-bucket',S3_FORCE_PATH_STYLE:'false',S3_PUBLIC_BASE_URL:'',DATABASE_URL:'',NAUMI_PROBE_COMMIT:'fixture',NAUMI_PROBE_IMAGE:'fixture',NAUMI_PROBE_CONFIG_HASH:'fixture'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout?.on('data',b=>output+=b);child.stderr?.on('data',b=>output+=b);
  const rc=await new Promise<number|null>(r=>child.once('exit',r));
  assert.equal(rc,expected,output);
  const receipt=JSON.parse(await readFile('/evidence/receipt.json','utf-8'));
  assert.equal(receipt.exitStatus,expected);assert.equal(receipt.passed,scenario==='success');
  assert.equal(receipt.cleanup,scenario==='cleanup-failure'?'FAIL':'PASS');
  assert.match(receipt.key,/^naumi-staging-preflight\/[0-9a-f-]+\.bin$/);
  assert.equal(output.includes('fixture-only'),false);
  console.log(`OSS_LIVE_PROBE_FIXTURE=PASS CASE=${scenario} EXPECTED_EXIT=${expected} RECEIPT=1 CLEANUP=${receipt.cleanup}`);
  objects.clear();
 }
 console.log(`OSS_LIVE_PROBE_CONTRACT=PASS CASES=3 MOCK_HTTP_REQUESTS=${count} REAL_OSS_REQUESTS=0 MODEL_CALLS=0`);
}finally{await new Promise<void>(r=>server.close(()=>r()));}
