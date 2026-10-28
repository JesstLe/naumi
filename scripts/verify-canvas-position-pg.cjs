'use strict';
require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const ts=require('typescript'),{Pool}=require('pg'),{NextResponse}=require('next/server');
const root=process.cwd(),sourceRoot=path.resolve(process.env.CANVAS_SOURCE_ROOT||root),out=path.resolve(process.env.CANVAS_TEST_OUT||'output/canvas-position-pg');
const name='naumi-canvas-placement-'+crypto.randomBytes(5).toString('hex'),password=crypto.randomUUID(),db='naumi_canvas_placement_fixture';
const reports=[];let container,pool;
function command(args){return cp.execFileSync('docker',args,{encoding:'utf8',timeout:30000}).trim();}
function declaration(file,name){const source=fs.readFileSync(path.join(sourceRoot,file),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);let found;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n.getText(ast).replace(/^export\s+/,'');ts.forEachChild(n,visit);}visit(ast);assert.ok(found,name);return found;}
async function check(name,run){try{await run();reports.push({name,pass:true});console.log('PASS '+name);}catch(e){reports.push({name,pass:false,error:e.message});console.error('FAIL '+name+': '+e.message);}}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 try{
  container=command(['run','-d','--name',name,'--label','naumi.fixture=canvas-result-placement','--memory','256m','--cpus','1','--tmpfs','/var/lib/postgresql/data:rw,size=128m','-e','POSTGRES_PASSWORD='+password,'-e','POSTGRES_DB='+db,'-p','127.0.0.1::5432','postgres:16-alpine']);
  const inspect=JSON.parse(command(['inspect',container]))[0];assert.equal(inspect.Config.Labels['naumi.fixture'],'canvas-result-placement');
  const binding=inspect.NetworkSettings.Ports['5432/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');
  pool=new Pool({host:'127.0.0.1',port:Number(binding.HostPort),user:'postgres',password,database:db,max:5,connectionTimeoutMillis:2000,statement_timeout:5000});
  let ready=false;for(let i=0;i<30;i++){try{await pool.query('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}assert.ok(ready,'isolated PostgreSQL readiness');
  await pool.query('CREATE TABLE app_artworks(id text PRIMARY KEY,email text NOT NULL,canvas_x double precision,canvas_y double precision)');
  const context={console,Response,Request,NextResponse,dbEnabled:true,ensureSchema:async()=>{},getPool:()=>pool,authenticatedEmail:async req=>req.headers.get('x-fixture-owner'),require:Module.createRequire(path.join(root,'src/lib/db.ts'))};
  vm.createContext(context);
  const source=declaration('src/lib/db.ts','setArtworkPosition')+'\n'+declaration('src/app/api/artworks/position/route.ts','POST');
  vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  const seed=async(id,x=null,y=null)=>pool.query('INSERT INTO app_artworks VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET canvas_x=$3,canvas_y=$4',[id,'owner@example.test',x,y]);
  const point=async id=>{const r=(await pool.query('SELECT canvas_x x,canvas_y y FROM app_artworks WHERE id=$1',[id])).rows[0];return r&&[r.x,r.y];};
  const post=(body,owner='owner@example.test')=>context.POST(new Request('http://fixture/api/artworks/position',{method:'POST',headers:{'content-type':'application/json',...(owner?{'x-fixture-owner':owner}:{})},body:JSON.stringify(body)}));
  await check('initialize_empty_result',async()=>{await seed('new');assert.equal((await post({id:'new',x:500,y:200,mode:'initialize'})).status,200);assert.deepEqual(await point('new'),[500,200]);});
  await check('replayed_result_keeps_original_position',async()=>{await seed('old',10,20);assert.equal((await post({id:'old',x:950,y:200,mode:'initialize'})).status,200);assert.deepEqual(await point('old'),[10,20]);});
  await check('manual_move_remains_supported',async()=>{await seed('drag',10,20);assert.equal((await post({id:'drag',x:90,y:80})).status,200);assert.deepEqual(await point('drag'),[90,80]);assert.equal((await post({id:'drag',x:30,y:40,mode:'move'})).status,200);assert.deepEqual(await point('drag'),[30,40]);});
  await check('late_initialization_cannot_overwrite_manual_drag',async()=>{
   await seed('race');const client=await pool.connect();let request,settled=false;
   try{await client.query('BEGIN');await client.query('UPDATE app_artworks SET canvas_x=800,canvas_y=700 WHERE id=$1',['race']);request=post({id:'race',x:100,y:200,mode:'initialize'}).then(r=>{settled=true;return r;});await new Promise(r=>setTimeout(r,80));assert.equal(settled,false,'real row lock blocks concurrent initializer');await client.query('COMMIT');assert.equal((await request).status,200);assert.deepEqual(await point('race'),[800,700]);}
   finally{await client.query('ROLLBACK').catch(()=>{});client.release();if(request)await request;}
  });
  await check('concurrent_initializers_keep_first_committed_position',async()=>{
   await seed('first');await post({id:'first',x:11,y:22,mode:'initialize'});
   const responses=await Promise.all(Array.from({length:12},(_,i)=>post({id:'first',x:100+i,y:200+i,mode:'initialize'})));assert.ok(responses.every(r=>r.status===200));assert.deepEqual(await point('first'),[11,22]);
  });
  await check('owner_authentication_not_body_email',async()=>{await seed('owned',1,2);assert.equal((await post({id:'owned',email:'owner@example.test',x:9,y:8,mode:'initialize'},'other@example.test')).status,404);assert.deepEqual(await point('owned'),[1,2]);assert.equal((await post({id:'owned',x:9,y:8},null)).status,401);});
  await check('missing_artwork_and_invalid_input',async()=>{assert.equal((await post({id:'missing',x:1,y:2,mode:'initialize'})).status,404);assert.equal((await post({id:'new',x:'NaN',y:2})).status,400);assert.equal((await post({id:'new',x:1,y:2,mode:'invalid'})).status,400);});
  await check('legacy_function_signature_keeps_manual_move',async()=>{await seed('legacy',1,2);assert.equal(await context.setArtworkPosition('OWNER@EXAMPLE.TEST','legacy',7,8),true);assert.deepEqual(await point('legacy'),[7,8]);});
 }finally{
  if(pool)await pool.end();
  if(container){const row=JSON.parse(command(['inspect',container]))[0];assert.equal(row.Id,container);assert.equal(row.Config.Labels['naumi.fixture'],'canvas-result-placement');command(['rm','-f',container]);}
 }
 const failed=reports.filter(r=>!r.pass).length,report={sourceRoot,passed:reports.length-failed,failed,reports,supplierCalls:0,fixtureRemoved:true,evidenceTier:'actual position Route and compatibility owner functions against isolated PostgreSQL; authentication is a fixture identity, not production auth acceptance'};
 fs.writeFileSync(path.join(out,'POSITION_PG.json'),JSON.stringify(report,null,2)+'\n');console.log(`POSITION_PG=${failed?'FAIL':'PASS'} CASES=${reports.length} FAILED=${failed} FIXTURE_REMOVED=1`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
