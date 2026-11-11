// Real built Next app and isolated local Postgres; no provider or production access.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {Pool}=require('pg'),{build}=require('esbuild'),sharp=require('sharp');
const root=process.cwd(),out=path.resolve(process.env.EVIDENCE_OUT||'output/canvas-tools-app'),schema='canvas_tools_ui_'+crypto.randomUUID().replaceAll('-',''),actor='canvas-tools-ui@fixture.test';
process.env.NODE_PATH=path.join(root,'node_modules');require('node:module').Module._initPaths();
let app,bootstrap,api,admin;
async function main(){
 fs.mkdirSync(out,{recursive:true});
 Object.assign(process.env,{DATABASE_URL:'postgresql://comfy_fixture@127.0.0.1:55471/postgres',PGOPTIONS:'-c search_path='+schema,NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'canvas-tools-isolated-settings-20261111',OPENAI_API_KEY:'fixture-no-external-provider',OPENAI_BASE_URL:'http://127.0.0.1:31874/no-provider',STORAGE_DRIVER:'local',MEDIA_DIR:path.join(out,'media'),MEDIA_PRIVATE:'0',NAUMI_APPLICATION_TASK_EXECUTION:'worker',VIDEO_WORKER_SECRET:'canvas-tools-test-worker-secret-20261111',NEXT_TELEMETRY_DISABLED:'1'});
 admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});await admin.query('CREATE SCHEMA '+schema);
 const bundle=path.join(out,'seed.cjs');await build({stdin:{contents:'export * as db from "./src/lib/db";export * as auth from "./src/lib/native-auth";',resolveDir:root,loader:'ts'},outfile:bundle,bundle:true,platform:'node',format:'cjs',external:['pg','sharp'],alias:{'server-only':path.join(root,'scripts/fleet-server-only.cjs')},tsconfig:path.join(root,'tsconfig.json')});
 api=require(bundle);await api.db.ensureSchema();await api.db.getOrCreateUser(actor,'Canvas tools QA');
 fs.mkdirSync(process.env.MEDIA_DIR,{recursive:true});const img=await sharp({create:{width:256,height:256,channels:4,background:'#b7d9cb'}}).png().toBuffer();fs.writeFileSync(path.join(process.env.MEDIA_DIR,'fixture.png'),img);
 await api.db.addArtworks(actor,['fixture-root','fixture-child'].map((id,i)=>({id,title:i?'第二张图片':'多选与保存验证',image:'/media/fixture.png',category:'main',status:'completed',prompt:'fixture',gradient:'',source:'canvas-add',origin:'canvas',parentId:i?'fixture-root':null,parentIds:i?['fixture-root']:[],width:256,height:256,canvasX:100+i*380,canvasY:100,canvasWidth:260,canvasHeight:260,ratio:'1:1',resolution:'1K'})));
 const now=new Date().toISOString();await api.db.upsertCanvasTextNode(actor,{id:'text-fixture',projectKey:'tree:fixture-root',title:'保存恢复验证',prompt:'',content:'initial',status:'completed',error:'',canvasX:150,canvasY:500,width:380,height:240,sourceIds:[],targetIds:[],productIds:[],createdAt:now,updatedAt:now});
 fs.writeFileSync(path.join(out,'FIXTURE.json'),JSON.stringify({schema,actor,base:'http://127.0.0.1:31874'},null,2));
 const log=fs.createWriteStream(path.join(out,'SERVER.log'));app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','31874'],{cwd:root,env:{...process.env},windowsHide:true,stdio:['ignore','pipe','pipe']});app.stdout.pipe(log);app.stderr.pipe(log);
 bootstrap=http.createServer(async(req,res)=>{if(req.url==='/session'){res.setHeader('set-cookie','nv_user='+api.auth.signUserSession(actor,Date.now())+'; Path=/; HttpOnly; SameSite=Lax');res.writeHead(302,{location:'http://127.0.0.1:31874/canvas'});return res.end();}if(req.url==='/state'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({texts:await api.db.listCanvasTextNodes(actor)}));}if(req.url==='/stop'){res.end('STOPPING');return setTimeout(()=>void stop(),50);}res.writeHead(404);res.end();});await new Promise(r=>bootstrap.listen(31875,'127.0.0.1',r));console.log('UI_FIXTURE=http://127.0.0.1:31875/session');
}
async function stop(){if(app&&app.exitCode===null){app.kill();await new Promise(r=>app.once('exit',r));}await api?.db.getPool().end();await admin?.end();await new Promise(r=>bootstrap.close(r));console.log('UI_FIXTURE_STOPPED=PASS');}
main().catch(e=>{console.error(e);process.exitCode=1;});
