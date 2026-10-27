/** R6O owner projection: real isolated PG and local pixels, no supplier. */
import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {mkdir,writeFile} from "node:fs/promises";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";

async function main(){
  const args=process.argv.slice(2),arg=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
  const baseline=args.includes("--baseline"),root=path.resolve(arg("--source-root")||"."),out=arg("--report");
  let checks=0;
  const eq=(actual:unknown,expected:unknown,label:string)=>{assert.deepEqual(actual,expected,label);checks++;};
  const f=await createModelFixture();
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1"});
  const {getPool}=await import("../src/platform/db/pool");
  try{
    const sessions=await import(pathToFileURL(path.join(root,"src/lib/agent/session-repository.ts")).href);
    const artworks=await import(pathToFileURL(path.join(root,"src/lib/artworks/repository.ts")).href);
    const {finishStoredImage}=await import(pathToFileURL(path.join(root,"src/lib/imagegen/finish-stored-image.ts")).href);
    const email="r6o-owner@fixture.test",other="r6o-other@fixture.test",id="r6o-session";
    const first=await sessions.saveAgentSession(email,id,"original",[{text:"original"}],[],null);
    const initial=await sessions.getAgentSession(email,id);
    eq(initial.title,"original","original persisted");
    eq(typeof first,baseline?"undefined":"string","exact returned revision");
    eq(typeof initial.revision,baseline?"undefined":"string","revision survives read");
    await sessions.saveAgentSession(other,id,"other",[],[],null);
    eq((await sessions.getAgentSession(other,id)).title,"other","separate owners");
    const revision=initial.revision;
    const writers=await Promise.allSettled([
      sessions.saveAgentSession(email,id,"tab-a",[{text:"a"}],[],revision),
      sessions.saveAgentSession(email,id,"tab-b",[{text:"b"}],[],revision),
    ]);
    eq(writers.filter(x=>x.status==="fulfilled").length,baseline?2:1,"concurrent writer count");
    if(!baseline){
      const conflict=writers.find(x=>x.status==="rejected") as PromiseRejectedResult;
      eq(conflict.reason.code,"AGENT_SESSION_CONFLICT","explicit conflict");
      const after=await sessions.getAgentSession(email,id);
      eq(after.revision!==revision,true,"monotonic revision");
      await sessions.renameAgentSession(email,id,"renamed");
      eq((await sessions.getAgentSession(email,id)).revision!==after.revision,true,"rename invalidates stale writer");
      await assert.rejects(sessions.saveAgentSession(email,id,"stale",[],[],after.revision),{code:"AGENT_SESSION_CONFLICT"});checks++;
    }
    const beforeDelete=await sessions.getAgentSession(email,id);
    await sessions.deleteAgentSession(email,id);
    const late=await Promise.allSettled([sessions.saveAgentSession(email,id,"late",[],[],beforeDelete.revision)]);
    eq(late[0].status,baseline?"fulfilled":"rejected","deleted session late save");
    eq(!!await sessions.getAgentSession(email,id),baseline,"deleted session resurrection");
    if(!baseline){
      await sessions.saveAgentSession(email,id,"new",[],[],null);
      await assert.rejects(sessions.saveAgentSession(email,id,"overwrite",[],[],null),{code:"AGENT_SESSION_CONFLICT"});checks++;
      await sessions.saveAgentSession(email,id,"compatibility",[],[]);
      eq((await sessions.getAgentSession(email,id)).title,"compatibility","legacy caller retains unconditional save");
      await f.sql.query(`INSERT INTO app_artworks(id,email,title,category,prompt,status,gradient,image_url,video_url) VALUES
        ('r6o-own',$1,'own','main','','completed','','/media/own.png','/media/own.mp4'),
        ('r6o-other',$2,'other','main','','completed','','/media/other.png',NULL),
        ('r6o-deleted',$1,'deleted','main','','completed','','/media/deleted.png',NULL)`,[email,other]);
      await f.sql.query("UPDATE app_artworks SET deleted_at=now() WHERE id='r6o-deleted'");
      eq((await artworks.knownAgentMedia(email,["/media/own.png","/media/own.mp4","/media/own.png","/media/other.png","/media/deleted.png","https://unowned.invalid/a"])).sort(),["/media/own.mp4","/media/own.png"],"owned nondeleted historical media only");
    }
    const source=await sharp({create:{width:16,height:16,channels:3,background:"white"}}).png().toBuffer();
    const mapped=await finishStoredImage(source,{final:false,preset:false,resolution:"2K",imageParameterPlanVersion:1});
    eq((await sharp(mapped).metadata()).width,baseline?2048:16,"mapped result not implicitly upscaled");
    if(!baseline)eq(mapped.equals(source),true,"mapped bytes exact");
    const legacy=await finishStoredImage(source,{final:false,preset:false,resolution:"2K"});
    eq((await sharp(legacy).metadata()).width,2048,"legacy resize retained");
    const framed=await finishStoredImage(source,{final:false,preset:false,resolution:"2K",imageParameterPlanVersion:1,targetWidth:32,targetHeight:16});
    eq([(await sharp(framed).metadata()).width,(await sharp(framed).metadata()).height],[32,16],"explicit frame retained");
    eq((await finishStoredImage(source,{final:true,preset:false,resolution:"2K"})).equals(source),true,"final checkpoint untouched");
    eq((await finishStoredImage(source,{final:false,preset:true,resolution:"2K"})).equals(source),true,"preset unchanged");
    const result={status:baseline?"BASELINE_REPRODUCED":"PASS",checks,projection:["agent/session-repository.ts","artworks/repository.ts","imagegen/finish-stored-image.ts"],dependencies:"current-checkout",realPG:true,realPixels:true,supplierCalls:0,root};
    if(out){await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+"\n");}
    console.log(`REFACTOR_MAIN_SYNC=${result.status} CHECKS=${checks} SESSION_CAS=${baseline?"ABSENT":"PASS"} DELETE_RESURRECTION=${baseline?"REPRODUCED":"PREVENTED"} MAPPED_PIXELS=${baseline?2048:16} LEGACY_PIXELS=2048 REAL_PG=1 REAL_PIXELS=1 PROJECTION=THREE_OWNERS SUPPLIER=0`);
  }finally{await getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
