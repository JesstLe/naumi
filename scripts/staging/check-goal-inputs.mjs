// Read-only blocker refresh. No auth requests, provider probes, or task writes.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire('/app/server.js');const {Pool}=require('pg');
assert.equal(process.env.NAUMI_ENVIRONMENT,'staging');
const working=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,options:'-c default_transaction_read_only=on'});
const u=new URL(process.env.DATABASE_URL);u.pathname='/naumi_snapshot_reference';
const reference=new Pool({connectionString:u.toString(),ssl:false,options:'-c default_transaction_read_only=on'});
try{
 const query='SELECT v.config FROM app_model_config_state s JOIN app_model_config_versions v ON v.version=s.active_version WHERE s.singleton=true';
 const w=(await working.query(query)).rows[0].config,r=(await reference.query(query)).rows[0].config;
 const p=w.providers.find(p=>p.id==='video:openai-videos'),q=r.providers.find(p=>p.id==='video:openai-videos');
 let same=false;
 if(p&&q){
  const sql='SELECT key_enc FROM app_model_credentials WHERE id=$1 AND provider_id=$2';
  const a=(await working.query(sql,[p.credentialRef,p.id])).rows[0]?.key_enc;
  const b=(await reference.query(sql,[q.credentialRef,q.id])).rows[0]?.key_enc;
  same=p.baseUrl===q.baseUrl&&p.credentialRef===q.credentialRef&&!!a&&a===b;
 }
 console.log('VIDEO_CONFIG_CHANGED_FROM_SNAPSHOT='+Number(!same)+' PROVIDER_REQUESTS=0 GENERATED_TASKS=0');
 const result=await working.query("SELECT count(*)::int n FROM app_video_tasks WHERE status='done' AND NOT EXISTS(SELECT 1 FROM naumi_staging_guard.origin_rows o WHERE o.table_name='app_video_tasks' AND o.row_key=app_video_tasks.id::text)");
 console.log('NEW_VIDEO_DONE='+result.rows[0].n);
 console.log('GOAL_INPUT_REFRESH=READONLY DB_WRITES=0');
}finally{await working.end();await reference.end();}
