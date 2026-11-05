/** R4A6 full-checkout A/B. Actual repositories/HTTP handlers, isolated PostgreSQL.
 * Each part has its own process/schema; no supplier, external HTTP or product DB.
 * Baseline success includes explicit reproduction of the old defective behavior. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Pool,type PoolClient} from "pg";
import type {CompetitorItem} from "../src/lib/competitor-types";

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const parts=["content","agent-fresh","agent-legacy","agent-decoy","agent-rollback","genchat-http","competitor"];

async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");
  assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");
  const root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED";
  const part=arg("--part"),out=path.resolve(process.env.CONTENT_EVIDENCE||"output/refactor-r4a6-20261024");
  const load=(file:string)=>import(pathToFileURL(path.join(root,file)).href);
  await mkdir(out,{recursive:true});
  if(!part){
    let total=0;
    for(const name of parts){
      const args=["--conditions=react-server","--import","tsx",path.resolve("scripts/verify-content-session-owners-pg.ts"),"--source-root",root,"--part",name,...(baseline?["--baseline"]:[])];
      const child=spawn(process.execPath,args,{env:{...process.env,TSX_TSCONFIG_PATH:path.join(root,"tsconfig.json")},windowsHide:true,stdio:["ignore","pipe","pipe"]});
      let stdout="",stderr="";child.stdout.on("data",v=>stdout+=v);child.stderr.on("data",v=>stderr+=v);
      const exit=await new Promise<number|null>((resolve,reject)=>{child.once("error",reject);child.once("exit",resolve);});
      await writeFile(path.join(out,`PG_${mode}_${name}.log`),stdout+stderr+`\nEXIT=${exit}\n`);
      process.stdout.write(stdout);process.stderr.write(stderr);assert.equal(exit,0,name);
      total+=Number(stdout.match(/CHECKS=(\d+)/)?.[1]||0);
    }
    console.log(`CONTENT_SESSION_OWNERS_PG=PASS mode=${mode} parts=${parts.length} checks=${total} REAL_PG=1 SOURCE=FULL_CHECKOUT HTTP=ACTUAL_HANDLERS AGENT=${baseline?"REBUILD_REPRODUCED":"IN_PLACE_ATOMIC"} GENCHAT=${baseline?"CROSS_OWNER_AND_FALSE_SUCCESS_REPRODUCED":"OWNER_AND_FAILURE_TRUTHFUL"} BALANCE_REFRESH=${baseline?"SELF_WAIT_REPRODUCED":"RELEASE_FIRST"} SUPPLIER=0`);
    return;
  }
  assert.ok(parts.includes(part));
  const schema="contentowner_"+randomUUID().replaceAll("-",""),decoy=schema+"_decoy";
  const admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});
  await admin.query(`CREATE SCHEMA ${schema}`);
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,NAUMI_MULTI_USER:"1",SETTINGS_SECRET:"content-owner-fixture-012345678901234567890"});
  let db:typeof import("../src/lib/db")|undefined,checks=0,external=0,hasDecoy=false;
  const realFetch=globalThis.fetch;
  globalThis.fetch=(async()=>{external++;throw Error("No external HTTP in content-owner fixture");}) as typeof fetch;
  const eq=(actual:unknown,expected:unknown)=>{assert.deepEqual(actual,expected);checks++;};
  const ok=(value:unknown)=>{assert.ok(value);checks++;};
  const rejects=async(p:Promise<unknown>,pattern?:RegExp)=>{if(pattern)await assert.rejects(p,pattern);else await assert.rejects(p);checks++;};
  const owner="content-owner@fixture.test",other="content-other@fixture.test";
  try{
    db=await load("src/lib/db.ts");const pool=db!.getPool();
    const table=async()=> (await pool.query(`SELECT 'app_agent_sessions'::regclass::oid::text AS oid,
      (SELECT array_agg(a.attname::text ORDER BY k.pos) FROM pg_constraint c
       CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(num,pos)
       JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num
       WHERE c.conrelid='app_agent_sessions'::regclass AND c.contype='p') AS pk,
      (SELECT count(*)::int FROM pg_indexes WHERE schemaname=current_schema() AND indexname='agent_custom_title') AS indexes,
      (SELECT count(*)::int FROM pg_trigger WHERE tgrelid='app_agent_sessions'::regclass AND tgname='agent_custom_trigger') AS triggers`)).rows[0];
    const legacyTable=async(composite=false)=>{
      await pool.query(`CREATE TABLE app_agent_sessions (
        id text NOT NULL,email text NOT NULL,title text NOT NULL DEFAULT '',messages jsonb NOT NULL DEFAULT '[]',
        steps jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (${composite?"email,id":"id"}));
        CREATE INDEX agent_custom_title ON app_agent_sessions(title);
        CREATE FUNCTION agent_keep_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;
        CREATE TRIGGER agent_custom_trigger BEFORE UPDATE ON app_agent_sessions FOR EACH ROW EXECUTE FUNCTION agent_keep_trigger();`);
      await pool.query("INSERT INTO app_agent_sessions(id,email,title,messages,steps) VALUES('old',$1,'old-title','[{\"role\":\"user\",\"content\":\"原始消息\"}]','[{\"type\":\"tool\",\"id\":\"original\"}]')",[owner]);
    };
    if(part==="agent-legacy"||part==="agent-rollback")await legacyTable();
    if(part==="agent-decoy"){
      await legacyTable(true);await admin.query(`CREATE SCHEMA ${decoy}`);hasDecoy=true;
      await admin.query(`CREATE TABLE ${decoy}.app_agent_sessions(id text PRIMARY KEY,email text)`);
    }
    const before=part.startsWith("agent-")&&part!=="agent-fresh"?await table():undefined;
    if(part==="agent-rollback"){
      if(baseline){
        await db!.ensureSchema();
        // The old helper autocommits DROP, then RENAME. A real name collision
        // at its rename reproduces the partially-applied migration window.
        const original=pool.query.bind(pool);let injected=false;
        pool.query=((...args:unknown[])=>{
          if(!injected&&String(args[0]).includes("ALTER TABLE app_agent_sessions_new RENAME")){
            injected=true;
            return original("CREATE TABLE app_agent_sessions(blocker text)").then(()=>Reflect.apply(original,pool,args));
          }
          return Reflect.apply(original,pool,args);
        }) as typeof pool.query;
        try{await rejects(db!.getAgentSession(owner,"old"),/already exists/);}finally{pool.query=original;}
        eq(injected,true);
        eq((await pool.query("SELECT to_regclass('app_agent_sessions_new') IS NOT NULL AS present")).rows[0].present,true);
        eq((await pool.query("SELECT count(*)::int n FROM app_agent_sessions_new")).rows[0].n,1);
        eq((await pool.query("SELECT count(*)::int n FROM app_agent_sessions")).rows[0].n,0);
        ok((await table()).oid!==before.oid);
      }else{
        // Force an actual later billing DDL error, after the key ALTER succeeded.
        // The same initializer transaction must roll back that key and all DDL.
        await pool.query("CREATE TABLE app_billing_operations(id text PRIMARY KEY)");
        await rejects(db!.ensureSchema(),/column.*email.*does not exist/);
        eq(await table(),before);
        eq((await pool.query("SELECT title FROM app_agent_sessions WHERE id='old'")).rows[0].title,"old-title");
        eq((await pool.query("SELECT to_regclass('app_users') AS relation")).rows[0].relation,null);
        eq((await pool.query("SELECT to_regclass('app_agent_sessions_new') AS relation")).rows[0].relation,null);
        await pool.query("DROP TABLE app_billing_operations");await db!.ensureSchema();
        const after=await table();eq(after.oid,before.oid);eq(after.pk,["email","id"]);eq(after.indexes,1);eq(after.triggers,1);
        eq((await db!.getAgentSession(owner,"old"))?.title,"old-title");
      }
    }else{
      await db!.ensureSchema();
      const targets=["templates/repository","templates/cache-repository","templates/import","agent/session-repository","genchat/repository","projects/repository","comfyui/repository","competitor/repository","competitor/completion","billing/legacy-ledger","billing/grants","accounts/repository"];
      const modules=baseline?[db!]:await Promise.all(targets.map(f=>load(`src/lib/${f}.ts`)));
      const api=Object.assign({},...modules) as typeof import("../src/lib/db");
      if(!baseline&&part==="content")for(const m of modules)for(const [name,fn] of Object.entries(m))if(typeof fn==="function"&&name in db!)eq(fn,(db as unknown as Record<string,unknown>)[name]);
      async function fund(email:string,amount:number){
        await db!.getOrCreateUser(email);await pool.query("DELETE FROM app_ledger WHERE email=$1",[email]);await pool.query("DELETE FROM app_credit_batches WHERE email=$1",[email]);
        await pool.query("UPDATE app_users SET credits_total=$2,credits_used=0 WHERE email=$1",[email,amount]);
        if(amount)await pool.query("INSERT INTO app_credit_batches(id,email,amount,remaining,source,expires_at) VALUES($1,$2,$3,$3,'admin',now()+interval '1 year')",[randomUUID(),email,amount]);
      }
      if(part.startsWith("agent-")){
        const messages=[{role:"user",content:"原始消息"}],steps=[{type:"tool",id:"original"}];
        if(before){
          const saved=await api.getAgentSession(owner,"old");eq(saved?.messages,messages);eq(saved?.steps,steps);eq(saved?.title,"old-title");
          const after=await table();eq(after.pk,["email","id"]);eq(after.oid===before.oid,!baseline);eq(after.indexes,baseline?0:1);eq(after.triggers,baseline?0:1);
        }
        await api.saveAgentSession(owner.toUpperCase(),"shared","Owner",messages,steps);
        await api.saveAgentSession(other,"shared","Other",[{role:"user",content:"Other"}],[]);
        eq((await api.getAgentSession(owner,"shared"))?.messages,messages);eq((await api.getAgentSession(other,"shared"))?.title,"Other");
        await api.saveAgentSession(owner,"cv-project","canvas",[],[]);
        ok((await api.listAgentSessions(owner,20,true)).every(s=>!s.id.startsWith("cv-")));
        eq(await api.renameAgentSession("absent@fixture.test","shared","spoof"),false);
        eq(await api.renameAgentSession(owner,"shared","R".repeat(130)),true);eq((await api.getAgentSession(owner,"shared"))?.title.length,120);
        await api.deleteAgentSession(other,"shared");eq(await api.getAgentSession(other,"shared"),null);ok(await api.getAgentSession(owner,"shared"));
        // After initialization/repository warmup, CRUD must issue no migration DDL.
        const original=pool.query.bind(pool);let ddl=0;
        pool.query=((...args:unknown[])=>{if(/information_schema|\b(?:CREATE|DROP|ALTER)\b/i.test(String(args[0])))ddl++;return Reflect.apply(original,pool,args);}) as typeof pool.query;
        try{await api.saveAgentSession(owner,"after","after",[],[]);await api.getAgentSession(owner,"after");await api.listAgentSessions(owner);await api.renameAgentSession(owner,"after","renamed");await api.deleteAgentSession(owner,"after");}finally{pool.query=original;}
        eq(ddl,0);eq((await table()).pk,["email","id"]);
        if(hasDecoy)eq((await admin.query(`SELECT count(*)::int n FROM ${decoy}.app_agent_sessions`)).rows[0].n,0);
      }else if(part==="genchat-http"){
        await fund(owner,0);await fund(other,0);
        const route=await load("src/app/api/genchat/route.ts"),native=await load("src/lib/native-auth.ts");
        const request=(method:string,email=owner,body?:unknown,query="")=>new Request("http://fixture.test/api/genchat"+query,{method,headers:{"content-type":"application/json",cookie:email?"nv_user="+native.signUserSession(email,Date.now()):""},...(body===undefined?{}:{body:JSON.stringify(body)})});
        const save=(email:string,title:string)=>route.POST(request("POST",email,{id:"same",title,turns:[{text:title}]}));
        eq((await route.GET(request("GET",""))).status,401);
        eq((await route.GET(request("GET",owner,undefined,"?email="+other))).status,403);
        eq((await route.POST(request("POST",owner,{id:"x",email:other}))).status,403);
        eq((await save(owner,"Owner original")).status,200);
        const conflict=await save(other,"Other overwrite");eq(conflict.status,baseline?200:409);
        if(!baseline)eq((await conflict.json()).code,"GENCHAT_SESSION_CONFLICT");
        const owned=await api.getGenchatSession(owner,"same");eq(owned?.title,baseline?"Other overwrite":"Owner original");eq(owned?.turns,[{text:baseline?"Other overwrite":"Owner original"}]);
        eq(await api.getGenchatSession(other,"same"),null);
        eq((await route.DELETE(request("DELETE",other,undefined,"?session=same"))).status,200);ok(await api.getGenchatSession(owner,"same"));
        eq((await save(owner,"Own update")).status,200);eq((await api.listGenchatSessions(owner))[0].title,"Own update");
        // Missing session relation is real SQL failure, while auth DB remains live.
        await pool.query("ALTER TABLE app_genchat_sessions RENAME TO genchat_unavailable");
        try{for(const [method,body,query] of [["GET",undefined,""],["GET",undefined,"?session=same"],["POST",{id:"new",title:"lost"},""],["DELETE",undefined,"?session=same"]] as const){
          const response=await route[method](request(method,owner,body,query));eq(response.status,baseline?200:503);
          if(!baseline){eq((await response.json()).code,"GENCHAT_STORAGE_UNAVAILABLE");eq(response.headers.get("cache-control"),"no-store");}
          else{const result=await response.json();eq(result,method==="GET"?(query?{session:null}:{sessions:[]}):{ok:true});}
        }}finally{await pool.query("ALTER TABLE genchat_unavailable RENAME TO app_genchat_sessions");}
        eq((await api.getGenchatSession(owner,"same"))?.title,"Own update");
        eq((await route.DELETE(request("DELETE",owner,undefined,"?session=same"))).status,200);eq(await api.getGenchatSession(owner,"same"),null);
      }else if(part==="content"){
        await fund(owner,30);await fund(other,0);
        const template=(id:string)=>({id,title:id,category:"product",industry:"shop",description:"details",prompt:"完整提示词 "+id,tags:["TAG"],image:"https://images.fixture.test/"+id+".png",sourceImage:"https://images.fixture.test/source.png",gradient:"",popular:true});
        const a=await api.createTemplate(template("tpl-a")),b=await api.createTemplate({...template("tpl-b"),popular:false});eq(a.created,true);eq(b.created,true);
        const list=await api.listTemplatesPaged({pageSize:1});eq(list.total,2);eq(list.items[0].id,"tpl-b");eq(list.items[0].prompt,"");eq(list.items[0].sourceImage,"");
        const detail=await api.listTemplatesPaged({ids:["tpl-a"]});eq(detail.items[0].prompt,template("tpl-a").prompt);eq(detail.items[0].sourceImage,template("tpl-a").sourceImage);
        eq((await api.listTemplatesPaged({q:"tag",category:"product"})).total,2);eq(await api.listTemplateCategories(),[{name:"product",count:2}]);eq(await api.listTemplatesInCategories([]),[]);
        await api.setTemplateHomepageFeatured("tpl-a",true);eq((await api.listHomepageFeaturedTemplates())[0].id,"tpl-a");
        await api.updateTemplate("tpl-a",{title:"",popular:false,homepageFeatured:false,gradient:"",tags:[]});
        const cleared=await api.getTemplate("tpl-a");eq(cleared?.title,"");eq(cleared?.popular,false);eq(cleared?.homepageFeatured,false);eq(cleared?.tags,[]);eq(cleared?.gradient,"");
        const replaced=await api.createTemplate({...template("tpl-a"),title:"reimport",industry:"changed",tags:["changed"]});eq(replaced.created,false);eq(replaced.template.title,"reimport");eq(replaced.template.industry,"shop");eq(replaced.template.tags,[]);eq(replaced.template.popular,false);
        eq((await api.listTemplates())[0].id,"tpl-b");
        eq((await api.syncTemplatesFromCode([template("tpl-a"),template("tpl-b"),template("tpl-c")])).inserted,1);eq((await api.getTemplate("tpl-a"))?.title,"reimport");
        eq((await api.syncTemplatesFromCode([template("ignored-short-seed")])).skipped,true);
        eq(await api.importTemplates([{...template("tpl-a"),title:"overwrite"},template("tpl-d")],100,10),1);eq((await api.getTemplate("tpl-a"))?.title,"reimport");
        await api.addUserFav(owner,"tpl-a");await api.addUserFav(owner,"tpl-a");await api.addUserFav(other,"tpl-b");eq(await api.listUserFavs(owner),["tpl-a"]);await api.removeUserFav(other,"tpl-a");eq(await api.listUserFavs(owner),["tpl-a"]);
        const candidates=await api.listTemplateImageCacheCandidates();eq(candidates.length,4);
        const original=template("tpl-a").image;
        eq(await api.setTemplateImageCacheSuccess("tpl-a",original,original,"/media/cache-a.png"),true);eq(await api.getTemplateImageCacheState("tpl-a"),{image:"/media/cache-a.png",imageSource:original});
        await api.updateTemplate("tpl-b",{image:"https://images.fixture.test/admin.png"});eq(await api.setTemplateImageCacheSuccess("tpl-b",template("tpl-b").image,"old","/media/stale.png"),false);eq(await api.setTemplateImageCacheFailure("tpl-b",template("tpl-b").image,"old","stale"),false);
        eq(await api.setTemplateImageCacheFailure("tpl-c",template("tpl-c").image,template("tpl-c").image," x "),true);
        eq(await api.getTemplateImageCacheStats(),{total:4,cached:1,remaining:2,failed:1});eq(await api.resetTemplateImageCacheFailures(),1);
        await api.updateTemplate("tpl-a",{image:"https://images.fixture.test/new.png"});eq(await api.getTemplateImageCacheState("tpl-a"),{image:"https://images.fixture.test/new.png",imageSource:""});eq((await api.getTemplateImageCacheStats()).cached,0);
        const urls=await load(baseline?"src/lib/template-image-cache.ts":"src/lib/templates/image-source.ts");
        for(const value of ["","/media/a.png","data:image/png;base64,a","ftp://host/file","/api/tpl-image?u=%2Fmedia%2Fa.png"])eq(urls.remoteTemplateImageSource(value),null);
        eq(urls.remoteTemplateImageSource(" /api/tpl-image?u=https%3A%2F%2Fimages.fixture.test%2Fa.png "),"https://images.fixture.test/a.png");eq(urls.templateImageDeliveryUrl("a b","https://images.fixture.test/a.png"),"/api/tpl-image?id=a%20b&u=https%3A%2F%2Fimages.fixture.test%2Fa.png");
        // Existing customized defaults stay; only known corrupted seed strings repair.
        await api.upsertProject({slug:"naumi",name:"运营自定义",description:"keep",visible:false,agent_tool:false,sort_index:0});await api.upsertProject({slug:"sycm",name:"\ufffd",url:"/custom-url"});await api.seedProjects();
        const projects=await api.listProjects(false);eq(projects.find(p=>p.slug==="naumi")?.name,"运营自定义");eq(projects.find(p=>p.slug==="naumi")?.visible,false);eq(projects.find(p=>p.slug==="sycm")?.name,"生意参谋助手");eq(projects.find(p=>p.slug==="sycm")?.url,"/custom-url");eq((await api.listProjects()).length,1);await api.deleteProject("sycm");eq((await api.listProjects(false)).length,1);
        const ep=(await api.saveComfyEndpoint(owner,{name:"owned",baseUrl:"http://127.0.0.1:9",apiKey:"fixture-key-byte",activate:true}))[0];eq(ep.apiKey,"fixture-key-byte");
        const ep2=(await api.saveComfyEndpoint(owner,{name:"second",baseUrl:"http://127.0.0.1:8",activate:true})).find(e=>e.id!==ep.id)!;eq((await api.getActiveComfyEndpoint(owner))?.id,ep2.id);await api.saveComfyEndpoint(owner,{id:ep.id,baseUrl:ep.baseUrl});eq((await api.listComfyEndpoints(owner)).find(e=>e.id===ep.id)?.apiKey,ep.apiKey);
        await rejects(api.saveComfyEndpoint(other,{id:ep.id,baseUrl:"spoof"}),/端点不存在/);eq(await api.listComfyEndpoints(other),[]);await api.deleteComfyEndpoint(other,ep.id);ok((await api.listComfyEndpoints(owner)).some(e=>e.id===ep.id));
        const json={"1":{class_type:"fixture",inputs:{prompt:"中文\nnewline",flag:false,zero:0,empty:""}}},inputs=[{id:"prompt",node:"1"}],required=["fixture"];
        const wf=(await api.saveComfyWorkflow(owner,{name:"Private",apiJson:json,inputs,required,note:"unchanged"}))[0];eq((await api.getComfyWorkflow(owner,wf.id))?.apiJson,json);eq(await api.getComfyWorkflow(other,wf.id),null);await rejects(api.copyComfyWorkflow(other,wf.id),/未公开/);
        await api.publishComfyWorkflow(other,wf.id,true);eq(await api.listPublicComfyWorkflows(other),[]);await api.publishComfyWorkflow(owner,wf.id,true);eq((await api.listPublicComfyWorkflows(other))[0].id,wf.id);eq(await api.listPublicComfyWorkflows(owner),[]);
        const copied=await api.copyComfyWorkflow(other,wf.id),copy=await api.getComfyWorkflow(other,copied);eq(copy?.apiJson,json);eq(copy?.inputs,inputs);eq(copy?.required,required);eq(copy?.isPublic,false);eq(await api.getComfyWorkflow(owner,copied),null);await api.deleteComfyWorkflow(other,wf.id);ok(await api.getComfyWorkflow(owner,wf.id));
        eq(await api.bindPhoneToEmail(owner,"19900000001"),true);eq(await api.findEmailByBoundPhone("19900000001"),owner);eq(await api.bindPhoneToEmail("absent@fixture.test","19900000002"),false);await rejects(api.bindPhoneToEmail(other,"19900000001"),/duplicate key/);
        const grantId=randomUUID();await api.addCreditBatch(owner,10,{source:"admin",reason:"fixture",id:grantId});await api.addCreditBatch(owner,10,{source:"admin",reason:"fixture",id:grantId});eq((await db!.getCreditOverview(owner)).balance,40);
        await pool.query("UPDATE app_users SET credits_used=6 WHERE email=$1",[owner]);await api.addLedgerEntry(owner,-6,"legacy-complete");eq((await db!.getCreditOverview(owner)).balance,34);eq((await pool.query("SELECT credits_used FROM app_users WHERE email=$1",[owner])).rows[0].credits_used,0);
        eq((await api.listUserLedgerFiltered(owner,{kind:"consume"})).length,1);eq((await api.listUserLedger(other)).length,0);ok((await api.listLedger()).length>=2);
        const adjustment=randomUUID();await api.adjustUserCredits(owner,-4,"adjust",{id:adjustment});await api.adjustUserCredits(owner,-4,"adjust",{id:adjustment});eq((await db!.getCreditOverview(owner)).balance,30);
      }else if(part==="competitor"){
        await fund(owner,30);await fund(other,0);
        const item:CompetitorItem={id:randomUUID(),batchId:randomUUID(),path:"products/one.png",image:"/media/original.png",width:1024,height:1024,prompt:"original",regions:[],versions:[],activeVersion:"",revision:0,busy:false,createdAt:new Date().toISOString()};
        await api.insertCompetitorItem(owner,item);eq((await api.insertCompetitorItem(owner,{...item,id:randomUUID(),prompt:"should not replace"})).id,item.id);eq((await api.getCompetitorItem(owner,item.id))?.prompt,"original");eq(await api.getCompetitorItem(other,item.id),null);eq(await api.listCompetitorItems(other),[]);
        const saved=await api.saveCompetitorItem(owner,{...item,prompt:"edited"});eq(saved?.revision,1);eq(await api.saveCompetitorItem(owner,item),null);
        const job=randomUUID(),claims=await Promise.all([api.claimCompetitorItem(owner,item.id,1,job),api.claimCompetitorItem(owner,item.id,1,randomUUID())]);eq(claims.filter(Boolean).length,1);const claimed=claims.find(Boolean)!;
        eq(await api.saveCompetitorItem(owner,claimed),null);eq(await api.deleteCompetitorItem(owner,item.id),false);await api.releaseCompetitorItem(other,item.id,job);eq((await api.getCompetitorItem(owner,item.id))?.busy,true);
        await pool.query("INSERT INTO app_gen_reservations(job_id,email,cost) VALUES($1,$2,6)",[job,owner]);await pool.query("UPDATE app_users SET credits_used=6 WHERE email=$1",[owner]);
        const snapshot=async()=>({item:(await pool.query("SELECT state,revision,job_id FROM app_competitor_items WHERE id=$1",[item.id])).rows[0],wallet:(await pool.query("SELECT credits_total,credits_used FROM app_users WHERE email=$1",[owner])).rows[0],ledger:(await pool.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1",[owner])).rows[0].n});
        const original=await snapshot();await rejects(api.finishCompetitorGeneration(owner,claimed,randomUUID(),6),/lease lost/);eq(await snapshot(),original);await rejects(api.finishCompetitorGeneration(owner,claimed,job,100),/积分不足/);eq(await snapshot(),original);
        // Leave exactly one of the real five query connections available.
        const held:PoolClient[]=[],oldTimeout=pool.options.connectionTimeoutMillis;pool.options.connectionTimeoutMillis=250;
        let timedOut=0;const query=pool.query.bind(pool);
        try{
          for(let i=0;i<4;i++)held.push(await pool.connect());
          pool.query=((...args:unknown[])=>{const result=Reflect.apply(query,pool,args);if(String(args[0]).includes("WITH upd AS"))return result.catch((error:Error)=>{if(/timeout exceeded/.test(error.message))timedOut++;throw error;});return result;}) as typeof pool.query;
          const done=await api.finishCompetitorGeneration(owner,{...claimed,prompt:"delivered",versions:[{id:"result",image:"/media/result.png",kind:"edit",parent:"original",prompt:"done",regions:[],createdAt:item.createdAt}]},job,6);
          eq(done.busy,false);eq(done.revision,3);
        }finally{pool.query=query;held.forEach(c=>c.release());pool.options.connectionTimeoutMillis=oldTimeout;}
        eq(timedOut,baseline?1:0);
        const after=await snapshot();eq(after.wallet.credits_used,0);eq(after.wallet.credits_total,baseline?30:24);eq(after.ledger,1);eq(after.item.job_id,null);eq(after.item.state.prompt,"delivered");
        eq((await pool.query("SELECT count(*)::int n FROM app_gen_reservations WHERE job_id=$1",[job])).rows[0].n,0);
        await rejects(api.finishCompetitorGeneration(owner,claimed,job,6),/lease lost/);eq((await snapshot()).ledger,1);eq((await db!.getCreditOverview(owner)).balance,24);
        eq(await api.deleteCompetitorItem(other,item.id),false);eq(await api.deleteCompetitorItem(owner,item.id),true);
        console.log(`COMPETITOR_PRESSURE=${baseline?"REPRODUCED":"PASS"} held=4 pool_max=5 swallowed_timeouts=${timedOut} consume=1`);
      }
    }
    eq(external,0);eq(pool.waitingCount,0);eq(pool.idleCount,pool.totalCount);
    console.log(`CONTENT_OWNER_PART=${part} MODE=${mode} CHECKS=${checks} RESULT=PASS`);
  }finally{
    globalThis.fetch=realFetch;
    if(db)await db.getPool().end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);if(hasDecoy)await admin.query(`DROP SCHEMA ${decoy} CASCADE`);
    await admin.end();console.log(`CONTENT_OWNER_CLEANUP=${part} SCHEMA_DROPPED=1 POOL_CLOSED=1`);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
