/** Local operator tool: source directory attribution only, never provisions login or permissions. */
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import pg from 'pg';
import {z} from 'zod';
import {PeopleStore} from '../src/people-store';
import {id,sourceAccountSubject} from '../src/contracts';

const instance=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/);
const directorySchema=z.object({version:z.literal(1),origin:z.string().url(),enterpriseId:id,enterpriseName:z.string(),observedAt:z.string().datetime(),sourceWrites:z.literal(0),sourceReadOnly:z.literal(true),remoteSourceInstance:instance.nullable(),snapshotSha256:z.string().regex(/^[a-f0-9]{64}$/),rows:z.array(z.object({sourceSubject:sourceAccountSubject,alias:z.string(),accountAvailable:z.boolean(),membershipActive:z.boolean(),membershipStatus:z.string()})).max(2001)});
const read=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const fail=(ok:unknown,code:string):void=>{if(!ok)throw Error(code);};
const [mode,configFile,directoryFile,registryFile,planFile]=process.argv.slice(2);
fail(['preview','apply','rollback'].includes(mode)&&configFile&&directoryFile&&registryFile&&planFile,'USAGE: preview|apply|rollback config directory registry plan');
const config=await read(configFile),registry=z.strictObject({version:z.literal(1),instance,origin:z.string().url(),enterpriseId:id,enterpriseName:z.string()}).parse(await read(registryFile));
const rawDirectory=await read(directoryFile),directory=directorySchema.parse(rawDirectory);
const {snapshotSha256,...unsigned}=rawDirectory;
fail(createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')===snapshotSha256,'DIRECTORY_HASH_MISMATCH');
fail(directory.origin===registry.origin&&directory.enterpriseId===registry.enterpriseId&&directory.enterpriseName===registry.enterpriseName,'SOURCE_REGISTRY_MISMATCH');
fail(directory.remoteSourceInstance===null||directory.remoteSourceInstance===registry.instance,'SOURCE_INSTANCE_MISMATCH');
const originalUrl=new URL(config.databaseUrl);
fail(originalUrl.hostname==='127.0.0.1'&&!originalUrl.search&&!originalUrl.hash,'LOCAL_DATABASE_REQUIRED');
// Docker Desktop may allocate a different host port after restart. Resolve only this configured local container.
fail(/^naumi-enterprise-import-[a-f0-9]+$/.test(config.container),'LOCAL_CONTAINER_REQUIRED');
const mapped=execFileSync('docker',['port',config.container,'5432/tcp'],{encoding:'utf8'}).trim();
fail(/^127\.0\.0\.1:\d+$/.test(mapped),'LOOPBACK_PORT_REQUIRED');originalUrl.port=mapped.split(':')[1];
const enterpriseId=id.parse(config.enterpriseId),p={enterpriseId,subject:'local-owner'};
const pool=new pg.Pool({connectionString:originalUrl.href,max:2,connectionTimeoutMillis:5000});
const store=new PeopleStore(pool,async(_tx,q)=>q.enterpriseId===p.enterpriseId&&q.subject===p.subject?{...q,permissions:['manage'],workKinds:[]}:null,p);
const invariant=async()=>{
 const tables=['import_rows','import_assets','import_person_links','import_person_link_members','accounts','teams','team_members','source_identities','source_enterprises','orders'];
 const result:Record<string,{count:number;sha256:string}>={};
 for(const table of tables){const rows=(await pool.query(`SELECT to_jsonb(t) AS value FROM enterprise_workflow.${table} t WHERE enterprise_id=$1 ORDER BY to_jsonb(t)::text`,[enterpriseId])).rows;result[table]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}
 return result;
};
try{
 if(mode==='preview'){
  fail(Date.now()-Date.parse(directory.observedAt)<86400000&&Date.now()>=Date.parse(directory.observedAt)-60000,'DIRECTORY_REFRESH_REQUIRED');
  const profiles=(await pool.query('SELECT * FROM enterprise_workflow.person_profiles WHERE enterprise_id=$1 ORDER BY person_id',[enterpriseId])).rows;
  const entries=[],unmatched=[],alreadyLinked=[],accounts=new Set<string>();
  for(const person of profiles){
   const found=directory.rows.filter(r=>r.alias===person.nickname&&r.accountAvailable&&r.membershipActive),unique=new Map(found.map(r=>[r.sourceSubject,r]));
   if(unique.size!==1){unmatched.push({personId:person.person_id,realName:person.real_name,nickname:person.nickname,reason:unique.size?'AMBIGUOUS':'NOT_FOUND_OR_INACTIVE'});continue;}
   const source={instance:registry.instance,enterpriseId:registry.enterpriseId,subject:[...unique.keys()][0]};
   fail(!accounts.has(source.subject),'DUPLICATE_ACCOUNT_IN_PLAN');accounts.add(source.subject);
   if(person.source_instance!==null){fail(person.source_instance===source.instance&&person.source_enterprise===source.enterpriseId&&person.source_subject===source.subject,'EXISTING_BINDING_DIFFERS');alreadyLinked.push(person.person_id);continue;}
   entries.push({personId:person.person_id,expectedVersion:person.version,realName:person.real_name,nickname:person.nickname,source,enabled:person.enabled});
  }
  const before=await invariant();
  const input={entries,reason:`first-link ${registry.origin} snapshot=${directory.snapshotSha256}`};
  const preview=entries.length?await store.rosterPreview(p,input):null;
  fail(!preview||preview.valid,'FIRST_LINK_PREVIEW_INVALID');
  const plan={version:1,enterpriseId,registry,directoryHash:directory.snapshotSha256,commandId:randomUUID(),previewHash:preview?.previewHash??null,confirmed:true,input,before,unmatched,alreadyLinked,createdAt:new Date().toISOString()};
  await writeFile(planFile,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(`SOURCE_PEOPLE_PREVIEW_PASS: candidates=${entries.length} already_linked=${alreadyLinked.length} unmatched=${unmatched.length} writes=0`);
 }else{
  const plan=await read(planFile);
  fail(plan.version===1&&plan.enterpriseId===enterpriseId&&plan.directoryHash===directory.snapshotSha256&&JSON.stringify(plan.registry)===JSON.stringify(registry),'PLAN_CONTEXT_MISMATCH');
  const before=await invariant();fail(JSON.stringify(before)===JSON.stringify(plan.before),'RELATED_DATA_CHANGED');
  if(mode==='apply'){
   fail(Date.now()-Date.parse(directory.observedAt)<86400000,'DIRECTORY_REFRESH_REQUIRED');
   fail(plan.input.entries.every((e:any)=>e.source.instance===registry.instance&&e.source.enterpriseId===registry.enterpriseId&&directory.rows.some(r=>r.alias===e.nickname&&r.sourceSubject===e.source.subject&&r.accountAvailable&&r.membershipActive)),'DIRECTORY_MATCH_CHANGED');
   const result=plan.input.entries.length?await store.rosterApply(p,{...plan.input,commandId:plan.commandId,previewHash:plan.previewHash,confirmed:true}):{updated:0,replayed:false};
   const linked=(await pool.query('SELECT * FROM enterprise_workflow.person_profiles WHERE enterprise_id=$1 AND person_id=ANY($2::uuid[])',[enterpriseId,plan.input.entries.map((e:any)=>e.personId)])).rows;
   fail(plan.input.entries.every((e:any)=>linked.some(r=>r.person_id===e.personId&&r.source_instance===e.source.instance&&r.source_enterprise===e.source.enterpriseId&&r.source_subject===e.source.subject&&r.version===e.expectedVersion+1)),'APPLIED_PROFILE_STATE_CHANGED');
   fail(JSON.stringify(await invariant())===JSON.stringify(before),'ATTRIBUTION_CHANGED_RELATED_DATA');
   await writeFile(resolve(planFile+'.result.private.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
   console.log(`SOURCE_PEOPLE_APPLY_PASS: linked=${result.updated} replayed=${result.replayed?1:0} related_data_unchanged=1 source_writes=0 permission_writes=0`);
  }else{
   // Explicit operator inverse. Ordinary UI still rejects unbinding a referenced account.
   const tx=await pool.connect();
   try{
    await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='10s'");
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`people:${enterpriseId}`]);
    const audit=(await tx.query("SELECT detail FROM enterprise_workflow.people_audit WHERE enterprise_id=$1 AND command_id=$2 AND operation='profile-batch'",[enterpriseId,plan.commandId])).rows[0];
    fail(audit?.detail.changes.length===plan.input.entries.length,'APPLY_AUDIT_REQUIRED');
    const changes=[];
    for(const c of plan.input.entries){
     fail(audit.detail.changes.some((v:any)=>v.after.personId===c.personId&&v.before.source===null&&v.after.source?.instance===c.source.instance&&v.after.source?.enterpriseId===c.source.enterpriseId&&v.after.source?.subject===c.source.subject),'FIRST_LINK_AUDIT_REQUIRED');
     const current=(await tx.query('SELECT * FROM enterprise_workflow.person_profiles WHERE enterprise_id=$1 AND person_id=$2 FOR UPDATE',[enterpriseId,c.personId])).rows[0];
     fail(current&&current.version===c.expectedVersion+1&&current.source_instance===c.source.instance&&current.source_enterprise===c.source.enterpriseId&&current.source_subject===c.source.subject,'ROLLBACK_CURRENT_PROFILE_CHANGED');
     const result=await tx.query('UPDATE enterprise_workflow.person_profiles SET source_instance=NULL,source_enterprise=NULL,source_subject=NULL,version=version+1 WHERE enterprise_id=$1 AND person_id=$2 AND version=$3 RETURNING version',[enterpriseId,c.personId,current.version]);
     fail(result.rowCount===1,'ROLLBACK_VERSION_CONFLICT');changes.push({personId:c.personId,before:current,afterSource:null,version:result.rows[0].version});
    }
    await tx.query('INSERT INTO enterprise_workflow.people_audit(enterprise_id,command_id,subject,operation,detail)VALUES($1,$2,$3,$4,$5)',[enterpriseId,randomUUID(),p.subject,'first-source-link-rollback',{originalCommandId:plan.commandId,changes}]);
    await tx.query('COMMIT');
    console.log(`SOURCE_PEOPLE_ROLLBACK_PASS: restored=${changes.length} versions_monotonic=1 related_data_unchanged=1 source_writes=0 permission_writes=0`);
   }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
   fail(JSON.stringify(await invariant())===JSON.stringify(before),'ROLLBACK_CHANGED_RELATED_DATA');
  }
 }
}finally{await pool.end();}
