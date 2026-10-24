/** Real isolated PostgreSQL SQL acceptance proof. Supplier/HTTP calls = 0. */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript'),{Pool}=require('pg');
const sourceRoot=process.argv.includes('--source-root')?path.resolve(process.argv[process.argv.indexOf('--source-root')+1]):process.cwd();
const database=process.env.DATABASE_URL||'';
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(database).hostname,'127.0.0.1');
const namespace='image_recovery_'+crypto.randomUUID().replaceAll('-','');
const admin=new Pool({connectionString:database,ssl:false,max:1});let pool,checks=0;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function check(value,label){assert.ok(value,label);checks++;}
function load(rel,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(sourceRoot,rel),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,Error,Set,console,require(id){if(id==='server-only')return {};if(id in deps)return deps[id];if(id.startsWith('node:'))return require(id);throw Error('unexpected-module '+id);}});return exports;}
(async()=>{try{
 await admin.query(`CREATE SCHEMA ${namespace}`);pool=new Pool({connectionString:database,ssl:false,max:2,options:`-c search_path=${namespace}`});
 await pool.query(`CREATE TABLE app_supplier_calls(id text,operation_id text,public_model_id text,model_version int,billing_unit_id text,provider_id text,model text,account_id text,attempt_id text,task_id text,parameters jsonb,state text);
 CREATE TABLE app_model_channel_operations(operation_key text PRIMARY KEY,upstream_id text);`);
 const policy=load('src/lib/model-config/apimart-image-policy.ts',{zod:require('zod')});
 const gateway=load('src/lib/image-gateway.ts',{'./model-config/apimart-image-policy':policy,'./model-config/context':{currentModelExecution:()=>null},'./model-config/types':{ModelConfigError:class extends Error{}}});
 const availability=load('src/lib/model-config/channel-availability.ts',{'./apimart-image-policy':policy,'./schema':{ensureModelSchema:async()=>{}},'./types':{ModelConfigError:class extends Error{}},'../image-gateway':gateway});
 const target={upstreamId:'fixture-apib',scope:{frozen:{modelVersion:141,publicModelId:'gpt-image-2',modality:'image'},connection:{providerId:'fixture-apib',wireModel:'gpt-image-2.5',protocol:'apimart-images',baseUrl:'https://supplier.invalid/v1',apiKey:'fixture-not-a-secret'},parameterMap:{apimartImages:{schemaVersion:1}}}};
 const scope={...target.scope,supplierRouting:{targets:[target]}};const root='job-fixture',unit=root+':image:0';
 const fixture={id:'call-1',operation_id:root,public_model_id:'gpt-image-2',model_version:141,billing_unit_id:unit,provider_id:'fixture-apib',model:'gpt-image-2.5',
 account_id:hash(target.scope.connection.baseUrl+'\0'+target.scope.connection.apiKey),attempt_id:hash(JSON.stringify(['apimart-images-v1',141,'gpt-image-2','fixture-apib','gpt-image-2.5',unit])),task_id:'task_fixture_accepted',parameters:{requestHash:'fixture-fixed'},state:'completed'};
 const keys=Object.keys(fixture);async function insert(row){await pool.query(`INSERT INTO app_supplier_calls(${keys.join(',')})VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>row[k]));}
 await insert(fixture);await pool.query('INSERT INTO app_model_channel_operations VALUES($1,$2)',[availability.channelOperationKey(scope,unit),target.upstreamId]);
 const accepted=await availability.acceptedImageOperationIdentities(pool,scope,root,root);
 check(Object.keys(accepted).length===1&&accepted[unit].startsWith('accepted:'),'root resolves exact accepted child');
 check(!accepted[root]&&!accepted[root+':image:1'],'no root alias or unknown sibling proof');
 check(!Object.keys(await availability.acceptedImageOperationIdentities(pool,scope,'another-job',root)).length,'cross root rejected');
 for(const [key,value] of [['model_version',142],['public_model_id','other'],['provider_id','other'],['model','other'],['account_id','other'],['attempt_id','other'],['task_id',null],['parameters',null],['state','pre-submission-failed'],['billing_unit_id',root+':image:00'],['billing_unit_id',root+'x:image:0']]){
  await pool.query('TRUNCATE app_supplier_calls');await insert({...fixture,[key]:value});
  check(!Object.keys(await availability.acceptedImageOperationIdentities(pool,scope,root,root)).length,'mismatch rejected '+key);
 }
 await pool.query('TRUNCATE app_supplier_calls');await insert(fixture);await insert({...fixture,id:'duplicate'});
 let duplicate;try{await availability.acceptedImageOperationIdentities(pool,scope,root,root);}catch(e){duplicate=e;}
 check(duplicate instanceof gateway.ImageOperationPending,'duplicate frozen unit stays pending');
 await pool.query('TRUNCATE app_supplier_calls');await insert(fixture);
 let blocked;await gateway.withImageOperation('fixture',{id:unit},()=>availability.withAcceptedImageRead(unit,async()=>{try{await availability.guardChannelSubmission(pool,scope);}catch(e){blocked=e;}}));
 check(blocked instanceof gateway.ImageOperationPending,'proved task cannot authorize new POST');
 console.log(`IMAGE_POSTACCEPT_POSTGRES=PASS CHECKS=${checks} REAL_POSTGRES=1 HTTP_CALLS=0 SUPPLIER_CALLS=0`);
 }finally{if(pool)await pool.end();assert.match(namespace,/^image_recovery_[a-f0-9]{32}$/);await admin.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`);await admin.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
