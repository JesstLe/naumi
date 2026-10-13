import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

export async function fixtureDatabase(url = process.env.DATABASE_URL || "") {
  const parsed=new URL(url);
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1"||parsed.hostname!=="127.0.0.1"||!/^\/naumi_video_fixture_[a-z0-9_]+$/.test(parsed.pathname))
    throw new Error("An explicitly isolated loopback video fixture database is required");
  const sql=new Pool({connectionString:url,ssl:false,max:5});
  try {
    const current=(await sql.query("SELECT current_database() AS name")).rows[0].name;
    if(current!==parsed.pathname.slice(1))throw new Error("Fixture database identity mismatch");
    const marked=(await sql.query("SELECT to_regclass('public.naumi_video_fixture_guard') AS name")).rows[0].name;
    if(!marked)throw new Error("Video fixture owner marker is required");
    const marker=(await sql.query("SELECT owner FROM naumi_video_fixture_guard LIMIT 1")).rows[0];
    if(marker?.owner!=="canvas-video-fusion-20261013")throw new Error("Database belongs to another task");
    return sql;
  } catch(error) {await sql.end();throw error;}
}
export async function seedVideoFixture() {
  const guard=await fixtureDatabase();await guard.end();
  const db=await import("../../src/lib/db");
  await db.ensureSchema();
  const { uploadImage }=await import("../../src/lib/storage");
  const { signUserSession }=await import("../../src/lib/native-auth");
  const root=path.resolve(process.env.VIDEO_FIXTURE_ASSETS_ROOT || "");
  const manifest=JSON.parse(await readFile(path.join(root,"manifest.json"),"utf8"));
  const accounts={a:`video-a-${randomUUID()}@example.test`,b:`video-b-${randomUUID()}@example.test`};
  for(const [id,email] of Object.entries(accounts)) {
    await db.getOrCreateUser(email,`Video fixture ${id}`);
    await db.adjustUserCredits(email,10000,"isolated video fixture",{id:randomUUID(),actor:"fixture"});
  }
  await db.setUserRole(accounts.a,"admin");
  const refs:Record<string,unknown>={};
  for(const [kind,name] of [["image","first.png"],["lastImage","last.png"],["video","landscape-4-audio.mp4"],["audio","tone-8.wav"]]) {
    const info=manifest.files.find((entry:{name:string})=>entry.name===name);
    if(!info)throw new Error(`Fixture asset missing ${name}`);
    const storageKey=`video-fixture/${randomUUID()}/${name}`;
    const url=await uploadImage(await readFile(path.join(root,name)),info.mimeType,storageKey,undefined,accounts.a);
    const id=`fixture-art-${randomUUID()}`,category=kind==="video"?"video":kind==="audio"?"audio":"main";
    await db.addArtworks(accounts.a,[{id,title:`Fixture ${kind}`,category,prompt:"original test media",status:"completed",image:url,videoUrl:category==="main"?null:url,
      gradient:"from-slate-100 to-zinc-100",style:null,ratio:info.aspectRatio||"16:9",resolution:"1K",source:"upload",origin:"canvas",parentId:null,
      width:info.width,height:info.height}],`fixture-${randomUUID()}`);
    refs[kind]={...info,id,url,storageKey};
  }
  // Cookie data is emitted only over the parent fixture's private pipe, never as test evidence.
  const cookies=Object.fromEntries(Object.entries(accounts).map(([id,email])=>[id,`nv_user=${signUserSession(email,Date.now())}`]));
  await db.getPool().end();
  return {accounts,cookies,refs};
}
if(process.argv.includes("--seed-private")) {
  if(process.env.VIDEO_FIXTURE_PARENT_PIPE!=="1")throw new Error("Private fixture seed must be started by its parent harness");
  const result=await seedVideoFixture();process.stdout.write(JSON.stringify(result));
}
