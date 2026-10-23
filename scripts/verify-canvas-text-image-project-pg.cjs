const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {Client}=require('pg');
const path=require('node:path');
const root=path.resolve(process.argv.includes('--baseline')?'output/canvas-general-text-image-20261023/before':'.');
const baseline=process.argv.includes('--baseline');
function fn(file,name){const source=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,source,99,true,3);let body;function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)body=n.getText(ast);ts.forEachChild(n,walk)}walk(ast);assert.ok(body,name);return ts.transpileModule(body.replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;}
async function main(){
 const envText=fs.readFileSync('E:/Workspace/naumi-jimeng-canvas-build-20261023/.env.local','utf8'),match=envText.match(/^DATABASE_URL=(.+)$/m);assert.ok(match);const connectionString=match[1].trim().replace(/^['"]|['"]$/g,'');const url=new URL(connectionString);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'57933');
 const db=new Client({connectionString});await db.connect();let cases=0;
 try{await db.query('BEGIN');await db.query(`CREATE TEMP TABLE app_creation_contexts(actor_email text,context_kind text,context_id text,scope_kind text,tenant_id text,UNIQUE(actor_email,context_kind,context_id));
 CREATE TEMP TABLE app_canvas_text_nodes(id text,email text,project_key text);
 CREATE TEMP TABLE app_canvas_video_nodes(id text,email text,project_key text);
 CREATE TEMP TABLE app_artworks(id text,email text,group_id text,deleted_at timestamptz,batch_id text);
 CREATE TEMP TABLE app_creation_links(target_type text,target_id text,relation text,creation_id text);
 CREATE TEMP TABLE app_creation_records(id text,actor_email text,scope_kind text,tenant_id text);`);
 let scope,policyReads=0;class TeamError extends Error{constructor(m,status){super(m);this.status=status;}}
 const c={dbEnabled:true,currentCreationContext:()=>scope,ensureCreationSchema:async()=>{},getPool:()=>db,TeamError,userFeaturePolicy:async()=>({}),enterpriseCreationRead:async(_e,_t,work)=>{policyReads++;return work(db,{team:{id:_t},entitlement:{featurePolicy:{}}})},assertCreationFeature:()=>{}};vm.createContext(c);vm.runInContext(fn('src/lib/saas/creation-context.ts','bindActualCreationProject'),c);
 const personal=()=>({actorEmail:'a@test.invalid',scopeKind:'personal',tenantId:null,workspaceExplicit:true,parentContext:'tree:text-a'});
 await db.query("INSERT INTO app_canvas_text_nodes VALUES('text-a','a@test.invalid','tree:text-a'),('text-b','b@test.invalid','tree:text-b')");
 scope=personal();await c.bindActualCreationProject('a@test.invalid','tree:text-a');
 if(baseline){assert.equal(scope.parentContext,undefined);assert.equal((await db.query('SELECT * FROM app_creation_contexts')).rowCount,0);console.log('TEXT_IMAGE_PG_BASELINE=REPRODUCED OWNED_TEXT_PARENT_DROPPED=1 SUPPLIER_CALLS=0');return;}
 assert.equal(scope.parentContext,'tree:text-a');assert.equal((await db.query('SELECT * FROM app_creation_contexts')).rowCount,1);cases++;
 const wrapper=fs.readFileSync(path.join(root,'src/lib/saas/creation-context.ts'),'utf8');
 assert.match(wrapper,/bindActualCreationProject\(email,body\.projectKey,\{receipt:options\.receipt\}\)/);cases++;
 const frozen=JSON.parse(JSON.stringify(scope));scope=personal();await c.bindActualCreationProject('a@test.invalid','tree:text-a',{receipt:true});assert.deepEqual(scope,frozen);cases++;
 // Creating a first output cannot change the same-operation receipt scope.
 await db.query("INSERT INTO app_artworks(id,email,group_id,deleted_at) VALUES('art-result','a@test.invalid','text-a',NULL);INSERT INTO app_creation_records VALUES('cr-result','a@test.invalid','personal',NULL);INSERT INTO app_creation_links VALUES('artwork','art-result','output','cr-result')");
 scope=personal();await c.bindActualCreationProject('a@test.invalid','tree:text-a',{receipt:true});assert.equal(scope.parentContext,frozen.parentContext);assert.equal(scope.scopeKind,frozen.scopeKind);cases++;
 scope=personal();await assert.rejects(c.bindActualCreationProject('a@test.invalid','tree:text-b'),e=>e.status===404);cases++;
 await db.query("INSERT INTO app_canvas_text_nodes VALUES('text-legacy','a@test.invalid','tree:text-legacy')");scope=personal();scope.parentContext='tree:text-legacy';await c.bindActualCreationProject('a@test.invalid','tree:text-legacy',{receipt:true});assert.equal(scope.parentContext,undefined);assert.equal((await db.query("SELECT 1 FROM app_creation_contexts WHERE context_id='tree:text-legacy'")).rowCount,0);cases++;
 scope={...personal(),scopeKind:'tenant',tenantId:'tenant-1',parentContext:'tree:text-legacy'};await assert.rejects(c.bindActualCreationProject('a@test.invalid','tree:text-legacy'),e=>e.status===409);cases++;
 scope={...personal(),scopeKind:'tenant',tenantId:'tenant-1'};await assert.rejects(c.bindActualCreationProject('a@test.invalid','tree:text-a'),e=>e.status===409);cases++;
 console.log(`TEXT_IMAGE_PG=PASS CASES=${cases} REAL_SQL=1 TEMP_TABLES=1 SUPPLIER_CALLS=0`);
 }finally{await db.query('ROLLBACK');await db.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
