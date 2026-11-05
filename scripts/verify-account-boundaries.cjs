// Actual moved functions with explicit SQL/runtime ports. Real PG and import
// identity are checked separately by verify-account-persistence-pg.ts.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),ts=require('typescript');
const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(arg('--source-root')||'.'),baseline=process.argv.includes('--baseline');
const out=path.resolve(process.env.ACCOUNT_EVIDENCE||'output/refactor-r4a3-20261024');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const legacy=ts.createSourceFile('db.ts',read('src/lib/db.ts'),99,true);
const legacyNodes=new Map(legacy.statements.map(n=>[n.name?.text||(ts.isVariableStatement(n)?n.declarationList.declarations[0]?.name?.text:undefined),n]));
const groups={
 history:['invoicesFor','totalPaidCents'],
 wallet:['expireDueBatches','refreshBalance','getCreditOverview'],
 account:['setUserPassword','getUserPasswordHash','userExists','setUserRole','getUserRole','getOwnerEmail','getLocalOperatorEmail','setUserBanned','setUserNote','bannedEmailsAmong','recordLoginIp','BannedIpRow','banIp','unbanIp','listBannedIps','isBanned'],
 provider:['UserImageProviderRecord','providerRowToRecord','PROVIDER_COLUMNS','listUserImageProviderRecords','getUserImageProviderRecord','getUserImageProviderRecordById','countUserImageProviderRecords','upsertUserImageProviderRecord','activateUserImageProviderRecord','deleteUserImageProviderRecord'],
 session:['oneMonthFromNowISO','UserRow','toSessionUser','getOrCreateUser','getUser','changeUserPlan'],
};
const files={history:'src/lib/payments/history.ts',wallet:'src/lib/billing/wallet-balance.ts',account:'src/lib/accounts/repository.ts',provider:'src/lib/user-image-provider/repository.ts',session:'src/lib/accounts/session.ts'};
const json=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));let checks=0,cases=0;
const eq=(a,b)=>{assert.deepEqual(json(a),json(b));checks++;},ok=v=>{assert.ok(v);checks++;};
function fixture(respond=()=>({rows:[],rowCount:0}),env={}){
 const events=[],calls=[],ports={process:{env},console,Date,OPERATOR_EMAIL:'operator@fixture.local'};
 const query=async(sql,params=[])=>{calls.push({sql,params:json(params)});events.push('sql');return respond(sql,params);};
 const tx={query,release:()=>events.push('release')};
 Object.assign(ports,{ensureSchema:async()=>events.push('schema'),getPool:()=>({query,connect:async()=>{events.push('connect');return tx;}}),withTransaction:async(_pool,run)=>{events.push('begin');const result=await run(tx);events.push('commit');return result;}});
 ports.withBillingTransaction=ports.withTransaction;const api={};
 for(const [key,names] of Object.entries(groups)){
  const source=baseline?names.map(name=>{const node=legacyNodes.get(name);assert(node,name);return node.getText(legacy).replace(/^(async )?function /,'export $1function ');}).join('\n'):read(files[key]);
  const m={exports:{}},ctx=vm.createContext({...ports,...api,module:m,exports:m.exports,require:id=>id==='server-only'?{}:{...ports,...api}});
  vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:9,module:1,esModuleInterop:true}}).outputText,ctx,{filename:files[key]});Object.assign(api,m.exports);
 }
 return {api,events,calls};
}
async function main(){
 // Raw normalization is preserved: these APIs lowercase but do not silently trim.
 for(const [name,args,value,expected] of [
  ['setUserPassword',['Mixed@Example.test','hash'],undefined,['mixed@example.test','hash']],
  ['getUserPasswordHash',['MIXED@Example.test'],'saved',['mixed@example.test']],
  ['userExists',['MIXED@Example.test'],true,['mixed@example.test']],
  ['setUserRole',['MIXED@Example.test','superuser'],undefined,['mixed@example.test','user']],
  ['setUserRole',['MIXED@Example.test','admin'],undefined,['mixed@example.test','admin']],
  ['getUserRole',['MIXED@Example.test'],'user',['mixed@example.test']],
  ['setUserBanned',['MIXED@Example.test',false],undefined,['mixed@example.test',false]],
  ['setUserNote',['MIXED@Example.test','x'.repeat(1003)],undefined,['mixed@example.test','x'.repeat(1000)]],
 ]){const f=fixture(()=>({rows:[{password_hash:'saved',role:'user'}]}));eq(await f.api[name](...args),value);eq(f.calls[0].params,expected);eq(f.events,['schema','sql']);cases++;}
 {const f=fixture();eq(await f.api.getUserPasswordHash('missing'),null);eq(await f.api.getUserRole('missing'),null);eq(await f.api.getUser('missing'),null);eq(await f.api.userExists('missing'),false);cases++;}
 {const f=fixture(()=>({rows:[{email:'mixed@example.test'}]}));eq(await f.api.bannedEmailsAmong([]),[]);eq(f.calls.length,0);eq(await f.api.bannedEmailsAmong(['Mixed@Example.test','mixed@example.test']),['mixed@example.test']);eq(f.calls[0].params,[['mixed@example.test']]);cases++;}
 for(const [accountBlocked,ipBlocked,expected,count] of [[true,false,true,1],[false,true,true,2],[false,false,false,2]]){const f=fixture(sql=>({rows:[],rowCount:sql.includes('app_users')?Number(accountBlocked):Number(ipBlocked)}));eq(await f.api.isBanned(' USER@Example.test ',' 192.0.2.1 '),expected);eq(f.calls.length,count);eq(f.calls[0].params,['user@example.test']);if(count===2)eq(f.calls[1].params,['192.0.2.1']);cases++;}
 {const f=fixture();eq(await f.api.isBanned('',null),false);eq(f.calls.length,0);await f.api.banIp(' 192.0.2.2 ','reason');eq(f.calls[0].params,['192.0.2.2','reason']);await f.api.unbanIp(' 192.0.2.2 ');eq(f.calls[1].params,['192.0.2.2']);cases++;}
 {const f=fixture(()=>({rows:[{ip:'192.0.2.2',reason:null,created_at:'2020-01-01T00:00:00Z'}]}));eq(await f.api.listBannedIps(),[{ip:'192.0.2.2',reason:'',createdAt:'2020-01-01T00:00:00.000Z'}]);cases++;}
 {const fault=new Error('SQL unavailable'),f=fixture(()=>{throw fault;});await f.api.recordLoginIp('USER@Example.test',null);eq(f.calls.length,0);await f.api.recordLoginIp('USER@Example.test','192.0.2.3');eq(f.calls[0].params,['user@example.test','192.0.2.3']);await assert.rejects(f.api.getUserRole('user'),e=>e===fault);checks++;cases++;}
 for(const row of [[],[{s:'0'}],[{s:'4294967296'}]]){const f=fixture(()=>({rows:row}));eq(await f.api.totalPaidCents(' MIXED@Example.test '),Number(row[0]?.s||0));eq(f.calls[0].params,[' mixed@example.test ']);eq(f.events,['sql']);ok(f.calls[0].sql.includes("status = 'paid'"));cases++;}
 {const f=fixture(()=>({rows:[{id:'invoice',created_at:'2020-01-01T00:00:00Z',plan:'starter',amount:10,status:'paid'}]}));eq(await f.api.invoicesFor('lower@example.test'),[{id:'invoice',date:'2020-01-01T00:00:00.000Z',plan:'starter',amount:10,status:'paid'}]);eq(f.events,['sql']);cases++;}
 {const f=fixture(sql=>({rows:sql.includes('RETURNING credits_total')?[{credits_total:'19'}]:[]}));eq(await f.api.refreshBalance('USER@Example.test'),19);eq(f.events,['sql','begin','sql','sql','commit']);ok(f.calls[1].sql.includes('FOR UPDATE'));ok(f.calls[2].sql.includes('SELECT COALESCE(SUM(remaining),0)'));ok(f.calls.every(c=>c.params[0]==='user@example.test'));cases++;}
 {const f=fixture(sql=>({rows:sql.includes('RETURNING credits_total')?[{credits_total:9}]:sql.includes('SELECT remaining, expires_at')?[{remaining:3,expires_at:'2030-01-01T00:00:00Z'}]:[]}));eq(await f.api.getCreditOverview('USER@Example.test'),{balance:9,nextExpiry:{amount:3,at:'2030-01-01T00:00:00.000Z'}});eq(f.events[0],'schema');cases++;}
 const user={email:'user@example.test',name:'Name',plan:'starter',credits_used:3,joined_at:new Date('2020-01-01'),renews_at:new Date('2020-02-01')};
 for(const loginOnly of [false,true]){const f=fixture(sql=>({rows:sql.startsWith('SELECT * FROM app_users')?[user]:sql.includes('RETURNING credits_total')?[{credits_total:9}]:sql.includes('AS total FROM app_credit_batches')?[{total:9}]:[]}),loginOnly?{NAUMI_AUTH_LOGIN_ONLY:'1'}:{});const u=await f.api.getUser('USER@Example.test');eq(u,{name:'Name',email:'user@example.test',plan:'starter',creditsTotal:9,creditsUsed:3,joinedAt:'2020-01-01T00:00:00.000Z',renewsAt:'2020-02-01T00:00:00.000Z',invoices:[]});eq(f.calls.filter(c=>/^UPDATE|^WITH/.test(c.sql)).length,loginOnly?0:2);cases++;}
 {const f=fixture();await assert.rejects(f.api.changeUserPlan('missing','starter'),/用户不存在/);checks++;cases++;}
 {const f=fixture(()=>({rows:[{id:'provider',email:'user@example.test',name:'',is_active:0,enabled:false,protocol:'old-invalid',base_url_enc:'legacy-ciphertext',api_key_enc:' raw-key ',models:[1,'model'],default_model:null,updated_at:'2020-01-01'}]}));const rows=await f.api.listUserImageProviderRecords('USER@Example.test');eq(rows,[{id:'provider',email:'user@example.test',name:'未命名供应商',isActive:false,enabled:false,protocol:'openai-images',baseUrlEnc:'legacy-ciphertext',apiKeyEnc:' raw-key ',models:['1','model'],defaultModel:'',updatedAt:'2020-01-01T00:00:00.000Z'}]);eq(f.calls[0].params,['user@example.test']);cases++;}
 {const f=fixture();eq(await f.api.getUserImageProviderRecord('missing'),null);eq(await f.api.getUserImageProviderRecordById('OTHER','id'),null);eq(await f.api.countUserImageProviderRecords('missing'),0);eq(await f.api.deleteUserImageProviderRecord('OTHER','id'),false);eq(f.calls[1].params,['other','id']);eq(f.calls[3].params,['other','id']);cases++;}
 {const f=fixture();eq(await f.api.activateUserImageProviderRecord('OTHER','missing'),false);eq(f.calls.map(c=>c.sql.trim().split(/\s+/)[0]),['BEGIN','UPDATE','ROLLBACK']);eq(f.events.at(-1),'release');cases++;}
 const literal=`ACCOUNT_BOUNDARIES=PASS mode=${baseline?'BASELINE':'MODIFIED'} cases=${cases} checks=${checks} FUNCTIONS=ACTUAL SQL_PORTS=FIXTURE RAW_VALUES=EXACT LOCK_ORDER=PRESERVED LOGIN_SIDECAR=READONLY EXTERNAL=0`;
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,`BOUNDARY_${baseline?'BASELINE':'MODIFIED'}.json`),JSON.stringify({root,baseline,cases,checks,literal},null,2));console.log(literal);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
