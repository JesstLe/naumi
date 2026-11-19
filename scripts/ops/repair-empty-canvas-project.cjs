/** Targeted, evidence-bound repair of an owned empty legacy canvas registry.
 * Run only under the target host's three deployment locks. No DDL or media writes.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require('pg');
const [mode,root]=process.argv.slice(2);
assert(['PLAN','APPLY','VERIFY','ROLLBACK'].includes(mode));
assert(/^\/tmp\/repair-empty-canvas-[a-z0-9-]+$/.test(root));
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
function save(name,value){const p=path.join(root,name),fd=fs.openSync(p,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
const tag=email=>crypto.createHash('sha256').update(email).digest('hex').slice(0,12);
async function run(){
 const spec=read('SPEC.json');assert.equal(spec.target,'47.105.59.142');assert(/^tree:art-[0-9]+-[0-9]+$/.test(spec.projectKey));
 const id=spec.projectKey.slice(5);const c=new Client({connectionString:process.env.DATABASE_URL,ssl:false,application_name:'repair-empty-canvas-project',connectionTimeoutMillis:5000});
 await c.connect();let committed=false;
 try{
  await c.query(mode==='PLAN'||mode==='VERIFY'?'BEGIN READ ONLY':'BEGIN');
  await c.query("SET LOCAL statement_timeout='7s';SET LOCAL lock_timeout='2s'");
  const original=(await c.query('SELECT * FROM app_artworks WHERE id=$1',[id])).rows[0];assert(original,'ROOT_NOT_FOUND');assert.equal(tag(original.email),spec.actorTag);
  if(mode==='APPLY'||mode==='ROLLBACK'){
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[original.email]);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['video-node-graph:'+original.email]);
  }
  const rootRow=(await c.query('SELECT * FROM app_artworks WHERE id=$1 AND email=$2'+(mode==='APPLY'||mode==='ROLLBACK'?' FOR UPDATE':''),[id,original.email])).rows[0];
  assert(rootRow.deleted_at,'ROOT_NO_LONGER_DELETED');assert.equal(rootRow.deleted_at.toISOString(),spec.expectedDeletedAt);assert.equal(rootRow.group_id,id);assert(!rootRow.batch_id&&!rootRow.parent_id,'ONLY_INDEPENDENT_TREE_ROOT');
  const context=(await c.query("SELECT * FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='project' AND context_id=$2",[original.email,spec.projectKey])).rows[0];
  assert(context&&['personal','tenant'].includes(context.scope_kind),'ORIGINAL_SERVER_SCOPE_REQUIRED');assert.equal(context.scope_kind==='personal',context.tenant_id===null);
  const row=(await c.query('SELECT * FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2',[original.email,spec.projectKey])).rows[0]||null;
  assert(!row?.deleted_at,'EXPLICIT_PROJECT_DELETION_MUST_NOT_BE_REVIVED');
  const other=(await c.query('SELECT 1 FROM app_artworks WHERE email<>$1 AND (id=$2 OR group_id=$2) UNION ALL SELECT 1 FROM app_canvas_video_projects WHERE email<>$1 AND project_key=$3 LIMIT 1',[original.email,id,spec.projectKey])).rowCount;
  assert.equal(other,0,'OTHER_OWNER_CONFLICT');
  const live=(await c.query(`SELECT 1 FROM app_artworks WHERE email=$1 AND deleted_at IS NULL AND (id=$2 OR group_id=$2)
   UNION ALL SELECT 1 FROM app_canvas_text_nodes WHERE email=$1 AND project_key=$3
   UNION ALL SELECT 1 FROM app_canvas_video_nodes WHERE email=$1 AND project_key=$3 AND deleted_at IS NULL
   UNION ALL SELECT 1 FROM app_canvas_director_nodes WHERE email=$1 AND project_key=$3 AND deleted_at IS NULL
   UNION ALL SELECT 1 FROM app_canvas_character_nodes WHERE email=$1 AND project_key=$3 AND deleted_at IS NULL
   UNION ALL SELECT 1 FROM app_canvas_scene_nodes WHERE email=$1 AND project_key=$3 AND deleted_at IS NULL
   UNION ALL SELECT 1 FROM app_canvas_audio_nodes WHERE email=$1 AND project_key=$3 AND deleted_at IS NULL
   UNION ALL SELECT 1 FROM app_canvas_timeline_nodes WHERE email=$1 AND project_key=$3 AND deleted_at IS NULL
   UNION ALL SELECT 1 FROM app_canvas_comfy_nodes WHERE email=$1 AND project_key=$3 AND deleted_at IS NULL LIMIT 1`,[original.email,id,spec.projectKey])).rowCount;
  if(mode!=='VERIFY')assert.equal(live,0,'CANVAS_NO_LONGER_EMPTY');
  const state=JSON.parse(JSON.stringify({root:rootRow,context,registry:row}));
  if(mode==='PLAN'){
   assert.equal(row,null,'REGISTRY_ALREADY_PRESENT');save('PLAN.json',{operationId:spec.operationId,state,registryAfter:{email:original.email,project_key:spec.projectKey,created_at:rootRow.created_at.toISOString(),deleted_at:null}});
  }else{
   const plan=read('PLAN.json');assert.equal(plan.operationId,spec.operationId);assert.deepEqual(state.root,plan.state.root);assert.deepEqual(state.context,plan.state.context);
   if(mode==='APPLY'){
    assert(!fs.existsSync(path.join(root,'APPLY_REQUEST.json')),'REQUEST_EXISTS_VERIFY_ORIGINAL_OUTCOME');assert.equal(row,null);
    save('APPLY_REQUEST.json',{operationId:plan.operationId,expected:plan.state,at:new Date().toISOString()});
    const inserted=await c.query('INSERT INTO app_canvas_video_projects(email,project_key,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *',[original.email,spec.projectKey,plan.registryAfter.created_at]);
    assert.equal(inserted.rowCount,1);assert.deepEqual(JSON.parse(JSON.stringify(inserted.rows[0])),plan.registryAfter);
   }else{
    assert.deepEqual(state.registry,plan.registryAfter,'OWN_REGISTRY_CHANGED');
    if(mode==='ROLLBACK'){
     assert(!fs.existsSync(path.join(root,'ROLLBACK_REQUEST.json')),'ROLLBACK_ALREADY_REQUESTED');save('ROLLBACK_REQUEST.json',{operationId:plan.operationId,expected:plan.registryAfter});
     assert.equal((await c.query('DELETE FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2 AND created_at=$3 AND deleted_at IS NULL',[original.email,spec.projectKey,plan.registryAfter.created_at])).rowCount,1);
    }
   }
  }
  await c.query('COMMIT');committed=true;
  const result={mode,operationId:spec.operationId,actorTag:spec.actorTag,registryInserted:mode==='APPLY'?1:0,registryAuthorized:mode==='VERIFY',deletedArtworkUnchanged:true,scopeUnchanged:true,mediaWrites:0,paidCalls:0};
  save(mode==='VERIFY'?'VERIFY_'+Date.now()+'_RESULT.json':mode+'_RESULT.json',result);console.log(JSON.stringify(result));
 }finally{if(!committed)await c.query('ROLLBACK').catch(()=>{});await c.end()}
}
run().catch(e=>{console.error('EMPTY_CANVAS_REPAIR_HOLD',e.code||e.name,e.message);process.exitCode=1});
