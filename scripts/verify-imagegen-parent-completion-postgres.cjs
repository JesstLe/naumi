/** Isolated real PostgreSQL acceptance of the real parent-notification query/CAS. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript'),{Pool}=require('pg');
const root=process.argv.includes('--source-root')?path.resolve(process.argv[process.argv.indexOf('--source-root')+1]):process.cwd();
const connectionString=process.env.DATABASE_URL||'';
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(connectionString).hostname,'127.0.0.1');
const namespace='parent_completion_'+crypto.randomUUID().replaceAll('-','');let sql,checks=0;
const admin=new Pool({connectionString,max:1,ssl:false}),kicks=[],queries=[];
const check=(v,label)=>{assert.ok(v,label);checks++;};
const rel='src/lib/imagegen/dispatch.ts',source=fs.readFileSync(path.join(root,rel),'utf8');
const unused=['./inputs','./postprocess','../canvas-image-input','../canvas-local-image-edit','./plan','./quotes','./adapters','./generation-core','./schema','./cancel','./input-assets','./mask','./output-advisory','./receipt-policy','../image-job-review','./stored-delivery','../saas/creation-context','./creation-scope'];
const exportsObject={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,console,Buffer,process:{env:{}},require(id){
 if(id==='server-only')return{};
 if(id==='@/lib/image-jobs/runtime')return{DurableImageJobs:class{async kick(id){kicks.push(id);}}};
 if(id==='@/platform/db/pool')return{dbEnabled:true,getPool:()=>({async query(q,p){queries.push(q);return sql.query(q,p);}})};
 if(id==='@/lib/artworks/repository'||id==='@/lib/artworks/writer'||id==='@/lib/saas/creation-scope'||id==='./delivery-billing')return {};
 if(unused.includes(id))return{};
 throw Error('UNMOCKED_MODULE '+id);
}});
(async()=>{try{
 await admin.query(`CREATE SCHEMA ${namespace}`);
 sql=new Pool({connectionString,max:2,ssl:false,options:`-c search_path=${namespace}`});
 await sql.query(`CREATE TABLE app_image_jobs(id text PRIMARY KEY,email text,kind text,snapshot jsonb,payload jsonb,lease_token text,lease_until timestamptz)`);
 const parent='imagegen-parent-fixture',child='job-child-fixture',owner='fixture@example.test';
 const original={status:'pending',children:{generate:{state:'submitted',jobId:child}}};
 async function seed({parentStatus='pending',childStatus='done',parentOwner=owner,childOwner=owner,parentLease=null,childLease=null,children=original.children,steps=[{key:'generate',operation:'edit'}]}={}){
  kicks.length=0;await sql.query('TRUNCATE app_image_jobs');
  await sql.query(`INSERT INTO app_image_jobs VALUES($1,$2,'imagegen',$3::jsonb,$4::jsonb,$5,now()+interval '10 seconds'),($6,$7,'generate',$8::jsonb,'{}'::jsonb,$9,NULL)`,[parent,parentOwner,JSON.stringify({status:parentStatus,children}),JSON.stringify({plan:{steps}}),parentLease,child,childOwner,JSON.stringify({status:childStatus,images:[{id:'art-original'}]}),childLease]);
 }
 const notify=exportsObject.notifyImagegenJobReleased;assert.equal(typeof notify,'function','actual exported notify');
 await seed();await notify(child,'generate');check(kicks.join()===parent,'exact done child wakes original parent');
 let row=(await sql.query('SELECT * FROM app_image_jobs WHERE id=$1',[parent])).rows[0];check(row.lease_until===null,'ten second cooldown cleared');assert.deepEqual(row.snapshot,original,'query leaves parent state for real runner');checks++;
 await seed();await notify(parent,'imagegen');check(kicks.join()===parent,'parent release rechecks same completed child');
 for(const status of ['error','needs_attention']){await seed({childStatus:status});await notify(child,'generate');check(kicks.length===1,'terminal child '+status+' wakes original parent');}
 for(const status of ['pending','running']){await seed({childStatus:status});await notify(child,'generate');check(!kicks.length,'unfinished '+status+' child not notified');}
 for(const status of ['done','error','needs_attention']){await seed({parentStatus:status});await notify(child,'generate');check(!kicks.length,'terminal '+status+' parent not reopened');}
 await seed({parentLease:'live-parent'});await notify(child,'generate');check(!kicks.length,'live parent lease untouched');
 await seed({childLease:'live-child'});await notify(child,'generate');check(!kicks.length,'live child lease untouched');
 await seed({childOwner:'another@example.test'});await notify(child,'generate');check(!kicks.length,'cross owner child rejected');
 await seed({children:{generate:{state:'starting',jobId:child}}});await notify(child,'generate');check(!kicks.length,'unconfirmed starting never resumed');
 await seed({children:{prior:{state:'submitted',jobId:'job-unresolved'},generate:{state:'submitted',jobId:child}},steps:[{key:'prior'},{key:'generate'}]});await notify(child,'generate');check(!kicks.length,'later done sibling cannot skip unresolved frontier');
 await seed({children:{generate:{state:'submitted',jobId:child},later:{state:'starting'}},steps:[{key:'generate'},{key:'later'}]});await notify(child,'generate');check(!kicks.length,'other unknown starting intent suppresses wake');
 await seed();await Promise.all([notify(child,'generate'),notify(parent,'imagegen')]);check(kicks.every(id=>id===parent),'concurrent notifications select only original parent');check(queries.some(q=>/snapshot\s*=\s*\$3::jsonb/.test(q)),'actual snapshot CAS present');
 console.log('IMAGEGEN_PARENT_POSTGRES=PASS CHECKS='+checks+' REAL_POSTGRES=1 HTTP_CALLS=0 SUPPLIER_CALLS=0 SOURCE_SHA256='+crypto.createHash('sha256').update(source).digest('hex'));
 }finally{if(sql)await sql.end();assert.match(namespace,/^parent_completion_[a-f0-9]{32}$/);await admin.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`);await admin.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
