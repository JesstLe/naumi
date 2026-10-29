import {existsSync as requireExists} from "node:fs";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import {pathToFileURL} from "node:url";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
import {gaodingFixture,clipboardHtml} from "./fixtures/gaoding-clipboard";

async function main(){
  const baseline=process.argv.includes("--baseline"),at=process.argv.indexOf("--source-root"),root=path.resolve(at<0?".":process.argv[at+1]);
  let projected:Record<string,unknown>|undefined;
  const load=(p:string)=>projected?.[p]?Promise.resolve(projected[p] as any):import(pathToFileURL(path.join(root,p)).href),media=path.resolve("output/refactor-r7b-20261029/media",randomUUID());
  Object.assign(process.env,{MEDIA_DIR:media,STORAGE_DRIVER:"local",MEDIA_PRIVATE:"0",NAUMI_MULTI_USER:"1"});
  let checks=0,external=0;const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
  const f=await createModelFixture((_q,r)=>{external++;r.end("disabled");});process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
  const db=await import("../src/lib/db");
  try{
    if(baseline){
      // Only owned old HTTP/domain implementations are bundled. All other I/O,
      // scope, repositories and schemas use the same current fixture modules.
      const owned=["src/app/api/canvas/nodes/delete/route.ts","src/app/api/canvas/history/route.ts","src/app/api/canvas/nodes/copy/route.ts","src/app/api/canvas/workflow-import/asset/route.ts","src/lib/canvas/node-deletion.ts","src/lib/canvas/node-delete.ts","src/lib/canvas/node-copy.ts","src/lib/canvas-history.ts","src/lib/canvas/workflow-import.ts","src/lib/canvas-workflow-import.ts"];
      const actual=process.cwd(),{build}=await import("esbuild");
      const output=path.resolve("output/refactor-r7b-20261029/baseline-projection.cjs");
      await build({stdin:{contents:owned.map((p,i)=>`export * as source${i} from ${JSON.stringify(path.join(root,p))};`).join("\n"),resolveDir:actual,loader:"ts"},bundle:true,platform:"node",format:"cjs",packages:"external",outfile:output,plugins:[{name:"owned-baseline-only",setup(b){b.onResolve({filter:/^@\/|^\.|^[A-Z]:[\\/]/i},args=>{
        let full=args.path.startsWith("@/")?path.join(root,"src",args.path.slice(2)):path.isAbsolute(args.path)?args.path:path.resolve(path.dirname(args.importer),args.path);
        const rel=path.relative(root,full).replaceAll("\\","/");
        const resolve=(base:string)=>[base,base+".ts",base+".tsx",path.join(base,"index.ts")].find(p=>requireExists(p));
        const candidate=resolve(full);if(candidate){const name=path.relative(root,candidate).replaceAll("\\","/");if(owned.includes(name))return {path:candidate};}
        const current=resolve(path.join(actual,rel));return current?{path:args.kind==="dynamic-import"?pathToFileURL(current).href:current,external:true}:undefined;
      });}}]});
      const exports=await import(pathToFileURL(output).href),value=exports.default||exports;projected=Object.fromEntries(owned.map((p,i)=>[p,value[`source${i}`]]));
      console.log("BASELINE_PROJECTION=OWNED_HTTP_AND_DOMAIN COMMON_DEPENDENCIES=CURRENT");
    }
    await db.ensureSchema();const email="native-lifecycle@fixture.test",other="native-other@fixture.test";await db.getOrCreateUser(email);await db.getOrCreateUser(other);
    const ledger=async()=>(await f.sql.query("SELECT count(*)::int AS n,coalesce(sum(delta),0)::int AS amount FROM app_ledger")).rows[0];const before=await ledger();
    const specs=[['video','vnode','Video'],['director','director','Director'],['character','character','Character'],['scene','scene','Scene'],['audio','audio','Audio'],['timeline','timeline','Timeline']] as const;
    const nodes:Record<string,any>={};const fields:Record<string,string>={};
    for(const [kind,prefix,name] of specs){
      const repo=await import(`../src/lib/canvas/${kind}-node-repository`),schema=await import(`../src/lib/canvas/${kind}-node-schema`);await repo[`ensure${name}NodeSchema`]();
      const tx=await db.getPool().connect();try{await tx.query('BEGIN');const parsed=schema[`${kind}NodeWriteSchema`].parse({id:`${prefix}-lifecycle`,operationId:randomUUID(),expectedRevision:0,x:10,y:20});
        nodes[kind]=await repo[`save${name}NodeTx`](tx,email,parsed,"tree:lifecycle");await tx.query('COMMIT');}finally{tx.release();}
      fields[kind]=`${kind}Nodes`;
    }
    const route=await load("src/app/api/canvas/nodes/delete/route.ts"),history=await load("src/app/api/canvas/history/route.ts"),copy=await load("src/app/api/canvas/nodes/copy/route.ts");
    const {signUserSession,USER_COOKIE}=await import("../src/lib/native-auth");
    const headers=(actor=email)=>({"content-type":"application/json",cookie:`${USER_COOKIE}=${signUserSession(actor,Date.now())}`,"x-naumi-workspace":"personal"});
    const call=async(handler:{POST:(r:Request)=>Promise<Response>},url:string,body:unknown,actor=email)=>{const response=await handler.POST(new Request("http://localhost"+url,{method:"POST",headers:headers(actor),body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
    const deletion={operationId:randomUUID(),...Object.fromEntries(specs.map(([kind])=>[`${kind}Ids`,[nodes[kind].id]]))};
    await f.sql.query("UPDATE app_canvas_audio_nodes SET revision=20 WHERE email=$1",[email]);
    const removed=await call(route,"/api/canvas/nodes/delete",deletion);if(removed.status!==200)console.error("DELETE_RESPONSE="+JSON.stringify(removed));eq(removed.status,200);eq(!!removed.body.nativeNodes,!baseline);
    if(!baseline){for(const [kind] of specs){const receipt=removed.body.nativeNodes[fields[kind]][0];eq(receipt.id,nodes[kind].id);eq(receipt.revision,kind==='audio'?21:2);assert.ok(receipt.deletedAt);checks++;}}
    eq((await call(route,"/api/canvas/nodes/delete",deletion)).status,200);
    const restore={operationId:randomUUID(),operations:specs.map(([kind])=>({type:`${kind}-visibility`,id:nodes[kind].id,visible:true}))};
    const restored=await call(history,"/api/canvas/history",restore);eq(restored.status,200);eq(!!restored.body.nativeNodes,!baseline);
    if(!baseline){eq(restored.body.artworkIds,[]);eq(restored.body.nativeNodes.audioNodes[0].revision,22);}
    // Replay is a current receipt, not the originally returned revision/snapshot.
    await f.sql.query("UPDATE app_canvas_audio_nodes SET title='later audio',revision=revision+1 WHERE email=$1",[email]);
    const replay=await call(history,"/api/canvas/history",restore);eq(replay.status,200);if(!baseline)eq([replay.body.nativeNodes.audioNodes[0].title,replay.body.nativeNodes.audioNodes[0].revision],['later audio',23]);
    const invalid={...deletion,operationId:randomUUID(),timelineIds:['timeline-missing']};eq((await call(route,"/api/canvas/nodes/delete",invalid)).status,500);
    eq((await f.sql.query("SELECT deleted_at FROM app_canvas_audio_nodes WHERE email=$1",[email])).rows[0].deleted_at,null);
    const c={operationId:randomUUID(),ids:specs.map(([kind])=>nodes[kind].id)};const copied=await call(copy,"/api/canvas/nodes/copy",c);eq(copied.status,200);eq(!!copied.body.nativeNodes,!baseline);
    if(!baseline){const id=copied.body.audioNodes[0].id;await f.sql.query("UPDATE app_canvas_audio_nodes SET title='edited copy',revision=8 WHERE email=$1 AND id=$2",[email,id]);const retry=await call(copy,"/api/canvas/nodes/copy",c);eq([retry.body.nativeNodes.audioNodes[0].title,retry.body.nativeNodes.audioNodes[0].revision],['edited copy',8]);}
    const project=await call(route,"/api/canvas/nodes/delete",{projectKey:copied.body.projectKey,operationId:randomUUID()});eq(project.status,200);eq(!!project.body.nativeNodes,!baseline);
    eq((await call(route,"/api/canvas/nodes/delete",deletion,other)).status,500);
    console.log(`GROUP=NATIVE_LIFECYCLE PASS kinds=6 actual_delete_history_copy=true receipts=${!baseline}`);

    const workflow=await load("src/lib/canvas/workflow-import.ts"),assetRoute=await load("src/app/api/canvas/workflow-import/asset/route.ts");
    const seed=gaodingFixture().elements[0].elements![0];const placeholder={...seed,url:'',metaInfo:{$clipboard:{sourceUuid:'fill-image'},workflow:{previous:[]}}};
    const input={operationId:randomUUID(),html:clipboardHtml({version:'10.0.0',elements:[placeholder]}),projectKey:null,x:100,y:150};
    const imported=await workflow.importCanvasWorkflow(email,input);const node=imported.artworks[0];eq(node.source,"workflow-placeholder");
    const png=await sharp({create:{width:18,height:12,channels:4,background:'#aabbcc'}}).png().toBuffer(),op=randomUUID();
    const locks:boolean[]=[];const prepare=async(bytes:Buffer)=>{
      const free=(await f.sql.query(`WITH h AS (SELECT hashtextextended($1,0) AS id) SELECT NOT EXISTS(SELECT 1 FROM pg_locks l,h WHERE l.locktype='advisory' AND l.granted AND l.objsubid=1 AND l.classid::bigint=((h.id>>32)&4294967295::bigint) AND l.objid::bigint=(h.id&4294967295::bigint) AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())) AS free`,[email])).rows[0].free;locks.push(free);return {bytes,width:18,height:12};
    };
    const filled=await workflow.fillWorkflowAsset(email,node.id,op,png,{prepare});
    if(!baseline){eq(locks,[true]);eq(filled.beforeAsset.image,node.image);eq(filled.afterAsset.image,filled.node.image);}
    eq(filled.node.id,node.id);await f.sql.query("UPDATE app_artworks SET title='live layout',canvas_x=888 WHERE email=$1 AND id=$2",[email,node.id]);
    const late=await workflow.fillWorkflowAsset(email,node.id,op,png,{prepare:async()=>{throw Error('receipt must not prepare');}});eq([late.node.title,late.node.canvasX],['live layout',888]);
    await assert.rejects(()=>workflow.fillWorkflowAsset(email,node.id,op,Buffer.from('different')));checks++;
    if(!baseline){
      const r=await assetRoute.GET(new Request(`http://localhost/api/canvas/workflow-import/asset?id=${node.id}&operationId=${op}`,{headers:headers()}));eq(r.status,200);eq((await r.json()).beforeAsset.image,node.image);
      eq((await assetRoute.GET(new Request(`http://localhost/api/canvas/workflow-import/asset?id=${node.id}&operationId=${op}`,{headers:headers(other)}))).status,404);
      const next=await workflow.importCanvasWorkflow(email,{...input,operationId:randomUUID()});const id=next.artworks[0].id,raceOp=randomUUID();let release!:()=>void,ready!:()=>void;
      const gate=new Promise<void>(r=>release=r),entered=new Promise<void>(r=>ready=r);
      const slow=workflow.fillWorkflowAsset(email,id,raceOp,png,{prepare:async(bytes:Buffer)=>{ready();await gate;return prepare(bytes);}});await entered;
      const winner=await workflow.fillWorkflowAsset(email,id,raceOp,png);release();const loser=await slow;eq(loser.node.image,winner.node.image);
      const folder=path.join(media,'canvas-import-fills',raceOp);const files:string[]=[];async function walk(dir:string){for(const entry of await fs.readdir(dir,{withFileTypes:true})){if(entry.isDirectory())await walk(path.join(dir,entry.name));else files.push(path.join(dir,entry.name));}}await walk(folder);eq(files.length,1);eq(await fs.readFile(files[0]),png);
      const locked=await workflow.importCanvasWorkflow(email,{...input,operationId:randomUUID()});const lockedId=locked.artworks[0].id,lockedOp=randomUUID();
      await assert.rejects(()=>workflow.fillWorkflowAsset(email,lockedId,lockedOp,png,{prepare:async (bytes:Buffer)=>{await f.sql.query("UPDATE app_canvas_node_settings SET settings=jsonb_set(settings,'{locked}','true') WHERE email=$1 AND node_id=$2",[email,lockedId]);return prepare(bytes);}}),/解锁/);checks++;
      eq((await f.sql.query("SELECT count(*)::int AS n FROM app_canvas_workflow_asset_ops WHERE id=$1",[lockedOp])).rows[0].n,0);
      const withFrozen=await import('../src/lib/saas/creation-scope');const personal=await withFrozen.withFrozenCreation({actorEmail:email,scopeKind:'personal',tenantId:null},()=>workflow.listWorkflowManifests(email));assert.ok(Array.isArray(personal)&&personal.length);checks++;
      const tenant=await withFrozen.withFrozenCreation({actorEmail:email,scopeKind:'tenant',tenantId:randomUUID()},()=>workflow.listWorkflowManifests(email));eq(tenant,[]);
    }
    const httpImport=await workflow.importCanvasWorkflow(email,{...input,operationId:randomUUID()});
    const fd=new FormData();fd.set('id',httpImport.artworks[0].id);fd.set('operationId',randomUUID());fd.set('image',new File([new Uint8Array(png)],'fill.png',{type:'image/png'}));
    const httpFilled=await assetRoute.POST(new Request('http://localhost/api/canvas/workflow-import/asset',{method:'POST',headers:{cookie:headers().cookie,'x-naumi-workspace':'personal'},body:fd}));eq(httpFilled.status,200);const httpBody=await httpFilled.json();eq(httpBody.node.id,httpImport.artworks[0].id);eq(!!httpBody.beforeAsset,!baseline);
    if(!baseline){
      const failed=await workflow.importCanvasWorkflow(email,{...input,operationId:randomUUID()}),id=failed.artworks[0].id,operationId=randomUUID();
      await f.sql.query(`ALTER TABLE app_canvas_workflow_asset_ops ADD CONSTRAINT fill_fixture_fault CHECK(node_id<>'${id}')`);
      await assert.rejects(()=>workflow.fillWorkflowAsset(email,id,operationId,png));checks++;await f.sql.query('ALTER TABLE app_canvas_workflow_asset_ops DROP CONSTRAINT fill_fixture_fault');
      eq((await db.listArtworksByIds(email,[id]))[0].image,failed.artworks[0].image);
      const countFiles=async(folder:string):Promise<number>=>{let total=0;for(const item of await fs.readdir(folder,{withFileTypes:true}).catch(()=>[])){total+=item.isDirectory()?await countFiles(path.join(folder,item.name)):1;}return total;};
      eq(await countFiles(path.join(media,'canvas-import-fills',operationId)),0);
      const ambiguous=await workflow.importCanvasWorkflow(email,{...input,operationId:randomUUID()}),unknownOp=randomUUID(),pool=db.getPool(),connect=pool.connect;let commits=0;
      (pool as any).connect=async()=>{const client=await connect.call(pool),query=client.query;client.query=async function(...args:any[]){const result=await (query as any).apply(client,args);if(args[0]==='COMMIT'&&++commits===2)throw Error('fixture lost COMMIT acknowledgement');return result;};const release=client.release;client.release=function(...args:any[]){client.query=query;return (release as any).apply(client,args);};return client;};
      try{await assert.rejects(()=>workflow.fillWorkflowAsset(email,ambiguous.artworks[0].id,unknownOp,png),/lost COMMIT acknowledgement/);checks++;}finally{pool.connect=connect;}
      const receipt=await workflow.fillWorkflowAsset(email,ambiguous.artworks[0].id,unknownOp,png,{prepare:async()=>{throw Error('known COMMIT must not prepare');}});eq(await fs.readFile(path.join(media,receipt.node.image.slice(7))),png);eq(commits,2);
      console.log('GROUP=FILL_FAULTS PASS SQL_ROLLBACK=NO_PARTIAL COMMIT_ACK_LOST=ORIGINAL_RECEIPT BYTES_RETAINED=1');
    }
    const undo=await call(history,"/api/canvas/history",{operationId:randomUUID(),operations:[{type:'workflow-asset',id:node.id,assetOperationId:op,filled:false}]});eq(undo.status,200);
    const live=(await db.listArtworksByIds(email,[node.id]))[0];eq([live.title,live.canvasX,live.image],['live layout',888,node.image]);
    eq(await ledger(),before);eq(external,0);
    console.log(`CANVAS_NATIVE_LIFECYCLE_PG=${baseline?'BASELINE_REPRODUCED':'PASS'} checks=${checks} KINDS=6 ACTUAL_HTTP=1 REAL_PG=1 NATIVE_RECEIPTS=${baseline?'MISSING':'CURRENT'} FILL_RECEIPT=${baseline?'PIXELS_ONLY':'ORIGINAL_PAIR'} LEDGER=UNCHANGED EXTERNAL=0`);
  }finally{await db.getPool().end();await (await import('../src/lib/imagegen/coordination-pool')).closeImageCoordinationPool();await f.cleanup();const target=path.resolve(media),base=path.resolve('output/refactor-r7b-20261029/media');assert.ok(target.startsWith(base+path.sep));await fs.rm(target,{recursive:true,force:true});console.log('NATIVE_LIFECYCLE_CLEANUP=PASS OWN_SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1 OWN_MEDIA_REMOVED=1');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
