import assert from 'node:assert/strict';
import {getPool} from '../src/lib/db';
import {listImageSkills,resolveImageSkill,saveImageSkill,archiveImageSkill} from '../src/lib/image-skills/server';
import {OFFICIAL_IMAGE_SKILLS,validateSkillDraft} from '../src/lib/image-skills/catalog';
import {GET,PATCH,DELETE} from '../src/app/api/image-skills/route';
import {signUserSession} from '../src/lib/native-auth';
async function main(){
 const owner=(await getPool().query("SELECT u.email,u.name FROM app_users u JOIN app_enterprise_members m ON m.email=u.email WHERE m.enterprise_id=$1 AND u.name='逍遥'",['1095114e-6b57-429e-a954-7d663907e0c9'])).rows[0];
 const peer=(await getPool().query("SELECT u.email,u.name FROM app_users u JOIN app_enterprise_members m ON m.email=u.email WHERE m.enterprise_id=$1 AND u.name='若兮'",['1095114e-6b57-429e-a954-7d663907e0c9'])).rows[0];
 const outsider=(await getPool().query("SELECT u.email,u.name FROM app_users u WHERE NOT u.banned AND (u.account_expires_at IS NULL OR u.account_expires_at>now()) AND NOT EXISTS(SELECT 1 FROM app_enterprise_members m WHERE m.email=u.email) AND NOT EXISTS(SELECT 1 FROM app_account_teams t WHERE t.owner_email=u.email) ORDER BY u.email LIMIT 1")).rows[0];assert(owner&&peer&&outsider);
 const activeBefore=(await getPool().query('SELECT count(*)::int n FROM app_image_skills WHERE deleted_at IS NULL')).rows[0].n;
 const definition={...validateSkillDraft(OFFICIAL_IMAGE_SKILLS[1]),name:'同企业验收临时模板-'+Date.now()};let skill;
 const req=(email:string,method:string,body?:unknown)=>new Request('https://47.105.59.142/api/image-skills',{method,headers:{cookie:'nv_user='+signUserSession(email,Date.now()),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 try{
  skill=await saveImageSkill(owner.email,definition,undefined,'enterprise');
  assert.equal((await resolveImageSkill(peer.email,skill))?.authorName,owner.name);
  const list=await(await GET(req(peer.email,'GET'))).json();assert(list.skills.some((s:any)=>s.id===skill!.id&&s.canEdit===false));
  assert(!(await listImageSkills(outsider.email)).some(s=>s.id===skill!.id));await assert.rejects(resolveImageSkill(outsider.email,skill),/不存在/);
  assert.equal((await PATCH(req(peer.email,'PATCH',{definition,selection:skill,visibility:'enterprise'}))).status,409);assert.equal((await DELETE(req(peer.email,'DELETE',{selection:skill}))).status,409);
  console.log('LIVE_MULTI_ACCOUNT=PASS; SAME_ENTERPRISE=PASS; AUTHOR='+owner.name+'; OUTSIDE_ENTERPRISE=DENIED; PEER_WRITE=DENIED; SHARED_EXECUTION_RESOLVE=PASS; PROVIDER_CALLS=0');
 }finally{if(skill){await archiveImageSkill(owner.email,skill);await getPool().query('DELETE FROM app_image_skills WHERE id=$1 AND email=$2 AND deleted_at IS NOT NULL',[skill.id,owner.email])}const n=(await getPool().query('SELECT count(*)::int n FROM app_image_skills WHERE deleted_at IS NULL')).rows[0].n;assert.equal(n,activeBefore);await getPool().end()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
