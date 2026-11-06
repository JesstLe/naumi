/** Real PostgreSQL + native-auth route regression for mixed project/input parents.
 * Supplier and external HTTP traffic are disabled. --baseline reproduces the old
 * 409 and exits 1 deliberately; normal mode exercises the repaired boundary. */
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {execFileSync,spawnSync} from "node:child_process";
import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {isAbsolute,join,resolve} from "node:path";

const args=process.argv.slice(2),option=(name:string,fallback:string)=>{const at=args.indexOf(name);return at<0?fallback:args[at+1];};
const sourceRoot=resolve(option("--source-root",process.cwd()));
const baseline=args.includes("--baseline");
const outputRoot=resolve(option("--output-root",join(sourceRoot,"output/image-prompt-project-anchor",baseline?"baseline":"modified")));
assert.ok(isAbsolute(sourceRoot)&&existsSync(join(sourceRoot,"src/lib/canvas/image-prompt-service.ts")),"explicit real source root");
mkdirSync(outputRoot,{recursive:true});
const productRequire=createRequire(join(sourceRoot,"package.json"));
const load=(path:string):any=>productRequire(join(sourceRoot,path));
const sha=(bytes:Buffer|string)=>createHash("sha256").update(bytes).digest("hex");
const sourceFiles=["src/lib/canvas/image-prompt-service.ts","src/lib/canvas/image-prompt-client.ts","src/lib/canvas/image-prompt-repository.ts","src/lib/canvas/parent-link.ts","src/lib/canvas/input-references.ts","src/lib/canvas/image-reference-upload.ts","src/lib/canvas/node-copy.ts","src/app/api/canvas/image-prompts/route.ts"];
const hashes=()=>Object.fromEntries(sourceFiles.map(path=>[path,sha(readFileSync(join(sourceRoot,path)))]));
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function worker(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");
  assert.equal(new URL(process.env.DATABASE_URL||"http://invalid").hostname,"127.0.0.1");
  const db=load("src/lib/db.ts"),native=load("src/lib/native-auth.ts");
  const {closeDatabasePools}=load("src/lib/db/connection.ts");
  const {ensureEnterpriseSchema}=load("src/lib/enterprise/server.ts");
  const {ensureImagePromptSchema}=load("src/lib/canvas/image-prompt-repository.ts");
  const {ensureVideoNodeSchema}=load("src/lib/canvas/storage-schema.ts");
  const route=load("src/app/api/canvas/image-prompts/route.ts");
  const service=load("src/lib/canvas/image-prompt-service.ts");
  const {withFrozenCreation}=load("src/lib/saas/creation-context.ts");
  const beforeHashes=hashes(),evidence:Array<Record<string,unknown>>=[];
  let checks=0,outbound=0;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{outbound++;throw new Error("SUPPLIER_AND_NETWORK_DISABLED");};
  const owner="project-anchor-owner@example.test",other="project-anchor-other@example.test";
  const boss="project-anchor-boss@example.test",foreignBoss="project-anchor-foreign-boss@example.test";
  const tenant=randomUUID(),foreignTenant=randomUUID(),project="tree:anchor-root";
  const record=(name:string,data:Record<string,unknown>={})=>{checks++;evidence.push({name,...data});console.log(`PASS ${checks} ${name} ${JSON.stringify(data)}`);};
  const json=async(response:Response)=>({status:response.status,body:await response.json()});
  const request=(path:string,who=owner,body?:unknown,workspace="personal",projectKey=project)=>new Request("http://anchor.test"+path,{
    method:body===undefined?"GET":"POST",headers:{origin:"http://anchor.test",cookie:`${native.USER_COOKIE}=${native.signUserSession(who,Date.now())}`,"content-type":"application/json","x-naumi-workspace":workspace,"x-naumi-project-context":projectKey},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const read=(id="anchor-root",key=project,who=owner,workspace="personal")=>route.GET(request(`/api/canvas/image-prompts?${new URLSearchParams({nodeId:id,projectKey:key})}`,who,undefined,workspace,key)).then(json);
  const doc=(ids=["anchor-root","anchor-input"],prompt="保留当前文案，参考【图2】的配色")=>({version:1,prompt,bindings:ids.map((id,index)=>({key:`node:${id}`,number:index+1,role:index?"reference":"edit-target"})),activeKeys:ids.map(id=>`node:${id}`),additionalKeys:[],hiddenReferenceIds:[]});
  const write=(document=doc(),options:Record<string,any>={})=>{const {id="anchor-root",key=project,who=owner,workspace="personal",revision=0,operationId=randomUUID()}=options;return route.POST(request("/api/canvas/image-prompts",who,{nodeId:id,projectKey:key,document,expectedRevision:revision,operationId},workspace,key)).then(json);};
  const seedProject=async(key:string,scope="personal",who=owner)=>{
    await db.getPool().query("INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2) ON CONFLICT DO NOTHING",[who,key]);
    await db.getPool().query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'project',$2,$3,$4) ON CONFLICT DO NOTHING",[who,key,scope==="personal"?"personal":"tenant",scope==="personal"?null:scope]);
  };
  const art=async(id:string,options:Record<string,any>={})=>db.addArtworks(options.email||owner,[{id,title:id,category:"image",prompt:"IMMUTABLE_GENERATION_RECIPE",status:"completed",image:"/media/project-anchor/original.png",gradient:"",origin:"canvas",source:"canvas-add",groupId:"anchor-root",...options}]);
  const graphSnapshot=async()=>JSON.stringify((await db.getPool().query("SELECT id,parent_id,parent_ids,group_id,source_url,prompt,image_url FROM app_artworks WHERE email=$1 AND group_id='anchor-root' AND (id IN ('anchor-root','anchor-input') OR id LIKE 'anchor-sibling-%') ORDER BY id",[owner])).rows);
  const saveReport=(outcome:string)=>writeFileSync(join(outputRoot,"RESULT.json"),JSON.stringify({outcome,checks,sourceRoot,baseline,realPostgres:true,actualRoutes:true,nativeAuth:true,outbound,supplierPOST:0,evidence,sourceHashes:beforeHashes},null,2));
  try{
    await ensureEnterpriseSchema();await ensureImagePromptSchema();await ensureVideoNodeSchema();
    for(const email of [owner,other,boss,foreignBoss])await db.getPool().query("INSERT INTO app_users(email,name,renews_at,role) VALUES($1,$1,now()+interval '1 year','user') ON CONFLICT DO NOTHING",[email]);
    for(const [id,who] of [[tenant,boss],[foreignTenant,foreignBoss]]){
      await db.getPool().query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'Isolated project anchor fixture',$2,now()+interval '1 year')",[id,who]);
      await db.getPool().query("INSERT INTO app_enterprise_settings(team_id) VALUES($1)",[id]);
      await db.getPool().query("INSERT INTO app_team_access_grants(email,scope,created_by,updated_by) VALUES($1,'owned','fixture','fixture')",[who]);
    }
    await db.getPool().query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,$3,'permanent')",[tenant,owner,boss]);
    await seedProject(project);
    await art("anchor-root");await art("anchor-input",{parentId:"anchor-root"});
    for(let index=0;index<10;index++)await art(`anchor-sibling-${index}`,{parentId:"anchor-root"});
    await db.getPool().query("UPDATE app_artworks SET parent_id='anchor-input',parent_ids='[\"anchor-input\"]'::jsonb WHERE email=$1 AND id='anchor-root'",[owner]);
    const graphBefore=await graphSnapshot();
    const initial=await read();
    if(baseline){
      assert.equal(initial.status,409,JSON.stringify(initial));assert.equal(initial.body.code,"IMAGE_PROMPT_PROJECT_AMBIGUOUS");
      const failedWrite=await write();assert.equal(failedWrite.status,409);assert.equal(failedWrite.body.code,"IMAGE_PROMPT_PROJECT_AMBIGUOUS");
      assert.equal(await graphSnapshot(),graphBefore);assert.equal(outbound,0);assert.equal(Number((await db.getPool().query("SELECT count(*) n FROM app_canvas_image_prompts")).rows[0].n),0);
      record("anchor-only-reverse-pointer-reproduced",{read:initial,write:failedWrite,physicalNodes:12,explicitInputCycles:0});
      saveReport("REPRODUCED");
      console.log(`IMAGE_PROMPT_PROJECT_ANCHOR=REPRODUCED CHECKS=${checks} REAL_PG=1 ACTUAL_ROUTES=1 SUPPLIER_POST=0 EXIT=1`);
      process.exitCode=1;return;
    }
    assert.equal(initial.status,200,JSON.stringify(initial));assert.equal(initial.body.revision,0);record("anchor-root-original-read",{status:200});
    for(const id of ["anchor-input",...Array.from({length:10},(_,index)=>`anchor-sibling-${index}`)])assert.equal((await read(id)).status,200,id);
    record("all-twelve-project-nodes-readable",{nodes:12});
    const operationId=randomUUID(),first=await write(doc(),{operationId});assert.equal(first.status,200,JSON.stringify(first));assert.equal(first.body.revision,1);record("save-original-node-with-reference",{status:200,revision:1});
    assert.deepEqual((await read()).body.document,doc());record("refresh-reads-complete-saved-draft");
    assert.deepEqual(await write(doc(),{operationId}),first);record("same-operation-replays-exact-receipt");
    assert.equal((await write(doc(undefined,"different body"),{operationId})).status,409);record("operation-id-body-conflict-rejected");
    assert.equal((await write(doc())).status,409);record("stale-revision-rejected");
    const concurrent=await Promise.all([write(doc(undefined,"parallel A"),{revision:1}),write(doc(undefined,"parallel B"),{revision:1})]);
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);record("concurrent-revision-CAS",{statuses:concurrent.map(r=>r.status)});
    assert.equal(await graphSnapshot(),graphBefore);record("read-and-save-preserve-images-history-and-connections");

    const tx=await db.getPool().connect();
    try{await tx.query("BEGIN");const authorized=await withFrozenCreation({actorEmail:owner,scopeKind:"personal",tenantId:null,workspaceExplicit:true},()=>service.authorizeImagePromptNodeTx(tx,owner,project,"anchor-root",{write:true}));assert.equal(authorized.id,"anchor-root");await tx.query("ROLLBACK");record("shared-upload-copy-authorization-port");}finally{tx.release();}

    assert.equal((await read("anchor-root",project,other)).status,404);record("cross-owner-read-denied");
    assert.equal((await write(doc(),{who:other,revision:2})).status,404);record("cross-owner-save-denied");
    await seedProject("tree:unrelated");assert.equal((await read("anchor-root","tree:unrelated")).status,403);record("wrong-project-denied");
    assert.equal((await read("anchor-input","tree:anchor-input")).status,403);record("child-id-project-alias-denied");
    await db.getPool().query("INSERT INTO app_canvas_node_settings(email,node_id,kind,settings) VALUES($1,'anchor-root','image','{\"locked\":true}')",[owner]);
    assert.equal((await write(doc(),{revision:2})).status,409);assert.equal((await read()).status,200);record("locked-node-write-denied-read-retained");
    await db.getPool().query("UPDATE app_canvas_node_settings SET settings='{}'::jsonb WHERE email=$1 AND node_id='anchor-root'",[owner]);

    await seedProject("tree:tenant-anchor",tenant);await art("tenant-anchor",{groupId:"tenant-anchor"});await art("tenant-input",{groupId:"tenant-anchor",parentId:"tenant-anchor"});
    await db.getPool().query("UPDATE app_artworks SET parent_id='tenant-input',parent_ids='[\"tenant-input\"]'::jsonb WHERE email=$1 AND id='tenant-anchor'",[owner]);
    const tenantDoc=doc(["tenant-anchor","tenant-input"]);
    const tenantSaved=await write(tenantDoc,{id:"tenant-anchor",key:"tree:tenant-anchor",workspace:tenant});assert.equal(tenantSaved.status,200,JSON.stringify(tenantSaved));record("same-tenant-anchor-layout-save");
    assert.ok([403,409].includes((await write(tenantDoc,{id:"tenant-anchor",key:"tree:tenant-anchor",revision:1})).status));record("tenant-node-not-rebound-to-personal");
    await seedProject("tree:foreign-project",foreignTenant);await art("foreign-art",{groupId:"foreign-project"});
    assert.ok([403,409].includes((await write(doc(["anchor-root","foreign-art"]),{revision:2})).status));record("cross-tenant-reference-denied");

    await seedProject("batch:suite-foreign",foreignTenant);await art("suite-foreign-art",{batchId:"suite-foreign"});
    assert.equal((await write(doc(["anchor-root","suite-foreign-art"]),{revision:2})).status,403);record("suite-batch-foreign-scope-denied");
    await db.getPool().query("UPDATE app_artworks SET batch_id='suite-foreign' WHERE email=$1 AND id='anchor-input'",[owner]);
    assert.equal((await read()).status,403);record("hidden-anchor-ancestor-batch-conflict-still-denied");
    await db.getPool().query("UPDATE app_artworks SET batch_id=NULL WHERE email=$1 AND id='anchor-input'",[owner]);
    await seedProject("batch:suite-personal");await art("suite-personal-art",{batchId:"suite-personal"});
    assert.equal((await read("suite-personal-art","batch:suite-personal")).status,200);record("suite-batch-canonical-read");

    await seedProject("tree:legacy-root");await art("legacy-root",{groupId:"legacy-root",source:"derived"});await art("legacy-child",{groupId:"legacy-root",parentId:"legacy-root",source:"derived"});
    await db.getPool().query("UPDATE app_artworks SET group_id=NULL WHERE email=$1 AND id IN ('legacy-root','legacy-child')",[owner]);
    assert.equal((await read("legacy-child","tree:legacy-root")).status,200);assert.equal((await read("legacy-child","tree:legacy-child")).status,403);record("historical-no-group-canonical-ancestry");
    await art("missing-parent",{parentId:"does-not-exist"});assert.equal((await read("missing-parent")).status,200);record("stable-project-missing-parent-compatibility");
    await art("deleted-parent");await art("deleted-parent-child",{parentId:"deleted-parent"});await db.getPool().query("UPDATE app_artworks SET deleted_at=now() WHERE email=$1 AND id='deleted-parent'",[owner]);
    assert.equal((await read("deleted-parent-child")).status,200);assert.equal((await read("deleted-parent")).status,404);record("deleted-parent-is-not-a-live-input");
    await seedProject("tree:other-owner", "personal",other);await art("other-owner-node",{email:other,groupId:"other-owner"});await art("cross-owner-parent",{parentId:"other-owner-node"});
    assert.equal((await read("cross-owner-parent")).status,200);assert.ok([403,404].includes((await read("cross-owner-parent","tree:other-owner")).status));record("parent-owner-boundary-no-foreign-project-inheritance");
    await assert.rejects(()=>withFrozenCreation({actorEmail:other,scopeKind:"personal",tenantId:null},()=>service.getImagePrompt(owner,{nodeId:"anchor-root",projectKey:project})),(e:any)=>e.status===403);record("service-actor-scope-mismatch-denied");

    // Input graph and physical project anchoring are distinct. Adding a genuine
    // explicit reverse edge must still be rejected by the shared graph writer.
    await assert.rejects(()=>db.addArtworkParent(owner,"anchor-input","anchor-root"),/循环/);record("true-explicit-back-edge-rejected");
    await seedProject("tree:true-cycle");await art("true-cycle",{groupId:"true-cycle",parentId:"true-cycle-input",parentIds:["true-cycle-input"],source:"derived"});await art("true-cycle-input",{groupId:"true-cycle",parentId:"true-cycle",parentIds:["true-cycle"],source:"derived"});
    const realCycle=await read("true-cycle","tree:true-cycle");assert.equal(realCycle.status,409,JSON.stringify(realCycle));assert.equal(realCycle.body.code,"IMAGE_PROMPT_PROJECT_AMBIGUOUS");record("genuine-explicit-ancestry-cycle-denied");
    await seedProject("tree:no-group-cycle");await art("no-group-cycle",{groupId:"no-group-cycle",parentId:"no-group-cycle-input"});await art("no-group-cycle-input",{groupId:"no-group-cycle",parentId:"no-group-cycle"});
    await db.getPool().query("UPDATE app_artworks SET group_id=NULL WHERE email=$1 AND id IN ('no-group-cycle','no-group-cycle-input')",[owner]);
    assert.equal((await read("no-group-cycle","tree:no-group-cycle")).status,409);record("ungrouped-hidden-pointer-cycle-remains-ambiguous");
    await seedProject("tree:cross-group-cycle");await seedProject("tree:cross-group-other");await art("cross-group-cycle",{groupId:"cross-group-cycle",parentId:"cross-group-cycle-input"});await art("cross-group-cycle-input",{groupId:"cross-group-other",parentId:"cross-group-cycle"});
    assert.equal((await read("cross-group-cycle","tree:cross-group-cycle")).status,409);record("cross-group-hidden-pointer-cycle-remains-ambiguous");

    const sharp=productRequire("sharp"),storage=load("src/lib/storage.ts"),media=load("src/lib/media-assets.ts");
    const png=await sharp({create:{width:64,height:48,channels:3,background:"orange"}}).png().toBuffer();
    await storage.writeStoredObject(png,"image/png","project-anchor/original.png");await media.registerMediaAsset("project-anchor/original.png",png,"image/png",false,owner,false);
    const uploadRoute=load("src/app/api/canvas/image-reference-upload/route.ts"),uploadId=randomUUID();
    const form=new FormData();for(const [key,value] of Object.entries({operationId:uploadId,projectKey:project,parentId:"anchor-root",title:"additional-reference.png"}))form.set(key,value);
    form.set("image",new File([new Uint8Array(png)],"additional-reference.png",{type:"image/png"}));
    const uploaded=await json(await uploadRoute.POST(new Request("http://anchor.test/api/canvas/image-reference-upload",{method:"POST",headers:{origin:"http://anchor.test",cookie:`${native.USER_COOKIE}=${native.signUserSession(owner,Date.now())}`,"x-naumi-workspace":"personal","x-naumi-project-context":project},body:form})));
    assert.equal(uploaded.status,201,JSON.stringify(uploaded));assert.ok(uploaded.body.id);record("actual-reference-upload-on-anchor-layout",{status:201});
    assert.equal(sha((await storage.readManagedObject(uploaded.body.image,64*1024*1024)).bytes),sha(png));record("reference-original-bytes-preserved");
    const copyRoute=load("src/app/api/canvas/nodes/copy/route.ts");
    const copied=await json(await copyRoute.POST(request("/api/canvas/nodes/copy",owner,{ids:["anchor-root","anchor-input"],projectKey:project,operationId:randomUUID()})));
    assert.equal(copied.status,200,JSON.stringify(copied));const copiedRoot=copied.body.idMap["anchor-root"],copiedInput=copied.body.idMap["anchor-input"];
    const copiedPrompt=await read(copiedRoot);assert.equal(copiedPrompt.status,200,JSON.stringify(copiedPrompt));assert.deepEqual(copiedPrompt.body.document.activeKeys,[`node:${copiedRoot}`,`node:${copiedInput}`]);record("actual-node-copy-with-prompt-identity-remap",{status:200});
    assert.equal(await graphSnapshot(),graphBefore);record("reference-upload-and-copy-preserve-twelve-original-nodes");
    assert.equal(outbound,0);assert.deepEqual(hashes(),beforeHashes);record("zero-supplier-and-source-files-unchanged",{outbound:0});
    saveReport("PASS");console.log(`IMAGE_PROMPT_PROJECT_ANCHOR=PASS CHECKS=${checks} REAL_PG=1 ACTUAL_ROUTES=1 SUPPLIER_POST=0 EXIT=0`);
  }catch(error){saveReport("FAIL");throw error;}
  finally{globalThis.fetch=originalFetch;await closeDatabasePools();}
}

