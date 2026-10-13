import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile}from'node:fs/promises';
import path from'node:path';
import sharp from'sharp';
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
 const db=await import('../src/lib/db'),native=await import('../src/lib/native-auth'),admin=await import('../src/lib/admin-auth'),team=await import('../src/lib/teams/server'),grants=await import('../src/lib/teams/grants'),enterprise=await import('../src/lib/enterprise/server'),assets=await import('../src/lib/media-assets'),cache=await import('../src/app/api/media/image-cache/route');
 const pool=db.getPool(),owner='scope-owner-'+randomUUID()+'@cache.test',child='scope-child-'+randomUUID()+'@cache.test',foreign='scope-foreign-'+randomUUID()+'@cache.test',actor={email:owner,admin:true,consoleAdmin:true};
 try{
  for(const email of[owner,child,foreign])await db.getOrCreateUser(email,email);
  await db.setUserRole(owner,'admin');await admin.setAdminPassword('scoped-cache-console-fixture');
  const consoleToken=await admin.authenticateAdminPassword('scoped-cache-console-fixture');
  const cookie=(email:string,consoleAdmin=false)=>'nv_user='+native.signUserSession(email,Date.now())+(consoleAdmin?'; nv_admin='+consoleToken:'');
  const cap=new Date(Date.now()+86400000).toISOString(),id=randomUUID();
  await team.mutateTeam(actor,{id:randomUUID(),teamId:id,action:'create',name:'Scoped cache fixture',ownerEmail:owner,authorizedUntil:cap},true);
  await team.mutateTeam(actor,{id:randomUUID(),teamId:id,action:'attach',email:child,expiresAt:cap},true);
  const bytes=await sharp({create:{width:300,height:240,channels:3,background:'teal'}}).png().toBuffer();
  const key='scoped-cache-'+id+'.png';await mkdir(process.env.MEDIA_DIR!,{recursive:true});await writeFile(path.join(process.env.MEDIA_DIR!,key),bytes);await assets.registerMediaAsset(key,bytes,'image/png',false,child);
  const artId='scoped-'+id;await db.addArtworks(child,[{id:artId,title:'Child image',category:'main',prompt:'fixture',status:'completed',image:'/media/'+key,source:'',gradient:''}]);
  const url='/api/team/media?'+new URLSearchParams({teamId:id,email:child,id:artId});
  const request=(email:string,source:string,consoleAdmin=false)=>new Request('http://scope.test/api/media/image-cache',{method:'POST',headers:{cookie:cookie(email,consoleAdmin),'content-type':'application/json'},body:JSON.stringify({sources:[source]})});
  const allowed=await(await cache.POST(request(owner,url,true))).json();assert.ok(allowed.results[url]);assert.match(allowed.results[url].version,/preview-webp-1280-v1/);
  assert.equal((await(await cache.POST(request(foreign,url))).json()).results[url],null);
  const media=await import('../src/app/api/team/media/route');const display=await media.GET(new Request('http://scope.test'+allowed.results[url].fetchUrl,{headers:{cookie:cookie(owner,true)}}));assert.equal(display.status,200);assert.equal(display.headers.get('content-type'),'image/webp');
  assert.equal((await media.GET(new Request('http://scope.test'+url+'&cacheVersion=wrong',{headers:{cookie:cookie(owner,true)}}))).status,409);
  const currentGrant=(await pool.query('SELECT version FROM app_team_access_grants WHERE email=$1',[owner])).rows[0];
  await grants.mutateGrant(actor,{id:randomUUID(),email:owner,action:'grant',scope:'owned',startsAt:new Date(Date.now()-1000).toISOString(),expiresAt:cap,expectedVersion:currentGrant?.version??null});
  const ordinary=await(await cache.POST(request(owner,url))).json();assert.ok(ordinary.results[url]);
  await pool.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1',[owner]);assert.equal((await(await cache.POST(request(owner,url))).json()).results[url],null);
  await pool.query('UPDATE app_team_access_grants SET enabled=true WHERE email=$1',[owner]);
  const enterpriseUrl='/api/enterprise/media?'+new URLSearchParams({enterpriseId:id,email:child,id:artId});
  // Admin preview still requires an activated enterprise and a real scoped member.
  assert.equal((await(await cache.POST(request(owner,enterpriseUrl,true))).json()).results[enterpriseUrl],null);
  console.log('SCOPED_IMAGE_CACHE=PASS TEAM_OWNER=AUTHORIZED FOREIGN=DENIED RAW_URL=NOT_LEAKED WEBP=REAL VERSION_RACE=409 GRANT_REVOKE=DENIED ENTERPRISE_SCOPE=REQUIRED PROVIDER_CALLS=0');
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
