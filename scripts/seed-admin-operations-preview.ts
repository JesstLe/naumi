import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {getPool,getOrCreateUser,getSetting,setUserPassword} from '../src/lib/db';
import {hashPassword} from '../src/lib/pw';
import {ensureBiSchema} from '../src/lib/bi/repository';
import {ensureEnterpriseSchema} from '../src/lib/enterprise/server';
import {ALL_FEATURE_IDS} from '../src/lib/feature-access/catalog';
import {ensureSitePolicySchema,applySitePolicyTx} from '../src/lib/site-control/store';
import {WORKSPACE_MODULES} from '../src/lib/site-control/contracts';
import {writeStoredObject} from '../src/lib/storage';
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');assert.match(new URL(process.env.DATABASE_URL!).pathname,/saas_admin_fixture$/);
 await ensureBiSchema();await ensureEnterpriseSchema();const pool=getPool();
 const access=JSON.parse(await readFile('output/saas-admin-20261022/fixture-access.json','utf8'));const tenant=access.tenantA;
 const exists=await pool.query("SELECT 1 FROM app_settings WHERE k='admin-operations-fixture-20261029'");
 if(!exists.rowCount){
  const role=randomUUID();await pool.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,'正式员工',100,false,false)",[tenant,role]);
  const accounts=[['林川','linchuan@preview.test'],['知夏','zhixia@preview.test'],['清和','qinghe@preview.test'],['南星','nanxing@preview.test'],['白露','bailu@preview.test']];
  for(const[name,email]of accounts){await getOrCreateUser(email,name);await setUserPassword(email,hashPassword(access.owner.password));await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent')",[tenant,email,access.owner.email,role]);await pool.query('UPDATE app_users SET note=$2 WHERE email=$1',[email,`${name}-云杉电商-本地验收样本`]);}
  const files=['public/demos/image-before.webp','public/demos/image-after.webp','public/demos/packaging3d-after.webp'];for(const[i,f]of files.entries())await writeStoredObject(await readFile(f),'image/webp',`admin-preview/sample-${i}.webp`);
  for(let i=0;i<180;i++){
   const [,email]=accounts[i%accounts.length],age=i<140?i%28:35+i%60,at=new Date(Date.now()-age*86400000-(i%10)*3600000),id=`preview-job-${i}`,title=['商品主图','电商海报','产品详情','场景展示','包装设计'][i%5];
   await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,reserved_cost,metered,billing_settled,created_at,updated_at) VALUES($1,$2,'generate',$3::jsonb,'{}',6,0,true,true,$4,$4)",[id,email,JSON.stringify({status:'done',progress:100,images:[{id:`preview-art-${i}`}]}),at]);
   const kind=i%13===0?'upload':'generated',url=`/media/admin-preview/sample-${i%3}.webp`;
   await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,batch_id,origin,creation_provenance,created_at) VALUES($1,$2,$3,'image',$4,$5,'',$6,'canvas',$7::jsonb,$8)",[`preview-art-${i}`,email,title,'本地验收样本：'+title,url,kind==='upload'?null:id,JSON.stringify({version:1,operation:kind==='upload'?'upload':'generate',entry:'canvas',ref:kind==='upload'?`upload-${i}`:id,evidence:'local-preview-fixture'}),at]);
   await pool.query("INSERT INTO app_ledger(id,email,delta,kind,reason,created_at) VALUES($1,$2,-6,'consume','图片生成',$3)",['led-image-'+id,email,at]);
   await pool.query("INSERT INTO app_bi_model_calls(id,email,operation,operation_id,wire_model,response_model,state,duration_ms,input_tokens,output_tokens,created_at) VALUES($1,$2,'image.generate',$3,'preview-image','preview-image','completed',1000,$4,$5,$6)",['preview-call-'+i,email,id,i%5?120+i:null,i%5?80+i:null,at]);
  }
  // Historical sample has no creation projection: it must remain visible from the original table.
  await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered,billing_settled,created_at,updated_at) VALUES('preview-history-2024',$1,'generate','{\"status\":\"done\"}','{}',6,true,true,'2024-04-12T04:00:00Z','2024-04-12T04:00:40Z')",[accounts[0][1]]);
  await pool.query("INSERT INTO app_ledger(id,email,delta,kind,reason,created_at) VALUES('preview-refund',$1,6,'refund','验收退款样本',now()-interval '2 days')",[accounts[1][1]]);
  await pool.query("INSERT INTO app_settings(k,v) VALUES('admin-operations-fixture-20261029','1')");
 }
 process.env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE='dedicated';process.env.NAUMI_ENTERPRISE_ALLOWED_IDS=tenant;process.env.NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID='local-admin-preview-20261029';await ensureSitePolicySchema();
 const policy=(await pool.query('SELECT 1 FROM app_site_policy')).rowCount;if(!policy){const tx=await pool.connect();try{await tx.query('BEGIN');await applySitePolicyTx(tx,{id:randomUUID(),actor:'local-preview',expectedRevision:0,policy:{enterpriseId:tenant,sourceInstanceId:'local-admin-preview-20261029',brand:'Naumi · 本地验收',enabledFeatures:ALL_FEATURE_IDS,workspaceModules:WORKSPACE_MODULES.map(m=>m.id)}});await tx.query('COMMIT');}finally{tx.release()}}
 await mkdir('output/admin-operations-preview',{recursive:true});await writeFile('output/admin-operations-preview/ACCESS.private.json',JSON.stringify({...access,platformOrigin:'http://127.0.0.1:55139',enterpriseOrigin:'http://127.0.0.1:55140',fixture:true,productionData:false},null,2));
 console.log('ADMIN_OPERATIONS_PREVIEW_SEEDED=PASS HISTORICAL_JOB_2024=1 RECENT_JOBS=180 LIVE_SUPPLIER_CALLS=0');await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
