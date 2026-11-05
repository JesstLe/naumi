// Complete production video text readers/script owner; SQL/auth/worker/supplier
// ports are explicit local fixtures. This is not a PostgreSQL or live E2E claim.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),ts=require('typescript'),{z}=require('zod');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const root=path.resolve(arg('--source-root',path.join(__dirname,'..'))),out=path.resolve(arg('--out',process.env.MAIN_TEXT_SERVER_EVIDENCE||'output/main-text-server-owners'));
fs.mkdirSync(out,{recursive:true});const loaded={},cache=new Map(),checks=[];
const state={row:{content:'',prompt:'旧AI写作要求不可作为正文',status:'completed'},frozen:undefined,queries:[],transactions:[],authorized:[],released:0,inserts:0};
class ModelConfigError extends Error{constructor(code,message,status){super(message);Object.assign(this,{code,status});}}
class VideoContractError extends Error{constructor(code,message){super(message);this.code=code;this.status=422;}}
const forbidden=name=>()=>{throw Error('Unexpected boundary '+name)};
const pool={query:async(sql,values)=>{state.queries.push({sql,values});assert.equal(values[0],'actor@fixture.test');assert.match(sql,/WHERE email=\$1 AND id=\$2/);return {rows:state.row?[state.row]:[]};},connect:async()=>({
 query:async(sql,values)=>{
  state.transactions.push({sql,values});if(/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)||sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.includes('FROM app_video_script_operations'))return {rows:[]};
  if(sql.startsWith('SELECT content,prompt,status')){assert.match(sql,/email=\$1 AND id=\$2 AND project_key=\$3 FOR SHARE/);assert.deepEqual(values,['actor@fixture.test','text-source','tree:fixture']);return {rows:state.row?[state.row]:[]};}
  if(sql.includes('UNION ALL'))return {rows:[]};
  if(sql.startsWith('INSERT INTO app_canvas_text_nodes')){state.inserts++;return {rows:[{id:values[0],project_key:values[2],title:values[3],content:values[4],status:'completed',canvas_x:values[5],canvas_y:values[6],canvas_width:400,canvas_height:240}]};}
  if(sql.startsWith('INSERT INTO app_video_script_operations'))return {rows:[]};
  throw Error('Unexpected SQL '+sql);
 },release(){state.released++;}
})};
const boundaries={
 'src/platform/db/pool.ts':{getPool:()=>pool},
 'src/lib/video/storage-schema.ts':{ensureVideoScriptSchema:async()=>{}},
 'src/lib/canvas/project-access.ts':{authorizeVideoProject:async(actor,project)=>{assert.equal(actor,'actor@fixture.test');assert.equal(project,'tree:fixture');state.authorized.push({actor,project});}},
 'src/lib/canvas/video-node-schema.ts':{videoNodeIdSchema:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/)},
 'src/lib/canvas/project-key.ts':{videoProjectKeySchema:z.string().regex(/^(?:tree|batch):[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/)},
 'src/lib/model-config/types.ts':{ModelConfigError},
 'src/lib/request-auth.ts':{authenticatedEmail:async()=> 'actor@fixture.test'},
 'src/lib/persistence/schema.ts':{ensureSchema:async()=>{}},
 'src/lib/video/contract.ts':{VideoContractError},
 'src/lib/canvas/image-size.ts':{adaptiveCanvasImageSize:()=>({width:320,height:240})},
 'src/lib/video/workflow-text-context.ts':{frozenWorkflowText:(actor,id)=>{assert.equal(actor,'actor@fixture.test');assert.equal(id,'text:text-source');return state.frozen;}},
};
const actual=new Set(['src/lib/video/submission.ts','src/lib/video/script-assets.ts','src/lib/canvas/text-content.ts','src/app/api/video/texts/route.ts']);
function load(rel){
 if(boundaries[rel])return boundaries[rel];if(cache.has(rel))return cache.get(rel).exports;
 if(!actual.has(rel))return new Proxy({}, {get:(_target,key)=>forbidden(rel+':'+String(key))});
 const file=path.join(root,rel),bytes=fs.readFileSync(file);loaded[rel]={sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};const mod={exports:{}};cache.set(rel,mod);
 const result=ts.transpileModule(bytes.toString('utf8'),{fileName:rel,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}});assert.equal((result.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
 function req(id){if(id==='server-only')return {};if(id==='next/server')return {NextResponse:{json:(body,options)=>Response.json(body,options)}};if(id==='zod')return {z};if(id.startsWith('node:'))return require(id);const base=id.startsWith('@/')?'src/'+id.slice(2):id.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(rel),id)):null;if(!base)return require(id);return load(base+'.ts');}
 vm.runInThisContext('(function(require,module,exports){'+result.outputText+'\n})',{filename:file})(req,mod,mod.exports);return mod.exports;
}
const pass=name=>{checks.push(name);console.log('CHECK='+name)};
function reset(row){state.row=row;state.transactions=[];state.inserts=0;state.released=0;state.authorized=[];}
(async()=>{
 const submission=load('src/lib/video/submission.ts'),scripts=load('src/lib/video/script-assets.ts');
 const textsRoute=load('src/app/api/video/texts/route.ts');
 let value=await submission.requireOwnedVideoText('actor@fixture.test','text:text-source');
 if(value!=='')console.error('MAIN_TEXT_SERVER_OWNERS=REPRODUCED COMPLETED_EMPTY_ACTUAL='+JSON.stringify(value)+' EXPECTED=""');
 assert.equal(value,'','completed empty source must not return the former AI instruction');pass('COMPLETED_EMPTY_VIDEO_REFERENCE_NEVER_RETURNS_OLD_INSTRUCTION');
 for(const status of ['failed','completed']){state.row={content:'',prompt:'旧要求',status};assert.equal(await submission.requireOwnedVideoText('actor@fixture.test','text:text-source'),'');}pass('FAILED_AND_COMPLETED_CLEAR_RETAIN_EMPTY');
 state.row={content:'手写正文\n逐字保留',prompt:'旧要求',status:'completed'};assert.equal(await submission.requireOwnedVideoText('actor@fixture.test','text:text-source'),state.row.content);pass('EXISTING_CONTENT_EXACT');
 state.row={content:'',prompt:'历史未编辑正文',status:'idle'};assert.equal(await submission.requireOwnedVideoText('actor@fixture.test','text:text-source'),'历史未编辑正文');pass('LEGACY_IDLE_PROMPT_ONLY_COMPATIBILITY');
 for(const status of ['generating','processing','queued']){state.row={content:'尚未完成',prompt:'旧要求',status};await assert.rejects(submission.requireOwnedVideoText('actor@fixture.test','text:text-source'),e=>e.code==='TEXT_DEPENDENCY_PENDING');}pass('ALL_PENDING_VIDEO_TEXT_STATES_REJECT');
 state.row={id:'text-source',project_key:'tree:fixture',title:'正文',content:'',prompt:'旧AI要求',status:'completed'};
 let response=await textsRoute.GET(new Request('http://fixture.local/api/video/texts?id=text-source&projectKey=tree:fixture'));
 assert.equal(response.status,200);assert.equal((await response.json()).node.content,'');pass('VIDEO_TEXT_HTTP_COMPLETED_EMPTY_RESPONSE_RETAINS_EMPTY');
 state.row=null;await assert.rejects(submission.requireOwnedVideoText('actor@fixture.test','text:text-source'),e=>e.code==='TEXT_REFERENCE_UNAVAILABLE');pass('MISSING_OWNER_TEXT_REJECTS');
 const queryCount=state.queries.length;state.frozen='';assert.equal(await submission.requireOwnedVideoText('actor@fixture.test','text:text-source'),'');assert.equal(state.queries.length,queryCount);state.frozen='原冻结文稿';assert.equal(await submission.requireOwnedVideoText('actor@fixture.test','text:text-source'),'原冻结文稿');assert.equal(state.queries.length,queryCount);state.frozen=undefined;pass('FROZEN_EMPTY_AND_BODY_BYPASS_LATER_DB_READ');
 const input={operationId:'00000000-0000-4000-8000-000000000001',projectKey:'tree:fixture',title:'片段',sourceNodeId:'text-source',start:0,end:1};
 reset({content:'',prompt:'旧AI要求',status:'completed'});await assert.rejects(scripts.saveVideoScriptAsset('ACTOR@FIXTURE.TEST',input),e=>e.code==='VIDEO_SCRIPT_RANGE_INVALID');assert.equal(state.inserts,0);assert.equal(state.transactions.at(-1).sql,'ROLLBACK');assert.equal(state.released,1);pass('SCRIPT_EMPTY_SOURCE_SLICE_REJECTS_BEFORE_WRITE_AND_ROLLS_BACK');
 reset({content:'甲🥢乙',prompt:'旧AI要求',status:'completed'});let result=await scripts.saveVideoScriptAsset('ACTOR@FIXTURE.TEST',{...input,start:1,end:3});assert.equal(result.node.content,'🥢');assert.equal(result.source.sha256,crypto.createHash('sha256').update('甲🥢乙').digest('hex'));assert.equal(state.transactions.at(-1).sql,'COMMIT');assert.equal(state.inserts,1);assert.equal(state.released,1);pass('SCRIPT_CONTIGUOUS_ACTUAL_BODY_HASH_AND_TRANSACTION');
 reset({content:'甲🥢乙',prompt:'旧AI要求',status:'completed'});await assert.rejects(scripts.saveVideoScriptAsset('ACTOR@FIXTURE.TEST',{...input,start:1,end:2}),e=>e.code==='VIDEO_SCRIPT_RANGE_INVALID');assert.equal(state.inserts,0);pass('SURROGATE_BOUNDARY_GUARD_RETAINED');
 reset({content:'最新正文',prompt:'旧要求',status:'completed'});await assert.rejects(scripts.saveVideoScriptAsset('ACTOR@FIXTURE.TEST',{...input,expectedSourceSha256:'a'.repeat(64)}),e=>e.code==='VIDEO_SCRIPT_SOURCE_CHANGED');assert.equal(state.inserts,0);pass('ORIGINAL_SOURCE_HASH_COMPARE_RETAINED');
 assert.equal(state.authorized.length,1);assert.equal(state.transactions.filter(x=>x.sql.includes('pg_advisory_xact_lock')).length,2);pass('ACTOR_PROJECT_AUTH_AND_ORIGINAL_TRANSACTION_LOCKS_RETAINED');
 const literal='MAIN_TEXT_SERVER_OWNERS=PASS CHECKS='+checks.length+' ACTUAL_OWNER_MODULES=1 SQL_PORT_FIXTURE=1 REAL_PG=0 FROZEN_IDENTITY=RETAINED SUPPLIER_CALLS=0';
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',root,checks,loaded,literal,sourceScope:'actual requireOwnedVideoText and saveVideoScriptAsset modules; explicit SQL/auth/worker ports, no network or database connection'},null,2)+'\n');console.log(literal);
})().catch(error=>{fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({status:'FAIL',root,checks,loaded,error:error.stack},null,2)+'\n');console.error(error);process.exitCode=1;});
