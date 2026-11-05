const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript'),sharp=require('sharp'),{Pool}=require('pg');
const root=process.argv.includes('--source-root')?path.resolve(process.argv[process.argv.indexOf('--source-root')+1]):process.cwd();
const baseline=process.argv.includes('--baseline');
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL).hostname,'127.0.0.1');
const namespace='completed_parent_'+crypto.randomUUID().replaceAll('-','');let db;const admin=new Pool({connectionString:process.env.DATABASE_URL});
let checks=0,network=0,mediaFailure=false,mediaRace=null;
function load(file,deps){if(deps['../db'])deps['@/platform/db/pool']=deps['../db'];if(deps['../durable-image-jobs'])deps['@/lib/image-jobs/runtime']=deps['../durable-image-jobs'];const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,Buffer,Date,Set,Map,console,require:n=>n==='server-only'?{}:n.startsWith('node:')?require(n):deps[n]??{}});return exports;}
const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
(async()=>{try{
 await admin.query(`CREATE SCHEMA ${namespace}`);db=new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${namespace}`});
 await db.query(`CREATE TABLE app_image_jobs(id text PRIMARY KEY,email text,kind text,snapshot jsonb,payload jsonb,lease_token text,lease_until timestamptz,billing_settled boolean,metered boolean,updated_at timestamptz DEFAULT now());
 CREATE TABLE app_artworks(id text PRIMARY KEY,email text,image_url text,deleted_at timestamptz);
 CREATE TABLE app_billing_operations(id text PRIMARY KEY,email text,state text,charged_credits int);
 CREATE TABLE app_ledger(id text PRIMARY KEY,email text,kind text,delta int);
 CREATE TABLE app_release_activities(id text PRIMARY KEY,state text,admission_key text);
 CREATE TABLE app_creation_records(id text PRIMARY KEY,status text);`);
 const plan={request:{variants:1,inputs:[],output:{format:'png'}},intent:{background:null},steps:[{key:'edit',operation:'edit'}]};
 const parent={status:'pending',result:{status:'queued',stage:'editing',artifacts:[]},children:{edit:{state:'submitted',jobId:'child'}}},child={status:'done',images:[{id:'art'}],paidOperations:{}};
 const png=await sharp({create:{width:4,height:3,channels:4,background:{r:0,g:100,b:200,alpha:1}}}).png().toBuffer();
 const deps={'../db':{dbEnabled:true,getPool:()=>db},'../staging-history':{assertMutableStagingTask:async(_db,_table,id)=>{if(id==='imported')throw Error('IMPORTED_HISTORY');}},'../saas/creation-writer':{recordImageStateTx:async(tx,id,s)=>tx.query('UPDATE app_creation_records SET status=$2 WHERE id=$1',[id,s.result.status])},'../canvas-image-input':{readCanvasOutput:async()=>{if(mediaFailure)throw Error('unreadable-media');if(mediaRace){const f=mediaRace;mediaRace=null;await f();}return {buffer:png,mimeType:'image/png'};}},'./postprocess':{inspectImagegenPixels:async(bytes)=>{const {info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});return {width:info.width,height:info.height,visiblePixels:12,transparentPixels:0};}},'./receipt-policy':load('src/lib/imagegen/receipt-policy.ts',{}),'./output-advisory':load('src/lib/imagegen/output-advisory.ts',{'./request-size':{}})};
 async function seed(){mediaFailure=false;mediaRace=null;await db.query('TRUNCATE app_image_jobs,app_artworks,app_billing_operations,app_ledger,app_release_activities,app_creation_records');await db.query(`INSERT INTO app_image_jobs VALUES('parent','owner','imagegen',$1::jsonb,$2::jsonb,'expired-parent',now()-interval '1 hour',false,false,now()),('child','owner','generate',$3::jsonb,'{}',NULL,NULL,true,true,now());`,[JSON.stringify(parent),JSON.stringify({plan}),JSON.stringify(child)]);await db.query("INSERT INTO app_artworks VALUES('art','owner','/media/fixture.png',NULL);INSERT INTO app_billing_operations VALUES('child','owner','settled',6);INSERT INTO app_ledger VALUES('led-image-child','owner','consume',-6);INSERT INTO app_release_activities VALUES('unknown-parent','unknown','imagegen:parent');INSERT INTO app_creation_records VALUES('parent','queued')");}
 const state=async()=>{const r=(await db.query('SELECT snapshot FROM app_image_jobs WHERE id=\'parent\'')).rows[0];return r.snapshot;};
 const preserved=async()=>JSON.stringify((await db.query("SELECT (SELECT to_jsonb(j) FROM app_image_jobs j WHERE id='child') AS child,(SELECT jsonb_agg(b) FROM app_billing_operations b) AS billing,(SELECT jsonb_agg(l) FROM app_ledger l) AS ledger,(SELECT jsonb_agg(a) FROM app_release_activities a) AS activity")).rows);
 await seed();
 if(baseline){
  let kicks=0;const d=load('src/lib/imagegen/dispatch.ts',{'../durable-image-jobs':{DurableImageJobs:class{async owner(){return 'owner'}async get(){return state()}async kick(){kicks++;return false;}}},'../db':{dbEnabled:true,getPool:()=>({query:async()=>({rows:[{scope:{},request:{}}]})})},'./creation-scope':{assertAcceptedImagegenCreationScope:async()=>{},ImagegenScopeError:class extends Error{}},'../image-job-review':{storedImageReview:async()=>null},'./stored-delivery':{storedDeliveryState:async()=>null}});
  const before=await preserved(),result=await d.getImagegenResult('fixture','owner');assert.equal(result.status,'queued');assert.equal(kicks,1);assert.equal(await preserved(),before);console.log('BASELINE=REPRODUCED COMPLETED_CHILD=1 PARENT_QUEUED=1 UNKNOWN_PRESERVED=1 NEW_POSTS=0');return;
 }
 const {finalizeCompletedParent:finish}=load('src/lib/imagegen/completed-parent-receipt.ts',deps),before=await preserved();
 assert.equal(await finish('parent','owner'),true);let s=await state();check('real original parent receipt completed despite unrelated UNKNOWN',()=>assert.equal(s.result.status,'succeeded'));check('original charge projected once',()=>assert.equal(s.result.chargedCredits,6));check('original media ID retained',()=>assert.equal(s.result.artifacts[0].artworkId,'art'));check('old expired token recorded as hash',()=>assert.match(s.completedChildReceipt.previousExpiredLeaseSha256,/^[a-f0-9]{64}$/));
 const after=await preserved();check('child billing ledger and UNKNOWN byte-equal',()=>assert.equal(before,after));
 let r=await db.query("SELECT lease_token,(SELECT status FROM app_creation_records WHERE id='parent') AS creation FROM app_image_jobs WHERE id='parent'");check('parent and creation updated together',()=>{assert.equal(r.rows[0].lease_token,null);assert.equal(r.rows[0].creation,'succeeded');});
 check('receipt proof is distinct and bound to original child',()=>assert.equal(s.completedChildReceipt.childId,'child'));
 assert.equal(await finish('parent','owner'),false);checks++;
 const negatives=[
  ['live parent lease',"UPDATE app_image_jobs SET lease_until=now()+interval '1 hour' WHERE id='parent'"],
  ['live child lease',"UPDATE app_image_jobs SET lease_token='active',lease_until=now()+interval '1 hour' WHERE id='child'"],
  ['token without expiry',"UPDATE app_image_jobs SET lease_until=NULL WHERE id='parent'"],
  ['child still pending',"UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{status}','\"pending\"') WHERE id='child'"],
  ['billing unsettled',"UPDATE app_image_jobs SET billing_settled=false WHERE id='child'"],
  ['child same id different owner',"UPDATE app_image_jobs SET email='foreign' WHERE id='child'"],
  ['foreign media',"UPDATE app_artworks SET email='foreign'"],
  ['deleted media',"UPDATE app_artworks SET deleted_at=now()"],
  ['unsettled bill',"UPDATE app_billing_operations SET state='hold'"],
  ['cancelled parent',"UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{status}','\"cancelled\"') WHERE id='parent'"],
  ['unknown paid attempt remains',"UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{paidOperations}','{\"original\":{\"state\":\"started\"}}') WHERE id='child'"],
  ['starting child link',"UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{children,edit,state}','\"starting\"') WHERE id='parent'"],
  ['output mismatch',"UPDATE app_image_jobs SET payload=jsonb_set(payload,'{plan,request,variants}','2') WHERE id='parent'"],
  ['unfinished output conversion',"UPDATE app_image_jobs SET payload=jsonb_set(payload,'{plan,request,output,format}','\"jpeg\"') WHERE id='parent'"],
  ['mask workflow',"UPDATE app_image_jobs SET payload=jsonb_set(payload,'{plan,request,inputs}','[{\"role\":\"mask\"}]') WHERE id='parent'"],
  ['image error',"UPDATE app_image_jobs SET snapshot=snapshot||'{\"imagegenOutputError\":\"bad\"}' WHERE id='child'"]
 ];
 for(const [name,q]of negatives){await seed();await db.query(q);const original=JSON.stringify(await state());assert.equal(await finish('parent','owner'),false,name);const current=JSON.stringify(await state());check(name+' preserved',()=>assert.equal(current,original));}
 await seed();assert.equal(await finish('parent','foreign'),false);checks++;
 await seed();mediaFailure=true;await assert.rejects(finish('parent','owner'),/unreadable-media/);check('unreadable bytes preserve parent',()=>assert.equal(mediaFailure,true));assert.equal((await state()).status,'pending');
 await seed();mediaRace=()=>db.query("UPDATE app_image_jobs SET snapshot=snapshot||'{\"otherWriter\":true}' WHERE id='parent'");assert.equal(await finish('parent','owner'),false);const raced=await state();check('snapshot CAS preserves concurrent update',()=>assert.equal(raced.otherWriter,true));
 await seed();const concurrent=await Promise.all([finish('parent','owner'),finish('parent','owner')]);check('concurrent finalization occurs once',()=>assert.equal(concurrent.filter(Boolean).length,1));
 r=await db.query('SELECT count(*)::int n,sum(delta)::int delta FROM app_ledger');check('no duplicate billing',()=>{assert.equal(r.rows[0].n,1);assert.equal(r.rows[0].delta,-6);});
 await seed();await db.query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{status}','\"error\"') WHERE id='parent'");assert.equal(await finish('parent','owner'),false);checks++;assert.equal(await finish('parent','owner',{repairTerminalReceipt:true}),true);s=await state();check('explicit settled terminal receipt repairs without changing default',()=>assert.equal(s.result.status,'succeeded'));
 await seed();await db.query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{status}','\"error\"') WHERE id='parent'");await db.query("UPDATE app_image_jobs SET snapshot=snapshot||jsonb_build_object('imagegenOutputError',$1::text) WHERE id='child'",['生成结果为 29:36（928×1152），与所选 53:79 不一致；原图已保留，实际生成积分已结算，任务未自动重试']);assert.equal(await finish('parent','owner',{repairTerminalReceipt:true}),true);s=await state();check('exact legacy ratio warning retains successful original pixels',()=>assert.equal(s.result.warnings.length,1));
 await seed();await db.query("UPDATE app_image_jobs SET snapshot=snapshot||'{\"imagegenOutputError\":\"透明要求未满足\"}' WHERE id='child'");assert.equal(await finish('parent','owner',{repairTerminalReceipt:true}),false);checks++;
 await seed();await db.query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{status}','\"cancelled\"') WHERE id='parent'");assert.equal(await finish('parent','owner',{repairTerminalReceipt:true}),false);checks++;
 await seed();await finish('parent','owner');await db.query("UPDATE app_creation_records SET status='failed' WHERE id='parent'");const already=JSON.stringify(await state());assert.equal(await finish('parent','owner',{repairTerminalReceipt:true}),true);assert.equal(JSON.stringify(await state()),already);const creation=(await db.query("SELECT status FROM app_creation_records WHERE id='parent'")).rows[0];check('successful parent only repairs stale creation receipt',()=>assert.equal(creation.status,'succeeded'));
 console.log('COMPLETED_PARENT_RECEIPT=PASS CHECKS='+checks+' REAL_PG=1 REAL_PIXEL_DECODE=1 ORIGINAL_UNKNOWN_UNCHANGED=1 NEW_POSTS=0 NEW_CHARGES=0');
 }finally{if(db)await db.end();await admin.query(`DROP SCHEMA ${namespace} CASCADE`);await admin.end();console.log('ISOLATED_SCHEMA_CLEANUP=PASS');}})().catch(e=>{console.error(e);process.exitCode=1;});
