import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {PeopleStore} from '../src/people-store';
import {resolveDatabaseActor} from '../src/identity';
import {SourceIdentityStore} from '../src/source-identity';
export async function peopleChecks(pool:Pool,enterpriseId:string,sourceHash:string){
 const teamId=randomUUID(),p={enterpriseId,teamId,subject:'people-admin'},personId=randomUUID(),secondId=randomUUID();
 await pool.query('INSERT INTO enterprise_workflow.teams(enterprise_id,team_id) VALUES($1,$2)',[enterpriseId,teamId]);
 for(const s of ['people-admin','team-lead','worker']){await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject) VALUES($1,$2)',[enterpriseId,s]);await pool.query('INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds) VALUES($1,$2,$3,$4,$5)',[enterpriseId,teamId,s,s==='worker'?'["execute"]':'["manage"]',s==='worker'?'["design"]':'[]']);}
 await pool.query('INSERT INTO enterprise_workflow.person_directory_admins(enterprise_id,subject) VALUES($1,$2)',[enterpriseId,p.subject]);
 const store=new PeopleStore(pool,resolveDatabaseActor),profiles={commandId:randomUUID(),personId,expectedVersion:0,realName:'张同名',nickname:'花名甲',source:null,enabled:true,reason:'fixture'};
 const sourceBefore=(await pool.query('SELECT json_agg(document ORDER BY row_number) rows FROM enterprise_workflow.import_rows WHERE enterprise_id=$1',[enterpriseId])).rows[0].rows;
 assert.equal((await store.list(p,sourceHash)).occurrences.length,6);await assert.rejects(store.list({...p,subject:'worker'},sourceHash),/FORBIDDEN/);await assert.rejects(store.list({...p,subject:'team-lead'},sourceHash),/DIRECTORY_ADMIN_REQUIRED/);await assert.rejects(store.list({...p,enterpriseId:randomUUID()},sourceHash),/FORBIDDEN/);
 await store.profile(p,profiles);assert.equal((await store.profile(p,profiles)).replayed,true);await assert.rejects(store.profile(p,{...profiles,nickname:'different'}),/IDEMPOTENCY_CONFLICT/);
 await store.profile(p,{...profiles,commandId:randomUUID(),personId:secondId,nickname:'花名乙'});assert.equal((await store.list(p,sourceHash)).profiles.length,2);
 const c={sourceHash,entries:[{row:2,field:'设计师',sourceName:'张同名',expectedVersion:0,personId,personVersion:1},{row:3,field:'设计师',sourceName:'张同名',expectedVersion:0,personId:secondId,personVersion:1}],reason:'same source names explicitly different people'};
 const preview=await store.preview(p,c);assert.equal(Number((await pool.query('SELECT count(*) n FROM enterprise_workflow.import_person_links')).rows[0].n),0);
 const apply={...c,commandId:randomUUID(),previewHash:preview.previewHash};assert.equal((await store.apply(p,apply)).count,2);assert.equal((await store.apply(p,apply)).replayed,true);
 let list=await store.list(p,sourceHash);assert.notEqual(list.occurrences.find(o=>o.row===2&&o.field==='设计师')?.personId,list.occurrences.find(o=>o.row===3&&o.field==='设计师')?.personId);
 const alias={...profiles,commandId:randomUUID(),expectedVersion:1,nickname:'新花名'};await store.profile(p,alias);assert.equal((await store.list(p,sourceHash)).profiles.find(x=>x.id===personId)?.nickname,'新花名');
 await assert.rejects(store.preview(p,c),/VERSION_CONFLICT/);
 const clear={sourceHash,entries:c.entries.map(e=>({...e,expectedVersion:1,personId:null,personVersion:null})),reason:'unbind'};const cp=await store.preview(p,clear);
 // Atomic conflict: change one selected row before applying the two-row preview.
 const one={...clear,entries:[clear.entries[0]]};const op=await store.preview(p,one);await store.apply(p,{...one,commandId:randomUUID(),previewHash:op.previewHash});await assert.rejects(store.apply(p,{...clear,commandId:randomUUID(),previewHash:cp.previewHash}),/VERSION_CONFLICT/);assert.equal((await store.list(p,sourceHash)).occurrences.find(o=>o.row===3&&o.field==='设计师')?.version,1);
 await store.profile(p,{...profiles,commandId:randomUUID(),expectedVersion:2,enabled:false});const disabled={...c,entries:[{...c.entries[0],expectedVersion:2,personVersion:3}]};await assert.rejects(store.preview(p,disabled),/PERSON_DISABLED_OR_NOT_FOUND/);
 const source={instance:'naumi-fixture',enterpriseId:randomUUID(),subject:'flower@fixture.invalid'};await store.profile(p,{...profiles,commandId:randomUUID(),expectedVersion:3,source});assert.equal((await store.list(p,sourceHash)).profiles.find(x=>x.id===personId)?.accountState,'unverified');
 await assert.rejects(store.profile(p,{...profiles,commandId:randomUUID(),personId:secondId,expectedVersion:1,source}),/ACCOUNT_ALREADY_LINKED/);
 const bindings=new SourceIdentityStore(pool),common={sourceInstance:source.instance,sourceEnterprise:source.enterpriseId,enabled:true,expectedVersion:0,reason:'identity fixture'};await bindings.configure(p,{...common,type:'enterprise'});await bindings.configure(p,{...common,type:'identity',sourceSubject:source.subject,subject:'worker'});
 assert.equal((await store.list(p,sourceHash)).profiles.find(x=>x.id===personId)?.accountState,'verified');
 const current={sourceHash,entries:[{...c.entries[0],expectedVersion:2,personVersion:4}],reason:'verified target'},v=await store.preview(p,current);await bindings.configure(p,{...common,type:'identity',sourceSubject:source.subject,subject:'worker',expectedVersion:1,enabled:false});await assert.rejects(store.apply(p,{...current,commandId:randomUUID(),previewHash:v.previewHash}),/PREVIEW_CHANGED/);
 assert.equal((await store.list(p,sourceHash)).profiles.find(x=>x.id===personId)?.accountState,'revoked');
 // A mapping may be documented while account is pending/revoked, but never grants permissions.
 const fresh=await store.preview(p,current);await pool.query("CREATE FUNCTION enterprise_workflow.fail_people_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'people audit injected'; END $$; CREATE TRIGGER fail_people_audit BEFORE INSERT ON enterprise_workflow.people_audit FOR EACH ROW EXECUTE FUNCTION enterprise_workflow.fail_people_audit()");
 await assert.rejects(store.apply(p,{...current,commandId:randomUUID(),previewHash:fresh.previewHash}),/people audit injected/);await pool.query('DROP TRIGGER fail_people_audit ON enterprise_workflow.people_audit; DROP FUNCTION enterprise_workflow.fail_people_audit()');assert.equal((await store.list(p,sourceHash)).occurrences.find(o=>o.row===2&&o.field==='设计师')?.personId,null);
 const events=await store.audit(p);assert(events.events.length>0);assert.deepEqual((await pool.query('SELECT json_agg(document ORDER BY row_number) rows FROM enterprise_workflow.import_rows WHERE enterprise_id=$1',[enterpriseId])).rows[0].rows,sourceBefore);
 await pool.query('UPDATE enterprise_workflow.person_directory_admins SET enabled=false WHERE enterprise_id=$1 AND subject=$2',[enterpriseId,p.subject]);await assert.rejects(store.apply(p,apply),/DIRECTORY_ADMIN_REQUIRED/);
 console.log('PEOPLE_MAPPING_PASS: same_name_separate=1 alias_stable_id=1 preview_no_writes=1 atomic_conflict=1 audit_rollback=1 idempotent=1 unverified_not_login=1 live_account_revocation=1 directory_admin=1 tenant_isolation=1 source_unchanged=1');
}
