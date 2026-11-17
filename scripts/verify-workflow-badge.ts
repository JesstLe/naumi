import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {NotificationStore} from '../services/enterprise-workflow/src/notification-store';
import {resolveDatabaseActor} from '../services/enterprise-workflow/src/identity';

async function main(){
 const url=new URL(process.env.DATABASE_URL!);
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
 const pool=new Pool({connectionString:url.toString()});
 try{
  for(const name of ['001-workflow','002-scheduling','011-notifications'])
   await pool.query(await readFile(new URL(`../services/enterprise-workflow/migrations/${name}.sql`,import.meta.url),'utf8'));
  const enterpriseId=randomUUID(),teamId=randomUUID(),other=randomUUID(),order=randomUUID(),hidden=randomUUID();
  await pool.query("INSERT INTO enterprise_workflow.teams(enterprise_id,team_id) VALUES($1,$2),($1,$3)",[enterpriseId,teamId,other]);
  for(const subject of ['viewer','peer']){
   await pool.query("INSERT INTO enterprise_workflow.accounts(enterprise_id,subject) VALUES($1,$2)",[enterpriseId,subject]);
   await pool.query("INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds) VALUES($1,$2,$3,'[\"request\"]','[]')",[enterpriseId,teamId,subject]);
  }
  for(const [id,requester] of [[order,'viewer'],[hidden,'peer']]){
   await pool.query('INSERT INTO enterprise_workflow.orders(enterprise_id,id,version,document) VALUES($1,$2,1,$3)',[enterpriseId,id,JSON.stringify({enterpriseId,id,version:1,teamId,requester,tasks:[]})]);
  }
  for(const [id,subject,read] of [[order,'viewer',false],[order,'viewer',true],[hidden,'viewer',false],[order,'peer',false]] as const)
   await pool.query(`INSERT INTO enterprise_workflow.notifications(id,enterprise_id,team_id,subject,event_id,order_id,action,actor,title,aggregate_version,created_at,read_at)
    VALUES($1,$2,$3,$4,$5,$6,'fixture','fixture','fixture',1,now(),CASE WHEN $7 THEN now() ELSE NULL END)`,[randomUUID(),enterpriseId,teamId,subject,randomUUID(),id,read]);
  const store=new NotificationStore(pool,resolveDatabaseActor),actor={enterpriseId,teamId,subject:'viewer'};
  const inbox=await store.read(actor,{action:'inbox'});
  assert.equal(inbox.total,2);assert.equal(inbox.unread,1);
  assert.deepEqual(await store.read(actor,{action:'badge'}),{unread:inbox.unread});
  await pool.query("UPDATE enterprise_workflow.notifications SET read_at=now() WHERE enterprise_id=$1 AND order_id=$2 AND subject='viewer'",[enterpriseId,order]);
  assert.deepEqual(await store.read(actor,{action:'badge'}),{unread:0});
  await assert.rejects(store.read({...actor,teamId:other},{action:'badge'}),{code:'MEMBERSHIP_REQUIRED'});
  await pool.query("UPDATE enterprise_workflow.team_members SET enabled=false WHERE enterprise_id=$1 AND team_id=$2 AND subject='viewer'",[enterpriseId,teamId]);
  await assert.rejects(store.read(actor,{action:'badge'}),{code:'MEMBERSHIP_REQUIRED'});
  console.log('WORKFLOW_BADGE_PASS unread_only=1 matches_inbox=1 order_visibility=1 other_team_denied=1 revoked_denied=1');
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
