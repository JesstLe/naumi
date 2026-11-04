/** Actual connectorTick/localFleetStatus source functions and real contracts/HMAC,
 * with finite transport, application and local-version I/O. No PG, HTTP or network.
 * Git and restored-copy modes load the actual old producer bytes, never rewrite
 * them into the proposed implementation. A new helper absent at the old baseline
 * is used only to model the supporting central and is recorded as harness code. */
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseline=process.argv.find(a=>a.startsWith('--baseline='))?.slice(11);
const sourceArg=process.argv.find(a=>a.startsWith('--source-root='))?.slice(14);
const outputArg=process.argv.find(a=>a.startsWith('--output-dir='))?.slice(13);
const sourceRoot=sourceArg?path.resolve(sourceArg):undefined;
const expectBaseline=Boolean(baseline||process.argv.includes('--expect-baseline'));
const OUT=outputArg?path.resolve(outputArg):path.join(ROOT,'output/fleet-business-heartbeat-negotiation-20261105/tests');
assert.ok(process.argv.slice(2).every(a=>a.startsWith('--baseline=')||a.startsWith('--source-root=')||a.startsWith('--output-dir=')||a==='--expect-baseline'));
assert.ok(!process.argv.includes('--baseline=')&&!process.argv.includes('--source-root=')&&!process.argv.includes('--output-dir='));
assert.ok(!(baseline&&sourceRoot));if(baseline)assert.match(baseline,/^[a-zA-Z0-9_./-]+$/);
assert.ok(!sourceRoot||sourceRoot!==ROOT);assert.ok(!process.argv.includes('--expect-baseline')||sourceRoot);
const connector='src/lib/fleet/connector.ts',local='src/lib/fleet/local-status.ts',support='src/lib/fleet/business-support.ts',contracts='src/lib/fleet/contracts.ts';
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceSHA256={},sourceOrigins={},sourceRoles={},loaded=new Map();
async function source(file){
  if(loaded.has(file))return loaded.get(file);
  let text,origin,role='system-under-test';
  if(baseline){
    try{text=execFileSync('git',['show',baseline+':'+file],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']});origin='git:'+baseline;}
    catch(error){if(file!==support)throw error;text=await readFile(path.join(ROOT,file),'utf8');origin=path.join(ROOT,file);role='harness-only helper absent from old baseline';}
  }else if(sourceRoot){
    try{text=await readFile(path.join(sourceRoot,file),'utf8');origin=path.join(sourceRoot,file);}
    catch(error){
      if(file===support&&expectBaseline&&error.code==='ENOENT'){text=await readFile(path.join(ROOT,file),'utf8');origin=path.join(ROOT,file);role='harness-only helper absent from restored old baseline';}
      else if(file===contracts&&error.code==='ENOENT'){text=await readFile(path.join(ROOT,file),'utf8');origin=path.join(ROOT,file);role='unchanged runtime schema dependency outside restored producer copy';}
      else throw error;
    }
  }else{text=await readFile(path.join(ROOT,file),'utf8');origin=path.join(ROOT,file);}
  sourceSHA256[file]=hash(text);sourceOrigins[file]=origin;sourceRoles[file]=role;loaded.set(file,text);return text;
}
const checks=[],scenarios=[];
const check=(value,name)=>checks.push({name,passed:Boolean(value)});
function extract(text,names,file){
  const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  return names.map(name=>{
    const fn=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
    assert.ok(fn,'actual '+name+' declaration must exist');return fn.getText(tree);
  }).join('\n');
}
const transpile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;

async function main(){
  const connectorText=await source(connector),localText=await source(local);
  await source(contracts);await source(support);
  const built=await build({absWorkingDir:ROOT,stdin:{contents:`export {statusSchema,centralUrl,signCommand,verifyCommand,resultSchema} from './${contracts}';export {signFleetBusinessSupport,verifyFleetBusinessSupport} from './${support}';`,resolveDir:ROOT,sourcefile:'heartbeat-real-contracts.ts'},bundle:true,write:false,platform:'node',format:'cjs',target:'node20',logLevel:'silent',plugins:[{name:'actual-contract-sources',setup(p){
    p.onLoad({filter:/\.[jt]s$/},async args=>{const relative=path.relative(ROOT,args.path).replaceAll('\\','/');if([contracts,support].includes(relative))return{contents:await source(relative),loader:'ts',resolveDir:path.dirname(args.path)};});
  }}]});
  const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const real=module.exports;
  for(const name of ['statusSchema','centralUrl','signCommand','verifyCommand','resultSchema','signFleetBusinessSupport','verifyFleetBusinessSupport'])assert.ok(real[name],'real '+name+' loaded');
  const tickSource=transpile(extract(connectorText,['connectorTick'],connector)+'\nglobalThis.actualTick=connectorTick;');
  const localSource=transpile(extract(localText,['localAppOrigin','localAppHost','localVersionText','localFleetStatus'],local)+'\nglobalThis.actualLocalStatus=localFleetStatus;');
  const instance='47105059-0142-4000-8000-000000000047',other='10330076-0093-4000-8000-000000000103',token='A'.repeat(43),wrongToken='B'.repeat(43);
  const status={source:'a'.repeat(40),version:'fixture',storage:'s3',nas:'unknown',connector:1,business:1};
  const legacyStatus={...status};delete legacyStatus.business;
  const currentQuery=()=>({type:'business.query',view:'usage',days:30,asOf:new Date().toISOString(),page:1,search:''});
  const command=operation=>({id:randomUUID(),instanceId:instance,actor:'root@central.fixture',expiresAt:Date.now()+300000,operation});
  const control=()=>command({type:'users.ban',email:'target@fixture.test',banned:true,expectedBanned:false});
  const business=()=>command(currentQuery());
  const envelope=c=>({command:real.signCommand(c,token),leaseId:randomUUID()});
  const succeeded={status:'succeeded',data:{email:'target@fixture.test',banned:true}};
  assert.equal(real.resultSchema.parse(succeeded).status,'succeeded');
  const oldStatusSchema=real.statusSchema.omit({business:true}).strict();
  const nonces=[];
  function runner(handler){
    const state={requests:[],applied:[],handler};
    const context=vm.createContext({exports:{},Buffer,AbortSignal,Response,Date,URL,Error,JSON,randomUUID,
      centralUrl:real.centralUrl,statusSchema:real.statusSchema,verifyCommand:real.verifyCommand,
      verifyFleetBusinessSupport:real.verifyFleetBusinessSupport,
      fleetFetch:async(url,init)=>{
        const data=JSON.parse(init.body),endpoint=new URL(url).pathname.split('/').at(-1);
        nonces.push(data.nonce);state.requests.push({endpoint,nonce:data.nonce,...(data.status?{status:{...data.status}}:{}),...(data.commandId?{commandId:data.commandId,leaseId:data.leaseId,result:data.result}:{})});
        assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert.ok(init.signal instanceof AbortSignal);
        assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+token);
        assert.equal(new Headers(init.headers).get('x-naumi-instance'),instance);
        return state.handler(endpoint,data,state);
      },
      applyFleetCommand:async(c,id)=>{assert.equal(id,instance);state.applied.push(c);return succeeded;},
    });
    vm.runInContext(tickSource,context,{timeout:2000});
    state.tick=async(options={})=>{try{return{result:await context.actualTick({central:'http://127.0.0.1:61111',instanceId:instance,token,status,isolated:true,...options})};}catch(error){return{error:String(error?.message||error)};}};
    return state;
  }
  const polls=s=>s.requests.filter(r=>r.endpoint==='poll'),acks=s=>s.requests.filter(r=>r.endpoint==='ack');
  const proof=request=>real.signFleetBusinessSupport(instance,request.nonce,token);
  const reply=value=>Response.json(value);
  function save(name,state,result){scenarios.push({name,...result,requests:state.requests,applied:state.applied.map(c=>({id:c.id,type:c.operation.type}))});}

  // A real old strict status schema rejects the original unconditional field.
  for(const [name,options]of [['old-central-local-status-flag',{}],['old-central-explicit-local-capability',{status:legacyStatus,business:true}]]){
    const c=control(),leased=envelope(c);
    const s=runner((endpoint,data)=>{if(endpoint==='ack')return reply({ok:true});if(!oldStatusSchema.safeParse(data.status).success)return Response.json({error:'参数无效'},{status:400});return reply(leased);});
    const r=await s.tick(options);
    check(r.result?.state==='succeeded',name+': old strict central still executes control');
    check(polls(s).length===1&&!Object.hasOwn(polls(s)[0].status,'business'),name+': first poll uses exact legacy-compatible status');
    check(s.applied.length===1&&s.applied[0].id===c.id&&acks(s).length===1,name+': signed control applies and ACKs once');
    check(acks(s)[0]?.commandId===c.id&&acks(s)[0]?.leaseId===leased.leaseId,name+': original command and lease identity retained');save(name,s,r);
  }
  {
    const c=business(),leased=envelope(c);
    const s=runner((endpoint,data)=>endpoint==='ack'?reply({ok:true}):data.status.business===1?reply(leased):reply({command:null,leaseId:null,businessSupport:proof(data)}));
    const r=await s.tick();
    check(r.result?.state==='succeeded','new central: signed support enables a business command');
    check(polls(s).length===2&&!Object.hasOwn(polls(s)[0].status,'business')&&polls(s)[1].status.business===1,'new central: legacy probe precedes business advertisement');
    check(s.applied.length===1&&s.applied[0].id===c.id&&acks(s).length===1,'new central: business command applies and ACKs once');
    check(acks(s)[0]?.commandId===c.id&&acks(s)[0]?.leaseId===leased.leaseId,'new central: business command and lease identities retained');save('new-central-business',s,r);
  }
  const badProofs=[
    ['wrong-nonce',data=>real.signFleetBusinessSupport(instance,randomUUID(),token)],
    ['wrong-instance',data=>real.signFleetBusinessSupport(other,data.nonce,token)],
    ['wrong-token',data=>real.signFleetBusinessSupport(instance,data.nonce,wrongToken)],
    ['tampered-version',data=>({...proof(data),version:2})],
    ['extra-property',data=>({...proof(data),extra:true})],
    ['missing-signature',data=>({version:1,instanceId:instance,nonce:data.nonce})],
    ['malformed-string',()=> 'business:1'],
    ['missing-support',()=>undefined],
  ];
  for(const[name,create]of badProofs){
    const s=runner((_endpoint,data)=>reply({command:null,leaseId:null,businessSupport:create(data)}));const r=await s.tick();
    check(r.result?.state==='idle','proof '+name+': absent confirmation remains idle');
    check(polls(s).length===1&&polls(s).every(p=>!Object.hasOwn(p.status,'business')),'proof '+name+': no business advertisement');
    check(s.applied.length===0&&acks(s).length===0,'proof '+name+': no application or fabricated ACK');save('proof-'+name,s,r);
  }
  {
    const s=runner((_endpoint,data)=>reply({command:null,leaseId:null,businessSupport:proof(data)}));const r=await s.tick({status:legacyStatus});
    check(r.result?.state==='idle'&&polls(s).length===1,'no local capability: central proof alone does not enable business');
    check(polls(s).every(p=>!Object.hasOwn(p.status,'business')),'no local capability: only legacy status is sent');save('no-local-capability',s,r);
  }
  {
    const c=control(),leased=envelope(c);const s=runner((endpoint,data)=>reply(endpoint==='ack'?{ok:true}:{...leased,businessSupport:proof(data)}));const r=await s.tick();
    check(r.result?.state==='succeeded'&&polls(s).length===1,'control-first response does not add a negotiation poll');
    check(!Object.hasOwn(polls(s)[0].status,'business')&&s.applied.length===1&&acks(s).length===1,'control-first remains legacy-compatible and exactly ACKed');save('new-central-control-first',s,r);
  }
  {
    const c=control(),leased=envelope(c);let count=0;
    const s=runner((endpoint,data)=>{if(endpoint==='ack')return reply({ok:true});count++;if(count===1)return reply({command:null,leaseId:null,businessSupport:proof(data)});if(count===2)return Response.json({error:'参数无效'},{status:400});if(!oldStatusSchema.safeParse(data.status).success)return Response.json({error:'参数无效'},{status:400});return reply(leased);});
    const r=await s.tick();
    check(r.result?.state==='succeeded','central changes after proof: explicit second-poll400 falls back to legacy control');
    check(polls(s).length===3&&polls(s)[1].status.business===1&&!Object.hasOwn(polls(s)[2].status,'business'),'second-poll400 has exactly one legacy fallback');
    check(s.applied.length===1&&s.applied[0].id===c.id&&acks(s).length===1,'fallback control applies and ACKs once');save('central-rollback-between-polls',s,r);
  }
  for(const code of [401,403,429,503,'network','network400-message']){
    let count=0;const s=runner((_endpoint,data)=>{count++;if(count===1)return reply({command:null,leaseId:null,businessSupport:proof(data)});if(code==='network')throw Error('fixture-network-lost');if(code==='network400-message')throw Error('FLEET_CONNECTION_400');return Response.json({error:'fixture'},{status:code});});
    const r=await s.tick(),expected=typeof code==='number'?'FLEET_CONNECTION_'+code:code==='network'?'fixture-network-lost':'FLEET_CONNECTION_400';
    check(r.error===expected,'second-poll '+code+': original failure is preserved');
    check(polls(s).length===2&&s.applied.length===0&&acks(s).length===0,'second-poll '+code+': no fallback on non400 response or message-only network error');save('no-fallback-'+code,s,r);
  }
  {
    const c=business(),leased=envelope(c);const s=runner((_endpoint,data)=>reply({...leased,businessSupport:proof(data)}));const r=await s.tick();
    check(r.error==='FLEET_BUSINESS_NOT_NEGOTIATED','unsolicited first-poll business command is rejected before apply');
    check(s.applied.length===0&&acks(s).length===0&&polls(s).length===1,'unsolicited command does not create a business result or ACK');save('unnegotiated-business-command',s,r);
  }
  for(const invalid of ['lease','signature']){
    const c=business(),leased=envelope(c);if(invalid==='lease')delete leased.leaseId;else leased.command.signature='0'.repeat(64);
    const s=runner((_endpoint,data)=>data.status.business===1?reply(leased):reply({command:null,leaseId:null,businessSupport:proof(data)}));const r=await s.tick();
    check(Boolean(r.error),'invalid '+invalid+': command processing rejects');
    check(polls(s).length===2&&s.applied.length===0&&acks(s).length===0,'invalid '+invalid+': no apply or ACK after negotiated poll');save('invalid-'+invalid,s,r);
  }
  {
    const b=business(),businessLease=envelope(b),c=control(),controlLease=envelope(c);
    const s=runner((endpoint,data)=>endpoint==='ack'?reply({ok:true}):data.status.business===1?reply(businessLease):reply({command:null,leaseId:null,businessSupport:proof(data)}));
    const first=await s.tick(),offset=s.requests.length;
    s.handler=(endpoint,data)=>{if(endpoint==='ack')return reply({ok:true});return oldStatusSchema.safeParse(data.status).success?reply(controlLease):Response.json({error:'参数无效'},{status:400});};
    const second=await s.tick(),next=s.requests.slice(offset);
    check(first.result?.state==='succeeded'&&second.result?.state==='succeeded','next tick after central downgrade still executes its control');
    check(next.filter(r=>r.endpoint==='poll').length===1&&next.filter(r=>r.status).every(r=>!Object.hasOwn(r.status,'business')),'support is not cached across ticks or central generations');
    check(s.applied.length===2&&s.applied[1].id===c.id,'downgrade never replays the earlier business command');save('same-connector-next-tick-old-central',s,{first,second});
  }
  const fixedNonce='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',signed=real.signFleetBusinessSupport(instance,fixedNonce,token);
  check(real.verifyFleetBusinessSupport(signed,instance,fixedNonce,token),'real HMAC helper accepts same instance/nonce/token');
  check(signed.signature===createHmac('sha256',token).update('fleet-business-support:v1:'+JSON.stringify([instance,fixedNonce])).digest('hex'),'real HMAC helper uses its distinct documented context');
  check(!real.verifyFleetBusinessSupport(signed,other,fixedNonce,token),'real HMAC helper rejects other instance');
  check(!real.verifyFleetBusinessSupport(signed,instance,randomUUID(),token),'real HMAC helper rejects other nonce');
  check(!real.verifyFleetBusinessSupport(signed,instance,fixedNonce,wrongToken),'real HMAC helper rejects other token');
  check(!real.verifyFleetBusinessSupport({...signed,signature:'0'.repeat(64)},instance,fixedNonce,token),'real HMAC helper rejects tampered signature');
  check(!real.verifyFleetBusinessSupport({...signed,extra:1},instance,fixedNonce,token),'real HMAC helper rejects unexpected field');
  check(!real.verifyFleetBusinessSupport(null,instance,fixedNonce,token),'real HMAC helper rejects malformed proof');
  check(nonces.length===new Set(nonces).size&&nonces.every(n=>/^[a-f0-9-]{36}$/.test(n)),'every actual poll and ACK uses a fresh UUID nonce');

  // The actual local-status return paths must not pre-advertise support before
  // the authenticated central confirmation, even when local version is unknown.
  for(const mode of ['normal','unknown-version','invalid-slots']){
    const env=mode==='invalid-slots'?{FLEET_ACTIVE_SLOTS_FILE:path.resolve('fixture-invalid-active-slots.json')}:{FLEET_SINGLE_APP_ORIGIN:'http://127.0.0.1:3000'};
    const sandbox=vm.createContext({exports:{},Error,URL,Buffer,AbortSignal,process:{env,platform:process.platform},path,statusSchema:real.statusSchema,
      constants:{O_RDONLY:0,O_NOFOLLOW:0},open:async()=>{throw Error('fixture-invalid-slots');},
      fetch:async()=>{if(mode==='unknown-version')throw Error('fixture-local-offline');return Response.json({commit:'a'.repeat(40),version:123});},
    });
    vm.runInContext(localSource,sandbox,{timeout:2000});const value=await sandbox.actualLocalStatus('s3');
    check(!Object.hasOwn(value,'business'),'local status '+mode+': no unconfirmed business field');
    check(value.source===(mode==='normal'?'a'.repeat(40):'unknown'),'local status '+mode+': original actual/unknown source semantics retained');
    scenarios.push({name:'local-status-'+mode,result:value});
  }
  const failures=checks.filter(c=>!c.passed),result=failures.length?(expectBaseline?'REPRODUCED':'FAIL'):'PASS',exit=failures.length?1:0;
  const literal=`FLEET_BUSINESS_HEARTBEAT_NEGOTIATION=${result} assertions=${checks.length} failures=${failures.length} ACTUAL_SOURCE_FUNCTIONS=1 REAL_CONTRACT_HMAC=1 FINITE_TRANSPORT_APPLY=1 PG=0 HTTP=0 NETWORK=0`;
  const record={result,exitStatus:exit,layer:'actual connectorTick/localFleetStatus source functions + real contracts and HMAC; finite transport/apply/local I/O; no real PG or HTTP',sourceMode:sourceRoot?'actual-restored-copy':baseline?'git-baseline':'working-tree',sourceRef:baseline||null,sourceRoot:sourceRoot||null,sourceSHA256,sourceOrigins,sourceRoles,scriptSHA256:hash(await readFile(fileURLToPath(import.meta.url))),checks,scenarios,literalOutput:literal};
  await mkdir(OUT,{recursive:true});const output=path.join(OUT,sourceRoot?'ROLLBACK_RESULT.json':baseline?'BASELINE_RESULT.json':'MODIFIED_RESULT.json');await writeFile(output,JSON.stringify(record,null,2)+'\n');assert.equal(JSON.parse(await readFile(output,'utf8')).literalOutput,literal);console.log(literal);if(failures.length)console.log('FAILED='+failures.map(c=>c.name).join('; '));process.exitCode=exit;
}
await main();
