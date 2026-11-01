// Execute the actual PG/HTTP business verifier in two explicit failure modes.
// Expected child failures stay visible; the parent checks teardown, not a PASS
// of the failed business call. No replacement provider/route or fake timers.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL).hostname,'127.0.0.1');
const root=process.cwd(),out=path.resolve(process.env.BUSINESS_ROUTING_LIFECYCLE_EVIDENCE||'output/business-routing-lifecycle');
fs.mkdirSync(out,{recursive:true});const source=path.join(root,'scripts/verify-business-routing.ts'),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const cases=[];
for(const [mode,reason,supplierCalls]of [['fail-after-start','ROUTING_FIXTURE_AFTER_START',1],['reject-before-start','BUSINESS_ROUTING_UPSTREAM_NOT_ENTERED status=401',0]]){
 const command=[process.execPath,'--conditions=react-server','--import','tsx',source,'--'+mode];
 const stdout=path.join(out,mode+'.stdout.log'),stderr=path.join(out,mode+'.stderr.log'),a=fs.openSync(stdout,'wx'),b=fs.openSync(stderr,'wx');let child;
 try{child=spawnSync(command[0],command.slice(1),{cwd:root,env:process.env,stdio:['ignore',a,b],windowsHide:true});}finally{fs.closeSync(a);fs.closeSync(b);}
 const row={mode,command,input:'Actual child/isolatedPG/loopbackHTTP/realclock;explicit fixture-only failure',sourceSha256:hash(source),exit:child.status,signal:child.signal,stdout,stderr,stdoutSha256:hash(stdout),stderrSha256:hash(stderr)};
 cases.push(row);fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'RUNNING',cases},null,2)+'\n');
 assert.equal(child.status,1,fs.readFileSync(stderr,'utf8'));
 assert.ok(fs.readFileSync(stderr,'utf8').includes(reason));
 const literal=`BUSINESS_ROUTING_CLEANUP=PASS PENDING_DRAINED=1 PENDING_SUPPLIER_CALLS=${supplierCalls} POOLS_CLOSED=1 HTTP_CLOSED=1 TEMP_MEDIA_REMOVED=1`;
 assert.ok(fs.readFileSync(stdout,'utf8').includes(literal));
 console.log(`PASS ${mode} ORIGINAL_CHILD_EXIT=1 PENDING_SUPPLIER_CALLS=${supplierCalls} CLEANUP=PASS`);
}
fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',sourceSha256:hash(source),cases,expectedChildExit:1,realPostgres:true,realHttp:true,realClock:true,realSupplierRequests:0},null,2)+'\n');
console.log('BUSINESS_ROUTING_LIFECYCLE=PASS CASES=2 EXPECTED_CHILD_EXIT=1 REAL_PG_HTTP=1 TIMERS=ACTUAL PRODUCTION_SUPPLIER=0');
