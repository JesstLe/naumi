import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {PeopleStore} from '../src/people-store';

const url=process.env.WORKFLOW_PEOPLE_FIRST_LINK_TEST_DATABASE_URL;
test('first source link preserves imported people and grants no access',{skip:!url},async()=>{
 assert.equal(new URL(url!).hostname,'127.0.0.1');
 assert.match(new URL(url!).pathname,/^\/people_first_g70_[a-f0-9]+$/);
 const pool=new pg.Pool({connectionString:url}),enterpriseId=randomUUID(),sourceHash='8'.repeat(64);
 const p={enterpriseId,subject:'local-owner'},source={instance:'fixture-source',enterpriseId:randomUUID(),subject:'first@fixture.invalid'};
 const store=new PeopleStore(pool,async(_tx,q)=>q.enterpriseId===p.enterpriseId&&q.subject===p.subject?{...q,permissions:['manage'],workKinds:[]}:null,p);
 let checks=0;const ok=(v:unknown)=>{assert(v);checks++;};
 try{
  for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>/^\d{3}-.*\.sql$/.test(f)).sort())await pool.query(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  const make=(name:string)=>({personId:randomUUID(),expectedVersion:0,realName:name,nickname:'alias-'+name,source:null,enabled:true});
  const a=make('synthetic-a'),b=make('synthetic-b');
  for(const v of [a,b])await store.profile(p,{...v,commandId:randomUUID(),reason:'fixture'});
  await pool.query('INSERT INTO enterprise_workflow.import_batches(enterprise_id,source_hash,document)VALUES($1,$2,$3)',[enterpriseId,sourceHash,{}]);
  await pool.query('INSERT INTO enterprise_workflow.import_rows(enterprise_id,source_hash,row_number,document)VALUES($1,$2,2,$3)',[enterpriseId,sourceHash,{title:'source-original',raw:{'设计师':'synthetic-a,synthetic-b'}}]);
  const mapping={sourceHash,reason:'fixture',entries:[{row:2,field:'设计师',sourceName:'synthetic-a,synthetic-b',expectedVersion:0,members:[{personId:a.personId,personVersion:1},{personId:b.personId,personVersion:1}]}]};
  const mp=await store.preview(p,mapping);await store.apply(p,{...mapping,commandId:randomUUID(),previewHash:mp.previewHash});
  const preserved=async()=>({links:(await pool.query('SELECT * FROM enterprise_workflow.import_person_links ORDER BY row_number,field')).rows,members:(await pool.query('SELECT * FROM enterprise_workflow.import_person_link_members ORDER BY position')).rows,rows:(await pool.query('SELECT * FROM enterprise_workflow.import_rows')).rows,accounts:(await pool.query('SELECT * FROM enterprise_workflow.accounts')).rows,teams:(await pool.query('SELECT * FROM enterprise_workflow.teams')).rows,identities:(await pool.query('SELECT * FROM enterprise_workflow.source_identities')).rows});
  const before=await preserved(),input={entries:[{...a,expectedVersion:1,source}],reason:'reviewed unique account first link'};
  const plan=await store.rosterPreview(p,input);
  if(process.env.PEOPLE_FIRST_LINK_EXPECT==='baseline'){
   ok(!plan.valid&&plan.errors[0].code==='UNBIND_BEFORE_ACCOUNT_CHANGE');
   assert.deepEqual(await preserved(),before);checks++;
   console.log(`PEOPLE_FIRST_LINK_BASELINE_PASS: checks=${checks} first_link=UNBIND_BEFORE_ACCOUNT_CHANGE original_links=1 source_writes=0`);return;
  }
  ok(plan.valid&&plan.updated===1&&plan.created===0&&plan.changes[0].accountState==='unverified');
  const cmd={...input,commandId:randomUUID(),previewHash:plan.previewHash,confirmed:true};
  const saved=await store.rosterApply(p,cmd);ok(saved.updated===1&&saved.people[0].personId===a.personId);
  ok((await store.rosterApply(p,cmd)).replayed);
  await assert.rejects(store.rosterApply(p,{...cmd,reason:'different'}),/IDEMPOTENCY_CONFLICT/);checks++;
  const listed=await store.list(p,sourceHash),bound=listed.profiles.find(v=>v.id===a.personId)!;
  ok(bound.source?.subject===source.subject&&bound.version===2&&bound.workflowSubject===null&&bound.accountState==='unverified');
  ok(listed.occurrences[0].personIds.join(',')===[a.personId,b.personId].join(','));
  for(const next of [null,{...source,subject:'other@fixture.invalid'},{...source,instance:'other-source'},{...source,enterpriseId:randomUUID()}]){
   const rejected=await store.rosterPreview(p,{entries:[{...a,expectedVersion:2,source:next}],reason:'reject rebind'});
   ok(!rejected.valid&&rejected.errors[0].code==='UNBIND_BEFORE_ACCOUNT_CHANGE');
  }
  const duplicate=await store.rosterPreview(p,{entries:[{...b,expectedVersion:1,source}],reason:'reject duplicate'});ok(!duplicate.valid&&duplicate.errors[0].code==='ACCOUNT_ALREADY_LINKED');
  await assert.rejects(store.profile(p,{...a,expectedVersion:1,source,commandId:randomUUID(),reason:'stale'}),/VERSION_CONFLICT/);checks++;
  await assert.rejects(store.rosterPreview({...p,subject:'worker'},input),/FORBIDDEN/);checks++;
  await assert.rejects(store.rosterPreview({...p,enterpriseId:randomUUID()},input),/FORBIDDEN/);checks++;
  const bInput={entries:[{...b,expectedVersion:1,source:{...source,subject:'second@fixture.invalid'}}],reason:'rollback first link'};
  const bp=await store.rosterPreview(p,bInput);ok(bp.valid);
  await pool.query("CREATE FUNCTION enterprise_workflow.fail_first_link_audit()RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'first-link audit failure'; END $$;CREATE TRIGGER fail_first_link_audit BEFORE INSERT ON enterprise_workflow.people_audit FOR EACH ROW EXECUTE FUNCTION enterprise_workflow.fail_first_link_audit()");
  try{await assert.rejects(store.rosterApply(p,{...bInput,commandId:randomUUID(),previewHash:bp.previewHash,confirmed:true}),/first-link audit failure/);checks++;}
  finally{await pool.query('DROP TRIGGER fail_first_link_audit ON enterprise_workflow.people_audit;DROP FUNCTION enterprise_workflow.fail_first_link_audit()');}
  const unbound=(await store.list(p,sourceHash)).profiles.find(v=>v.id===b.personId)!;ok(unbound.source===null&&unbound.version===1);
  const same=await store.rosterPreview(p,{entries:[{...a,expectedVersion:2,source}],reason:'same binding'});ok(same.valid&&same.unchanged===1);
  assert.deepEqual(await preserved(),before);checks++;
  const events=(await store.audit(p)).events.filter(e=>e.command_id===cmd.commandId);ok(events.length===1&&events[0].detail.changes[0].before.source===null);
  console.log(`PEOPLE_FIRST_LINK_PASS: checks=${checks} first_link=1 multi_links_preserved=1 nonempty_rebind_denied=1 duplicate_denied=1 stale_denied=1 replay=1 audit_rollback=1 permissions_unchanged=1 source_writes=0`);
 }finally{await pool.end();}
});
