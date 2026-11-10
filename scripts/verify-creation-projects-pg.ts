import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPool } from "../src/platform/db/pool";
import { ensureSchema } from "../src/lib/persistence/schema";
import { getOrCreateUser } from "../src/lib/accounts/session";
import { signUserSession } from "../src/lib/native-auth";
import { GET } from "../src/app/api/canvas/projects/route";

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");assert.match(process.env.DATABASE_URL||"",/127\.0\.0\.1:15432\/naumi_home_fixture/);
 await ensureSchema();const tag=randomUUID(),actor=`home-${tag}@example.test`,other=`other-${tag}@example.test`;
 await getOrCreateUser(actor,"Home acceptance");await getOrCreateUser(other,"Other account");
 const pool=getPool(),request=(email?:string,query="")=>new Request('http://127.0.0.1:3018/api/canvas/projects'+query,{headers:email?{cookie:'nv_user='+signUserSession(email,Date.now()),'x-naumi-workspace':'personal'}:{}});
 const key='tree:'+tag,otherKey='tree:other-'+tag;
 await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,source_url,group_id,origin,gradient) VALUES($1,$2,'Own project','main','PRIVATE_PROMPT_SENTINEL','completed','/media/own.webp','canvas-add',$1,'canvas',''),($3,$4,'Other private project','main','OTHER_PRIVATE_PROMPT','completed','/media/other.webp','canvas-add',$3,'canvas','')",[tag,actor,'other-'+tag,other]);
 await pool.query("INSERT INTO app_project_names(email,key,name) VALUES($1,$2,'咖啡机画布')",[actor,key]);
 const checks:string[]=[];
 const check=(name:string,value:boolean)=>{assert.ok(value,name);checks.push(name);};
 check('anonymous denied',(await GET(request())).status===401);
 const response=await GET(request(actor)),data=await response.json();
 check('own real project visible',response.status===200&&data.projects.some((p:any)=>p.projectKey===key&&p.name==='咖啡机画布'));
 check('other account hidden',!data.projects.some((p:any)=>p.projectKey===otherKey));
 check('no prompt or node payload',!JSON.stringify(data).includes('PRIVATE_PROMPT')&&data.projects.every((p:any)=>Object.keys(p).sort().join(',')==='cover,name,projectKey,updatedAt'));
 check('private cache',response.headers.get('cache-control')==='private, no-store');
 const forged=await (await GET(request(actor,'?email='+encodeURIComponent(other)))).json();check('query actor cannot override cookie',!forged.projects.some((p:any)=>p.projectKey===otherKey));
 await pool.query("INSERT INTO app_feature_access(email,mode,allowed,version) VALUES($1,'custom','[]'::jsonb,1)",[other]);
 check('feature denied',(await GET(request(other))).status===403);
 console.log('CREATION_PROJECTS_PG='+JSON.stringify({status:'PASS',checks:checks.length,names:checks,providerCalls:0}));
 await pool.query('DELETE FROM app_artworks WHERE email=ANY($1::text[])',[[actor,other]]);await pool.query('DELETE FROM app_project_names WHERE email=$1',[actor]);await pool.query('DELETE FROM app_feature_access WHERE email=$1',[other]);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>getPool().end());
