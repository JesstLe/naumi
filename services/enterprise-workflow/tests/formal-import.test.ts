import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import type {Pool} from 'pg';
import {ImportStore} from '../src/import-store';
import {FormalImportStore} from '../src/formal-import-store';
import {resolveDatabaseActor} from '../src/identity';
import {createWorkflowServer,WorkflowStore} from '../src/server';
export async function formalImportChecks(pool:Pool){
 const enterpriseId=randomUUID(),teamId=randomUUID(),p={enterpriseId,teamId,subject:'formal-import-admin'},root=await mkdtemp(join(tmpdir(),'naumi-formal-import-'));
 const data=Buffer.from('original synthetic source bytes'),h=createHash('sha256').update(data).digest('hex'),source='1'.repeat(64);await writeFile(join(root,h),data);
 await pool.query('INSERT INTO enterprise_workflow.teams(enterprise_id,team_id) VALUES($1,$2)',[enterpriseId,teamId]);
 for(const [subject,permissions]of [[p.subject,['manage','request']],['team-manager',['manage']],['worker',['execute']]] as const){await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject) VALUES($1,$2)',[enterpriseId,subject]);await pool.query('INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds) VALUES($1,$2,$3,$4,$5)',[enterpriseId,teamId,subject,JSON.stringify(permissions),'[]']);}
 await pool.query('INSERT INTO enterprise_workflow.person_directory_admins(enterprise_id,subject) VALUES($1,$2)',[enterpriseId,p.subject]);
 const row=(n:number)=>({excelRow:n,title:n===2?'源父行':'源子行',parentLabel:n===2?'':'源父行',parentCandidates:n===2?[]:[2],raw:{'任务完成情况':'已完成','设计师':'合成真名'},rawCells:{},attachments:[],issues:[]});
 const raw={schema:'enterprise-source-import-v1',sourceHash:source,workbookHash:'2'.repeat(64),sheet:'正式来源合成表一',headers:{},rows:[row(2),row(3)],issues:[],summary:{rows:2,children:1},assets:[{id:h,sha256:h,bytes:data.length,name:'source.txt',extension:'.txt',path:'private/original-path.txt'}],links:[]};
 const local=new ImportStore(pool,enterpriseId,root);await local.ingest(raw,'test');await local.ingest({...raw,sourceHash:'3'.repeat(64),sheet:'正式来源合成表二'},'test');
 const imports=new FormalImportStore(pool,resolveDatabaseActor,{[enterpriseId]:root});
 assert.equal((await imports.context(p)).batches.length,2);assert.equal((await imports.rows(p,source)).rows[1].raw['任务完成情况'],'已完成');assert(!('path' in (await imports.rows(p,source)).assets[0]));
 for(const who of [{...p,subject:'worker'},{...p,subject:'team-manager'},{...p,teamId:randomUUID()},{...p,enterpriseId:randomUUID()}]){await assert.rejects(imports.context(who));await assert.rejects(imports.rows(who,source));await assert.rejects(imports.asset(who,source,h,true));await assert.rejects(imports.confirm(who,source,{row:3,parentRow:2,expectedVersion:1,reason:'denied'}));}
 await assert.rejects(new FormalImportStore(pool,resolveDatabaseActor).asset(p,source,h,true),/SOURCE_STORAGE_NOT_CONFIGURED/);
 const command={row:3,parentRow:2,expectedVersion:1,reason:'explicit parent confirmation'},out=await imports.confirm(p,source,command);assert.equal(out.version,2);await assert.rejects(imports.confirm(p,source,command),/VERSION_CONFLICT/);await assert.rejects(imports.confirm(p,source,{...command,expectedVersion:2,parentRow:999}),/PARENT_NOT_CANDIDATE/);
 await pool.query("CREATE FUNCTION enterprise_workflow.fail_formal_import_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'formal audit failure'; END $$; CREATE TRIGGER fail_formal_import_audit BEFORE INSERT ON enterprise_workflow.import_audit FOR EACH ROW EXECUTE FUNCTION enterprise_workflow.fail_formal_import_audit()");
 try{await assert.rejects(imports.confirm(p,source,{...command,expectedVersion:2,parentRow:null}),/formal audit failure/);}finally{await pool.query('DROP TRIGGER fail_formal_import_audit ON enterprise_workflow.import_audit; DROP FUNCTION enterprise_workflow.fail_formal_import_audit()');}
 assert.equal((await imports.rows(p,source)).rows[1].version,2);
 const orders=new WorkflowStore(pool,resolveDatabaseActor,async()=>false),promotion={command:{commandId:randomUUID(),orderId:randomUUID(),expectedVersion:0,action:{type:'create' as const,title:'人工确认草稿',brief:'新需求',acceptance:'新验收'}},source:{sourceHash:source,row:3,expectedVersion:2,intent:'standalone',confirmed:true}};
 const made=await orders.promote(p,promotion);assert.equal(made.order.status,'draft');assert.equal(made.order.tasks.length,0);assert.equal(made.order.requester,p.subject);assert.equal((await orders.promote(p,promotion)).replayed,true);await assert.rejects(orders.promote(p,{...promotion,command:{...promotion.command,commandId:randomUUID(),orderId:randomUUID()}}),/SOURCE_ALREADY_PROMOTED/);
 const server=createWorkflowServer(orders,async req=>req.headers.authorization==='Bearer formal-test'?p:null,undefined,undefined,undefined,undefined,undefined,undefined,undefined,imports);server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert(address&&typeof address!=='string');const origin='http://127.0.0.1:'+address.port,headers={authorization:'Bearer formal-test'};
 try{assert.equal((await fetch(origin+'/v1/imports/context')).status,401);assert.equal((await fetch(origin+'/v1/imports/context',{headers})).status,200);const r=await fetch(origin+'/v1/imports/asset?source='+source+'&id='+h,{headers});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('x-content-sha256'),h);assert.deepEqual(Buffer.from(await r.arrayBuffer()),data);
  await writeFile(join(root,h),Buffer.alloc(data.length));await assert.rejects(imports.asset(p,source,h,true),/SOURCE_FILE_HASH_MISMATCH/);await writeFile(join(root,h),data);
  await local.active(source,false,'fixture');await assert.rejects(imports.rows(p,source),/SOURCE_NOT_FOUND/);await assert.rejects(imports.confirm(p,source,{...command,expectedVersion:2}),/SOURCE_NOT_FOUND/);await assert.rejects(imports.asset(p,source,h,true),/SOURCE_NOT_FOUND/);await local.active(source,true,'fixture');
  await pool.query('UPDATE enterprise_workflow.person_directory_admins SET enabled=false WHERE enterprise_id=$1',[enterpriseId]);assert.equal((await fetch(origin+'/v1/imports/rows?source='+source,{headers})).status,403);await assert.rejects(imports.asset(p,source,h,true),/DIRECTORY_ADMIN_REQUIRED/);await pool.query('UPDATE enterprise_workflow.person_directory_admins SET enabled=true WHERE enterprise_id=$1',[enterpriseId]);
  await pool.query('UPDATE enterprise_workflow.accounts SET enabled=false WHERE enterprise_id=$1 AND subject=$2',[enterpriseId,p.subject]);await assert.rejects(imports.context(p),/FORBIDDEN/);
  assert.deepEqual((await pool.query('SELECT document FROM enterprise_workflow.import_rows WHERE enterprise_id=$1 AND source_hash=$2 ORDER BY row_number',[enterpriseId,source])).rows.map(r=>r.document),raw.rows);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 console.log('FORMAL_SOURCE_PASS: batches=2 employee_denied=1 directory_admin_required=1 tenant_team_isolation=1 cas=1 audit_rollback=1 original_bytes=1 corrupt_file_denied=1 missing_storage=503 inactive_denied=1 live_revocation=1 source_unchanged=1 unique_draft=1');
}
