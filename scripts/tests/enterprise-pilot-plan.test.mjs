import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {preparePilot} from '../../services/enterprise-workflow/src/source-onboarding/pilot-plan.mjs';
const site={version:1,adminUrl:'https://pilot.example/admin',enterpriseId:randomUUID(),expectedEnterpriseName:'合成企业'},teamId=randomUUID(),observedAt=new Date().toISOString(),snapshotSha256='a'.repeat(64),sourceSubject='设计甲@username.naumi.local';
const summary={version:1,adminUrl:site.adminUrl,enterpriseId:site.enterpriseId,enterpriseName:site.expectedEnterpriseName,sourceReadOnly:true,sourceWrites:0,enterpriseEnabled:true,ownerGrantActive:true,snapshotSha256,observedAt,accountCount:2,sourceInstanceId:null,bridge:{}},roster={version:1,site,sourceInstanceId:null,snapshotSha256,observedAt,rows:[{sourceSubject,alias:'设计甲',accountAvailable:true},{sourceSubject:'same-alias@test.invalid',alias:'设计甲',accountAvailable:true}]};
const request={version:1,commandId:randomUUID(),reason:'用户逐项确认',target:{enterpriseId:randomUUID(),sourceEnterprise:site.enterpriseId,sourceInstance:'pilot-proposed-source'},teams:[{teamId,name:'设计'}],people:[{sourceSubject,alias:'设计甲',realName:'合成真名',workflowSubject:'pilot-designer',personId:randomUUID(),expectedVersion:0,teamId,permissions:['dispatch','execute','review'],workKinds:['design'],confirmed:true}]};
test('exact Unicode source account and explicit permissions, never alias merge or source-role copying',()=>{
 const r=preparePilot(site,request,summary,roster),a=r.provision.enterprises[0].accounts[0];assert.equal(a.sourceSubject,sourceSubject);assert.deepEqual(a.memberships[0].permissions,['dispatch','execute','review']);assert.equal(a.directoryAdmin,false);assert.equal(a.catalogAdmin,false);assert.equal(a.profile.realName,'合成真名');assert.equal(r.summary.employeeReady,false);assert(r.summary.notices.includes('SOURCE_INSTANCE_PROPOSED_NOT_CONFIGURED'));assert(!JSON.stringify(r.summary).includes(sourceSubject));
 const copy=structuredClone(request);copy.people[0].sourceSubject='unknown@test.invalid';assert.throws(()=>preparePilot(site,copy,summary,roster),/PILOT_EXACT_ACCOUNT_REQUIRED/);
});
test('reject stale mismatched revoked ambiguous and unconfirmed input',()=>{
 assert.throws(()=>preparePilot(site,request,summary,roster,new Date(Date.now()+16*60000)),/EXPIRED/);
 for(const mutation of [r=>r.people[0].confirmed=false,r=>r.people[0].admin=true,r=>r.target.password='secret',r=>r.people[0].sourceSubject='bad @test.invalid']){const r=structuredClone(request);mutation(r);assert.throws(()=>preparePilot(site,r,summary,roster),/PILOT_REQUEST_INVALID/);}
 assert.throws(()=>preparePilot(site,request,{...summary,enterpriseId:randomUUID()},roster),/SCOPE/);assert.throws(()=>preparePilot(site,request,{...summary,ownerGrantActive:false},roster),/UNAVAILABLE/);assert.throws(()=>preparePilot(site,request,summary,{...roster,snapshotSha256:'b'.repeat(64)}),/SNAPSHOT/);
 const copy=structuredClone(roster);copy.rows[0].accountAvailable=false;assert.throws(()=>preparePilot(site,request,summary,copy),/UNAVAILABLE/);copy.rows[0].accountAvailable=true;copy.rows[0].alias='changed';assert.throws(()=>preparePilot(site,request,summary,copy),/ALIAS_CHANGED/);copy.rows[0].alias='设计甲';copy.rows[1].sourceSubject=sourceSubject;assert.throws(()=>preparePilot(site,request,summary,copy),/EXACT_ACCOUNT/);
 const r=structuredClone(request);r.people.push({...r.people[0],personId:randomUUID()});assert.throws(()=>preparePilot(site,r,summary,roster),/DUPLICATE_IDENTITY/);r.people.pop();r.people[0].workKinds=[];assert.throws(()=>preparePilot(site,r,summary,roster),/EXECUTOR_KIND/);
});
test('actual CLI private artifacts and repeat output denied without secrets',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pilot-cli-')),args=[];for(const [key,value]of [['site',site],['request',request],['summary',summary],['roster',roster]]){const file=join(dir,key+'.json');await writeFile(file,JSON.stringify(value),{mode:0o600});args.push('--'+key,file);}const out=join(dir,'prepared');args.push('--output',out);
 const run=()=>spawnSync(process.execPath,['scripts/enterprise-pilot-plan.mjs',...args],{encoding:'utf8',timeout:30000,windowsHide:true});const r=run();assert.equal(r.status,0,r.stderr);assert(r.stdout.includes('PILOT_PLAN_READY: accounts=1 profiles=1'));assert(!r.stdout.includes(sourceSubject));assert(!r.stdout.includes('合成真名'));const p=JSON.parse(await readFile(join(out,'PROFILE_PROVISION.private.json'),'utf8'));assert.equal(p.enterprises[0].accounts[0].sourceSubject,sourceSubject);assert.equal(run().status,1);assert.deepEqual(JSON.parse(await readFile(join(out,'PROFILE_PROVISION.private.json'),'utf8')),p);
});
