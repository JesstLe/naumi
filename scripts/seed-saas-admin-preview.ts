import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {getPool,getOrCreateUser,setSetting,getSetting} from '../src/lib/db';
import {ensureTenantSchema,createTenant} from '../src/lib/saas/tenants';
import {ensureCreationSchema} from '../src/lib/saas/creation-schema';
import {setAdminPassword,signSession} from '../src/lib/admin-auth';
import {signUserSession} from '../src/lib/native-auth';
import {writeStoredObject} from '../src/lib/storage';
import {ensureBiSchema} from '../src/lib/bi/repository';
import {hashPassword} from '../src/lib/pw';

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.ok(/saas_admin_fixture$/.test(url.pathname)||process.env.VERIFY_ADMIN_UI_INTEGRATION==='1'&&url.pathname.includes('fixture'));
 await ensureTenantSchema();await ensureCreationSchema();await ensureBiSchema();const pool=getPool();
 const stamp='saas-20261022';
 if((await pool.query('SELECT 1 FROM app_settings WHERE k=$1',[stamp])).rows.length){console.log('Fixture already seeded; existing isolated data retained');await pool.end();return;}
 const admin='platform@saas.fixture',owner='owner-a@saas.fixture',other='owner-b@saas.fixture',manager='manager@saas.fixture',member='member@saas.fixture',departed='departed@saas.fixture',personal='personal@saas.fixture';
 const password=randomBytes(18).toString('base64url');
 for(const[email,name]of [[admin,'平台管理员（fixture）'],[owner,'苏禾（fixture）'],[other,'企业B负责人（fixture）'],[manager,'林悦（fixture）'],[member,'许辰（fixture）'],[departed,'已离职员工（fixture）'],[personal,'个人P（fixture）']]){
  await getOrCreateUser(email,name);await pool.query('UPDATE app_users SET password_hash=$2 WHERE email=$1',[email,hashPassword(password)]);
 }
 await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);await setAdminPassword(password);await setSetting('site_name','Naumi · 隔离验收 fixture');await setSetting('multi_user_enabled','1');
 const actor={email:admin,admin:true,consoleAdmin:true};
 const a=await createTenant(actor,{commandId:randomUUID(),name:'云杉电商 · fixture',ownerEmail:owner,validUntil:null,seatLimit:50,entitlementName:'企业授权 · fixture',featurePolicy:{video:true,generate:true}});
 const b=await createTenant(actor,{commandId:randomUUID(),name:'北辰设计 · fixture',ownerEmail:other,validUntil:null,seatLimit:12,entitlementName:'团队授权 · fixture',featurePolicy:{generate:true}});
 const role=randomUUID();await pool.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,'设计主管',10,true,true)",[a.tenantId,role]);
 await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent'),($1,$5,$2,NULL,'permanent'),($1,$6,$3,NULL,'permanent')",[a.tenantId,manager,owner,role,member,departed]);
 await pool.query("UPDATE app_enterprise_members SET membership_status='suspended',left_at=now() WHERE email=$1",[departed]);
 const media=['public/demos/image-before.webp','public/demos/image-after.webp','public/demos/packaging3d-after.webp'];
 const assets:string[]=[];for(const [i,file]of media.entries()){const key=`saas-fixture/${stamp}-${i}.webp`;await writeStoredObject(await readFile(file),'image/webp',key);assets.push(`/media/${key}`);}
 const ids:string[]=[];
 for(const [i,status]of ['succeeded','succeeded','failed','running','partial','needs_review'].entries()){
  const id=`cr-${randomUUID()}`,email=i%2?member:manager,title=['商品主图优化','秋季海报','商品细节修复','产品短片','礼盒场景图','输出待核查'][i];ids.push(id);
  const at=new Date(Date.now()-i*42*60000).toISOString();
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,payer_account_id,source_kind,source_id,status,request_snapshot,parameters_snapshot,model_snapshot,accepted_at)
   VALUES($1,$2,'tenant',$3,$2,'fixture',$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)`,[id,email,a.tenantId,`fixture-${i}`,status,JSON.stringify({state:'recorded',text:`${title}。保留包装文字，将背景改为浅灰，增加柔和阴影，输出 1:1 主图。（隔离 fixture）`}),JSON.stringify({state:'recorded',values:{ratio:'1:1',resolution:'2K',quantity:1,background:'opaque'}}),JSON.stringify({state:'recorded',label:'测试模型显示名（fixture）'}),at]);
  for(const [position,type]of ['input','input','output'].entries()){
   if(status==='failed'&&type==='output'||status==='running'&&type==='output')continue;
   const artwork=`fixture-art-${i}-${position}`,assetId=`ca-${randomUUID()}`;
   await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient) VALUES($1,$2,$3,'fixture',$3,$4,'')",[artwork,email,title,assets[position]]);
   await pool.query("INSERT INTO app_creation_assets(id,creation_id,actor_email,direction,role,position,storage_ref,mime) VALUES($1,$2,$3,$4,$5,$6,$7,'image/webp')",[assetId,id,email,type,position===0?'edit-target':position===1?'reference':'result',position,`artwork:${artwork}`]);
   await pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email,relation) VALUES($1,'artwork',$2,$3,$4)",[id,artwork,email,type]);
  }
  for(const [j,step]of ['accepted','execution',...(status==='succeeded'?['delivered']:[])].entries())await pool.query("INSERT INTO app_creation_events(id,creation_id,event_key,type,status,summary,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7)",[`ev-${randomUUID()}`,id,`fixture-${j}`,step,j===0?'queued':status,['提交要求','图片处理','完成交付'][j],new Date(Date.parse(at)+j*15000).toISOString()]);
  if(status==='succeeded'||status==='partial'){
   const operation=`fixture-billing-${i}`,charge=i===1?12:6;await pool.query("INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,charged_credits,ledger_id) VALUES($1,$2,'fixture',$3::jsonb,'fixture','settled',$4,$5)",[operation,email,JSON.stringify({requestedCredits:charge,reserveCredits:charge}),charge,`led-${operation}`]);
   await pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email,reserved_credits,released_credits) VALUES($1,'billing',$2,$3,$4,$4)",[id,operation,email,charge]);
   await pool.query("INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,$3,'隔离fixture账务','consume')",[`led-${operation}`,email,-charge]);
  }
 }
 const foreignId=`cr-${randomUUID()}`;await pool.query("INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,request_snapshot) VALUES($1,$2,'tenant',$3,'fixture','foreign',$4::jsonb)",[foreignId,other,b.tenantId,JSON.stringify({state:'recorded',text:'企业B私有创作 fixture'})]);
 await pool.query("INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id,request_snapshot) VALUES($1,$2,'personal','fixture','personal',$3::jsonb)",[`cr-${randomUUID()}`,personal,JSON.stringify({state:'recorded',text:'私人创作 fixture'})]);
 await setSetting(stamp,'1');
 const passwordHash=await getSetting('admin_password_hash');await mkdir('output/saas-admin-20261022',{recursive:true});
 await writeFile('output/saas-admin-20261022/fixture-access.json',JSON.stringify({fixture:true,origin:'http://127.0.0.1:18499',admin:{email:admin,password,cookie:`nv_admin=${signSession(Date.now(),passwordHash!)}`},owner:{email:owner,password,cookie:`nv_user=${signUserSession(owner,Date.now())}`},manager:{email:manager,cookie:`nv_user=${signUserSession(manager,Date.now())}`},departed:{email:departed,cookie:`nv_user=${signUserSession(departed,Date.now())}`},tenantA:a.tenantId,tenantB:b.tenantId,creationId:ids[0],foreignId},null,2));
 console.log(`Fixture seeded: 2 tenants / 7 accounts / 8 creations; supplier calls=0. Local access file written in ignored output.`);await pool.end();
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Fixture seed failed');process.exitCode=1;});
