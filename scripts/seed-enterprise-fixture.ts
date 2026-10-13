import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
  const db=await import('../src/lib/db'),pw=await import('../src/lib/pw'),erp=await import('../src/lib/enterprise/server'),auth=await import('../src/lib/admin-auth');
  await erp.ensureEnterpriseSchema();const p=db.getPool(),domain='@username.naumi.local',owner='北方'+domain,director='玄策'+domain,lead='孙疆'+domain,root=randomUUID(),sub=randomUUID(),cap=new Date(Date.now()+30*86400000).toISOString();
  const names=['北方','玄策','孙疆','澄心',...Array.from({length:5},(_,i)=>'孙疆'+(i+1))];
  for(const name of names){await db.getOrCreateUser(name+domain,name);await db.setUserPassword(name+domain,pw.hashPassword('enterprise-fixture-pass'))}
  await auth.setAdminPassword('fixture-console-password');
  for(const [id,email,name]of [[root,owner,'天地合大健康（隔离验收）'],[sub,lead,'孙疆实习生团队']])await p.query('INSERT INTO app_account_teams(id,owner_email,name,authorized_until)VALUES($1,$2,$3,$4)',[id,email,name,cap]);
  for(const email of [owner,lead])await p.query("INSERT INTO app_team_access_grants(email,scope,created_by,updated_by)VALUES($1,'owned','fixture','fixture')",[email]);
  for(const name of names.slice(1)){const email=name+domain,team=/^孙疆\d$/.test(name)?sub:root;await p.query('INSERT INTO app_account_team_members(email,team_id)VALUES($1,$2)',[email,team]);await p.query('UPDATE app_users SET account_expires_at=$2 WHERE email=$1',[email,cap])}
  await erp.activateEnterprise({email:'fixture',admin:true,consoleAdmin:true},root,director,[sub]);
  console.log('FIXTURE_READY=1 ENTERPRISE_ID='+root+' ACCOUNTS=9 REAL_PROVIDER_CALLS=0');await p.end();
}
main().catch(e=>{console.error(e);process.exitCode=1});