async function parent(){
  const docker=(values:string[])=>execFileSync("docker",values,{encoding:"utf8",stdio:["ignore","pipe","pipe"],windowsHide:true}).trim();
  const label="project-anchor-"+randomUUID(),name=label;let container:string|undefined,pool:any;
  const inventory=docker(["ps","--format","{{.ID}} {{.Names}} {{.Ports}}"]);
  writeFileSync(join(outputRoot,"PREEXISTING_CONTAINERS.txt"),inventory+"\n");
  try{
    container=docker(["run","-d","--name",name,"--memory=256m","--cpus=1","--label","io.naumi.project-anchor="+label,"-e","POSTGRES_PASSWORD=fixture","-e","POSTGRES_DB=fixture","-p","127.0.0.1::5432","postgres:16-alpine"]);
    const inspect=JSON.parse(docker(["inspect",container]))[0];assert.equal(inspect.Id,container);assert.equal(inspect.Config.Labels["io.naumi.project-anchor"],label);assert.equal(inspect.HostConfig.Memory,268435456);
    const port=inspect.NetworkSettings.Ports["5432/tcp"][0].HostPort,database=`postgres://postgres:fixture@127.0.0.1:${port}/fixture`;
    const {Pool}=productRequire("pg");
    for(let attempt=0;attempt<60;attempt++){
      pool=new Pool({connectionString:database,connectionTimeoutMillis:500});
      try{await pool.query("SELECT 1");break;}catch(error){await pool.end();pool=undefined;if(attempt===59)throw error;await sleep(250);}
    }
    await pool.end();pool=undefined;
    const env:NodeJS.ProcessEnv={...Object.fromEntries(Object.entries(process.env).filter(([key])=>["PATH","SYSTEMROOT","WINDIR","TEMP","TMP","COMSPEC","PATHEXT","USERPROFILE","APPDATA","LOCALAPPDATA"].includes(key.toUpperCase()))),NODE_ENV:"test"};
    Object.assign(env,{DATABASE_URL:database,PGSSLMODE:"disable",PGPOOL_MAX:"5",SETTINGS_SECRET:"project-anchor-local-fixture-only-20261106",NAUMI_MULTI_USER:"1",MEDIA_PRIVATE:"1",STORAGE_DRIVER:"local",MEDIA_DIR:join(outputRoot,"media-"+label),NODE_ENV:"test",NAUMI_VERIFY_ISOLATED_DB:"1"});
    const command=["--import","tsx","--conditions=react-server",resolve(process.argv[1]),...args,"--worker"];
    const result=spawnSync(process.execPath,command,{cwd:sourceRoot,env,encoding:"utf8",timeout:240000,maxBuffer:12*1024*1024,windowsHide:true});
    writeFileSync(join(outputRoot,"stdout.txt"),result.stdout||"");writeFileSync(join(outputRoot,"stderr.txt"),result.stderr||"");
    writeFileSync(join(outputRoot,"RUN.json"),JSON.stringify({command:[process.execPath,...command],cwd:sourceRoot,input:"synthetic twelve-node upload anchor graph; native signed cookies; actual prompt/read/upload/copy routes; independent loopback PG",baseline,exit:result.status,stdout:result.stdout,stderr:result.stderr,container,label,sourceHashes:hashes()},null,2));
    process.stdout.write(result.stdout||"");process.stderr.write(result.stderr||"");if(result.error)throw result.error;process.exitCode=result.status??1;
  }finally{
    if(pool)await pool.end();
    if(container){
      const inspect=JSON.parse(docker(["inspect",container]))[0];assert.equal(inspect.Id,container);assert.equal(inspect.Config.Labels["io.naumi.project-anchor"],label);
      const stop=docker(["stop",container]);const stopped=JSON.parse(docker(["inspect",container]))[0];assert.equal(stopped.State.Running,false);
      docker(["rm","-v",container]);assert.equal(docker(["ps","-aq","--filter","label=io.naumi.project-anchor="+label]),"");
      writeFileSync(join(outputRoot,"CLEANUP.json"),JSON.stringify({container,label,stopStdout:stop,stopped:true,remainingFixtureContainers:0},null,2));
      console.log("IMAGE_PROMPT_PROJECT_ANCHOR_FIXTURE_CLEANUP=PASS CONTAINERS=0");
    }
  }
}
(args.includes("--worker")?worker():parent()).catch(error=>{console.error(error);process.exitCode=1;});
