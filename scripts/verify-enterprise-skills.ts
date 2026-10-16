import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createModelFixture} from "./model-config-fixture";
import {OFFICIAL_IMAGE_SKILLS,validateSkillDraft} from "../src/lib/image-skills/catalog";
async function main(){
 let checks=0;const ok=(value:unknown)=>{assert.ok(value);checks++};const f=await createModelFixture();process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
 const db=await import("../src/lib/db"),store=await import("../src/lib/image-skills/server"),route=await import("../src/app/api/image-skills/route"),{ensureEnterpriseSchema}=await import("../src/lib/enterprise/server"),{signUserSession}=await import("../src/lib/native-auth");
 const a="skills-a@example.test",b="skills-b@example.test",outside="skills-outside@example.test",owner="skills-owner@example.test",owner2="skills-other-owner@example.test",solo="skills-solo@example.test";
 try{
  for(const [email,name] of [[a,"梦桐"],[b,"逍遥"],[outside,"他企成员"],[owner,"北方"],[owner2,"南方"],[solo,"独立用户"]])await db.getOrCreateUser(email,name);
  await ensureEnterpriseSchema();const org=randomUUID(),org2=randomUUID();
  for(const [id,email,name] of [[org,owner,"天地合大健康"],[org2,owner2,"其他企业"]]){
   await db.getPool().query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,$2,$3,now()+interval '1day')",[id,name,email]);
   await db.getPool().query("INSERT INTO app_enterprise_settings(team_id) VALUES($1)",[id]);
   await db.getPool().query("INSERT INTO app_team_access_grants(email,scope,expires_at,created_by,updated_by) VALUES($1,'owned',NULL,'fixture','fixture') ON CONFLICT(email) DO UPDATE SET enabled=true,expires_at=NULL,revoked_at=NULL,starts_at=now()",[email]);
  }
  for(const [email,id,boss] of [[a,org,owner],[b,org,owner],[outside,org2,owner2]])await db.getPool().query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,$3,'permanent')",[id,email,boss]);
  const req=(email:string,method:string,body?:unknown)=>new Request(f.origin+"/api/image-skills",{method,headers:{cookie:`nv_user=${signUserSession(email,Date.now())}`,"content-type":"application/json"},body:body?JSON.stringify(body):undefined});
  const definition={...validateSkillDraft(OFFICIAL_IMAGE_SKILLS[1]),name:"同企业复用蓝色商品图"};
  const created=await route.POST(req(a,"POST",{definition,visibility:"enterprise",enterpriseId:org2,authorName:"伪造作者",email:outside}));ok(created.status===201);let shared=(await created.json()).skill;
  ok(shared.visibility==="enterprise"&&shared.authorName==="梦桐"&&shared.canEdit===true);
  const row=(await db.getPool().query("SELECT enterprise_id,email FROM app_image_skills WHERE id=$1",[shared.id])).rows[0];ok(row.enterprise_id===org&&row.email===a);
  for(const member of [a,b,owner]){const data=await(await route.GET(req(member,"GET"))).json();ok(data.enterprise.id===org);const item=data.skills.find((s:any)=>s.id===shared.id);ok(item&&item.authorName==="梦桐"&&item.canEdit===(member===a));ok((await store.resolveImageSkill(member,shared))?.name===definition.name)}
  for(const email of [outside,owner2,solo]){const data=await(await route.GET(req(email,"GET"))).json();ok(!data.skills.some((s:any)=>s.id===shared.id));await assert.rejects(store.resolveImageSkill(email,shared),/不存在/);checks++}
  ok((await route.GET(new Request(f.origin+"/api/image-skills"))).status===401);
  ok((await route.PATCH(req(b,"PATCH",{definition,selection:shared,visibility:"enterprise"}))).status===409);
  ok((await route.DELETE(req(b,"DELETE",{selection:shared}))).status===409);
  const clone=(await(await route.POST(req(b,"POST",{definition:{...definition,name:"逍遥的副本"},visibility:"enterprise"}))).json()).skill;ok(clone.authorName==="逍遥"&&clone.canEdit&&clone.id!==shared.id);
  const personal=(await(await route.POST(req(a,"POST",{definition,visibility:"private"}))).json()).skill;ok(personal.visibility==="private");ok(!(await store.listImageSkills(b)).some(s=>s.id===personal.id));
  const historical=(await(await route.POST(req(a,"POST",{definition}))).json()).skill;ok(historical.visibility==="private");
  ok((await route.POST(req(solo,"POST",{definition,visibility:"enterprise",enterpriseId:org}))).status===403);
  ok((await route.POST(req(a,"POST",{definition,visibility:"everyone"}))).status===400);
  const frozen=await store.resolveImageSkill(b,shared);const update=await route.PATCH(req(a,"PATCH",{definition:{...definition,name:"同企业新版"},selection:shared}));ok(update.status===200);const revised=(await update.json()).skill;ok(revised.visibility==="enterprise"&&revised.revision===2);ok(frozen?.revision===1);
  await assert.rejects(store.resolveImageSkill(b,shared),/已更新/);checks++;shared=revised;
  const privateUpdate=(await(await route.PATCH(req(a,"PATCH",{definition,selection:shared,visibility:"private"}))).json()).skill;ok(privateUpdate.visibility==="private");await assert.rejects(store.resolveImageSkill(b,privateUpdate),/不存在/);checks++;
  shared=(await(await route.PATCH(req(a,"PATCH",{definition,selection:privateUpdate,visibility:"enterprise"}))).json()).skill;
  await db.getPool().query("DELETE FROM app_enterprise_members WHERE email=$1",[b]);await assert.rejects(store.resolveImageSkill(b,shared),/不存在/);checks++;ok((await store.imageSkillEnterprise(b))===null);
  await db.getPool().query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,$3,'permanent')",[org,b,owner]);
  await db.getPool().query("UPDATE app_enterprise_members SET enterprise_id=$1,supervisor_email=$2 WHERE email=$3",[org2,owner2,b]);await assert.rejects(store.resolveImageSkill(b,shared),/不存在/);checks++;ok(!(await store.listImageSkills(b)).some(s=>s.id===clone.id));ok((await route.PATCH(req(b,"PATCH",{definition,selection:clone,visibility:"enterprise"}))).status===403);
  await db.getPool().query("UPDATE app_enterprise_members SET enterprise_id=$1,supervisor_email=$2 WHERE email=$3",[org,owner,b]);
  for(const sql of ["UPDATE app_team_access_grants SET enabled=false WHERE email=$1","UPDATE app_team_access_grants SET enabled=true,expires_at=now()+interval '1 second' WHERE email=$1"]){await db.getPool().query(sql,[owner]);if(sql.includes('1 second'))await db.getPool().query("UPDATE app_team_access_grants SET expires_at=now()-interval '1 second',starts_at=now()-interval '1 day' WHERE email=$1",[owner]);await assert.rejects(store.resolveImageSkill(b,shared),/不存在/);checks++}
  await db.getPool().query("UPDATE app_team_access_grants SET enabled=true,expires_at=NULL,starts_at=now() WHERE email=$1",[owner]);
  await db.getPool().query("UPDATE app_enterprise_settings SET enabled=false WHERE team_id=$1",[org]);await assert.rejects(store.resolveImageSkill(b,shared),/不存在/);checks++;await db.getPool().query("UPDATE app_enterprise_settings SET enabled=true WHERE team_id=$1",[org]);
  await db.getPool().query("UPDATE app_users SET banned=true WHERE email=$1",[b]);await assert.rejects(store.resolveImageSkill(b,shared),/不存在/);checks++;await db.getPool().query("UPDATE app_users SET banned=false WHERE email=$1",[b]);
  await db.getPool().query("UPDATE app_users SET name='梦桐花名更新' WHERE email=$1",[a]);ok((await store.resolveImageSkill(b,shared))?.authorName==="梦桐花名更新");
  const race=await Promise.all([1,2].map(()=>route.PATCH(req(a,"PATCH",{definition,selection:shared,visibility:"enterprise"}))));ok(race.filter(r=>r.status===200).length===1&&race.filter(r=>r.status===409).length===1);
  const current=(await store.listImageSkills(a)).find(s=>s.id===shared.id)!;ok((await route.DELETE(req(a,"DELETE",{selection:current}))).status===200);await assert.rejects(store.resolveImageSkill(b,current),/不存在/);checks++;
  console.log(`ENTERPRISE_SKILLS=PASS; CHECKS=${checks}; TENANT_ISOLATION=PASS; AUTHOR=FLOWER_NAME; OWNER_WRITE_ONLY=PASS; LIFECYCLE=PASS; PROVIDER_CALLS=0`);
 }finally{await db.getPool().end();await f.cleanup()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
