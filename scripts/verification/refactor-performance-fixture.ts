/** Local performance data only. Both versions compile this against their own
 * original public data APIs. No imported handler or browser API is replaced. */
import {writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import * as db from '@/lib/db';
import {hashPassword} from '@/lib/pw';
import {uploadImage} from '@/lib/media-upload';
import {createCredentialStore} from '@/lib/model-config/credentials';
import {createModelRepository} from '@/lib/model-config/repository';
import {getBillingRuntime} from '@/lib/billing/runtime';
import type {ModelConfig} from '@/lib/model-config/types';

async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL!).hostname!=='db'||!/^r8d_[a-f0-9]+$/.test((process.env.PGOPTIONS||'').split('search_path=')[1]))throw Error('OWN_LOCAL_PERFORMANCE_FIXTURE_REQUIRED');
 const sql=db.getPool(),owner='refactor-performance@fixture.test',password='performance-fixture-only-20261030';
 try{
  await db.ensureSchema();await db.getOrCreateUser(owner,'重构性能样本');await db.setUserPassword(owner,hashPassword(password));
  await db.setSetting('multi_user_enabled','1');await db.setSetting('admin_password_hash',hashPassword('performance-admin-local-only'));
  await sql.query('DELETE FROM app_ledger WHERE email=$1',[owner]);await sql.query('DELETE FROM app_credit_batches WHERE email=$1',[owner]);await sql.query('UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1',[owner]);await db.addCreditBatch(owner,100000,{source:'admin',reason:'Isolated performance fixture'});
  const cred=await createCredentialStore(sql).importPlain({providerId:'p1',plain:'local-performance-unused',actor:'fixture'});
  const config:ModelConfig={schemaVersion:1,providers:[{id:'p1',name:'Local unused supplier',protocol:'openai-images',baseUrl:'http://provider:3300/v1',credentialRef:cred.id,enabled:true,timeoutMs:120000,maxConcurrent:4}],upstreamModels:[{id:'u1',providerId:'p1',model:'wire-image-one',label:'本地样本通道',modality:'image',enabled:true,capabilities:{verified:true,generate:true,edit:true,vision:false,preserveIdentity:true,textAccuracy:false,transparent:false,qualityRank:3,qualities:['medium','high'],nativeResolutions:['1K','2K'],maxReferenceImages:4,expectedLatencyMs:30000},parameterMap:{resolutionPolicy:{mode:'map',field:'resolution',ratioField:'aspect_ratio',values:{'1K':'1K','2K':'2K'}}},costRef:'supplier-cost-estimate'}],publicModels:[{id:'image-a',label:'本地图片样本',modality:'image',enabled:true,visible:true,target:{type:'upstream',id:'u1'}}],pools:[],bindings:{'image.generate':'image-a','image.edit':'image-a'}};
  await createModelRepository({pool:sql,initialize:async()=>config,trustedOrigins:['http://provider:3300']}).current();
  const billing=await getBillingRuntime(),current=await billing.config.current(),next=structuredClone(current.config);next.switches.metering='on';
  for(const feature of ['image.generate','canvas.image'] as const){next.features[feature].pricing={mode:'fixed',credits:6};next.features[feature].rules=[];}
  await billing.config.publish({id:randomUUID(),actor:'fixture',reason:'Fixed performance input',expectedVersion:current.version,config:next});
  const media:{url:string;sha256:string;bytes:number;width:number;height:number}[]=[];
  for(let n=0;n<12;n++){
   const raw=Buffer.alloc(1024*1024*3);
   for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){const i=(y*1024+x)*3;raw[i]=(x+n*17)%256;raw[i+1]=(y+n*23)%256;raw[i+2]=(Math.floor(x/4)+Math.floor(y/4)+n*29)%256;}
   const bytes=await sharp(raw,{raw:{width:1024,height:1024,channels:3}}).png().toBuffer(),url=await uploadImage(bytes,'image/png',`performance/image-${n}.png`,undefined,owner);media.push({url,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,width:1024,height:1024});
  }
  const stamp='2026-10-24T00:00:00.000Z';
  const arts=Array.from({length:300},(_,i)=>({id:'perf-'+i,title:'商品图 '+i,category:'main',prompt:'保留商品细节与真实材质。'.repeat(40),status:'completed',image:media[i%12].url,gradient:'',createdAt:stamp,origin:'canvas',source:'canvas-add',groupId:'perf-0',parentId:i?'perf-0':undefined,width:1024,height:1024,canvasWidth:320,canvasHeight:320,canvasX:(i%20)*440,canvasY:Math.floor(i/20)*440}));
  await db.addArtworks(owner,arts as Parameters<typeof db.addArtworks>[1]);
  for(const [i,art]of arts.entries())await sql.query('UPDATE app_artworks SET canvas_x=$2,canvas_y=$3,canvas_width=320,canvas_height=320,created_at=$4 WHERE email=$5 AND id=$1',[art.id,(i%20)*440,Math.floor(i/20)*440,stamp,owner]);
  await db.setProjectName(owner,'tree:perf-0','R8D 300-node fixed project');
  for(let i=0;i<20;i++)await db.upsertCanvasTextNode(owner,{id:'text-perf-'+i,projectKey:'tree:perf-0',title:'样本文字 '+i,prompt:'',content:'固定多行文字输入。\n不调用供应商。'.repeat(8),status:'completed',canvasX:i*440,canvasY:15*440,width:320,height:200,createdAt:stamp,updatedAt:stamp,sourceIds:[],targetIds:[],productIds:[]});
  const counts=(await sql.query('SELECT (SELECT count(*)::int FROM app_artworks WHERE email=$1) artworks,(SELECT count(*)::int FROM app_canvas_text_nodes WHERE email=$1) texts,(SELECT count(*)::int FROM app_ledger WHERE email=$1 AND kind=\'consume\') consumes',[owner])).rows[0];
  if(counts.artworks!==300||counts.texts!==20||counts.consumes!==0)throw Error('PERFORMANCE_SEED_INCOMPLETE');
  await writeFile('/evidence/SETUP.json',JSON.stringify({owner,password,media,counts,project:'tree:perf-0',timestamp:stamp},null,2)+'\n');
  console.log('REFACTOR_PERFORMANCE_SETUP=PASS ARTWORKS=300 TEXTS=20 MEDIA=12 CONSUMES=0 SUPPLIER=0');
 }finally{await sql.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
