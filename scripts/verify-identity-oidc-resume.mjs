/** Isolated PG + real oidc-provider HTTP fixture; never authenticates production users. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {generateKeyPairSync,randomBytes,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import Provider from 'oidc-provider';
import pg from 'pg';
import {transform} from 'esbuild';
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
const dsn=new URL(process.env.DATABASE_URL);assert.equal(dsn.hostname,'127.0.0.1');assert.match(dsn.pathname,/fixture/);
const sourcePath=path.resolve(process.argv[2]||'src/lib/enterprise/identity/oidc.ts');
const output=path.resolve(process.env.IDENTITY_RESUME_EVIDENCE||'output/identity-oidc-resume-fixture');await mkdir(output,{recursive:true});
const schema='resume_'+randomUUID().replaceAll('-','');const admin=new pg.Pool({connectionString:dsn.href,max:1});
await admin.query('CREATE SCHEMA '+schema);
const pool=new pg.Pool({connectionString:dsn.href,options:'-c search_path='+schema,max:4});globalThis[Symbol.for('identity.resume.fixture.pool')]=pool;
await pool.query(`CREATE TABLE app_identity_oidc_store(model text NOT NULL,id text NOT NULL,payload jsonb NOT NULL,grant_id text,uid text,user_code text,expires_at timestamptz NOT NULL,PRIMARY KEY(model,id))`);
const source=await readFile(sourcePath,'utf8');const start=source.indexOf('class IdentityAdapter {'),end=source.indexOf('\nexport async function oidcAccount(',start);assert.ok(start>=0&&end>start);
const extracted=`import {errors} from 'oidc-provider';\nconst getPool=()=>globalThis[Symbol.for('identity.resume.fixture.pool')];\n${source.slice(start,end)}\nexport default IdentityAdapter;\n`;
const compiled=await transform(extracted,{loader:'ts',format:'esm',target:'node24'});
// Keep generated module beside this script so package resolution stays in the same fixture deps.
const moduleFile=path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1')),'oidc-adapter-fixture-'+randomUUID()+'.mjs');
await writeFile(moduleFile,compiled.code);const {default:Adapter}=await import(pathToFileURL(moduleFile));
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const jwks={keys:[{...privateKey.export({format:'jwk'}),kid:'fixture-only',use:'sig',alg:'RS256'}]};
let provider,nativeAccount='fixture-A';const events=[],requests=[];
const server=createServer(async(req,res)=>{
 try {
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname.startsWith('/api/identity-interaction/')){
   const details=await provider.interactionDetails(req,res);assert.equal(details.uid,u.pathname.split('/').at(-1));
   if(details.prompt.name==='login')return await provider.interactionFinished(req,res,{login:{accountId:nativeAccount}},{mergeWithLastSubmission:false});
   if(details.prompt.name==='consent'){
    assert.equal(details.session.accountId,nativeAccount);
    const grant=details.grantId?await provider.Grant.find(details.grantId):new provider.Grant({accountId:nativeAccount,clientId:'fixture-client'});
    assert.ok(grant);if(details.prompt.details.missingOIDCScope)grant.addOIDCScope(details.prompt.details.missingOIDCScope.join(' '));
    if(details.prompt.details.missingOIDCClaims)grant.addOIDCClaims(details.prompt.details.missingOIDCClaims);
    return await provider.interactionFinished(req,res,{consent:{grantId:await grant.save()}},{mergeWithLastSubmission:true});
   }
   throw Error('UNEXPECTED_FIXTURE_PROMPT');
  }
  req.originalUrl=req.url;req.url=(req.url||'/').replace(/^\/api\/identity(?=\/|\?|$)/,'')||'/';
  return await provider.callback()(req,res);
 }catch(e){res.statusCode=500;res.end(e.name+': '+e.message);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
provider=new Provider(origin+'/api/identity',{adapter:Adapter,jwks,cookies:{keys:['fixture-only-long-cookie-signing-key-0000000'],short:{httpOnly:true,sameSite:'lax',secure:false},long:{httpOnly:true,sameSite:'lax',secure:false}},clients:[{client_id:'fixture-client',client_secret:'fixture-only-client-secret-00000000000000',redirect_uris:['https://consumer.fixture/api/auth/central/callback'],response_types:['code'],grant_types:['authorization_code'],token_endpoint_auth_method:'client_secret_basic'}],features:{devInteractions:{enabled:false}},pkce:{required:()=>true},interactions:{url:(_ctx,i)=>origin+'/api/identity-interaction/'+i.uid},scopes:['openid','profile'],claims:{openid:['sub'],profile:['name']},async findAccount(_ctx,id){return {accountId:id,claims:async()=>({sub:id,name:id})};}});
provider.on('interaction.started',(_ctx,p)=>events.push('interaction:'+p.name));provider.on('grant.revoked',()=>events.push('grant:revoked'));
class Jar{
 rows=[];
 store(headers,url){for(const raw of headers.getSetCookie()){
  const [kv,...rest]=raw.split(';').map(x=>x.trim());const at=kv.indexOf('=');const name=kv.slice(0,at),value=kv.slice(at+1);const attrs=Object.fromEntries(rest.map(x=>{const i=x.indexOf('=');return i<0?[x.toLowerCase(),true]:[x.slice(0,i).toLowerCase(),x.slice(i+1)];}));
  const p=attrs.path||new URL(url).pathname.replace(/\/[^/]*$/,'/')||'/';const key=name+'|'+p;this.rows=this.rows.filter(x=>x.key!==key);
  if(value&&attrs['max-age']!=='0'&&!(attrs.expires&&Date.parse(attrs.expires)<Date.now()))this.rows.push({key,name,value,path:p,secure:!!attrs.secure});
  requests.push({cookie:name,path:p,httpOnly:!!attrs.httponly,sameSite:attrs.samesite||null,secure:!!attrs.secure});
 }}
 header(url){const u=new URL(url);return this.rows.filter(x=>(u.pathname===x.path||u.pathname.startsWith(x.path.endsWith('/')?x.path:x.path+'/'))&&(!x.secure||u.protocol==='https:')).sort((a,b)=>b.path.length-a.path.length).map(x=>x.name+'='+x.value).join('; ');}
}
const jar=new Jar();const issued=new Map();
async function flow(expectedAccount){
 const state=randomBytes(20).toString('base64url');const query=new URLSearchParams({client_id:'fixture-client',redirect_uri:'https://consumer.fixture/api/auth/central/callback',response_type:'code',scope:'openid profile',state,nonce:randomBytes(20).toString('base64url'),code_challenge:randomBytes(32).toString('base64url'),code_challenge_method:'S256',max_age:'0'});
 let url=origin+'/api/identity/auth?'+query,method='GET',body;const chain=[];
 for(let i=0;i<20;i++){
  const response=await fetch(url,{redirect:'manual',method,body,headers:{cookie:jar.header(url),...(body?{'content-type':'application/x-www-form-urlencoded'}:{})}});jar.store(response.headers,url);const text=await response.text();
  chain.push({path:new URL(url).pathname.replace(/\/[A-Za-z0-9_-]{20,}$/,'/<uid>'),method,status:response.status});
  if(response.status>=400)return {ok:false,error:text.includes('interaction session not found')?'interaction session not found':text.slice(0,120),chain};
  const loc=response.headers.get('location');
  if(loc){const target=new URL(loc,url);if(target.origin==='https://consumer.fixture'){
   assert.equal(target.searchParams.get('state'),state);assert.ok(target.searchParams.get('code'));assert.ok(!target.searchParams.has('error'));
   const codeId=target.searchParams.get('code');const code=await provider.AuthorizationCode.find(codeId);assert.equal(code.accountId,expectedAccount);issued.set(expectedAccount,{codeId,grantId:code.grantId});
   return {ok:true,account:expectedAccount,chain};
  }url=target.href;method='GET';body=undefined;continue;}
  const form=text.match(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/);
  if(form){const fields=[...form[2].matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/g)].map(m=>[m[1],m[2]]);assert.ok(fields.length);url=new URL(form[1].replaceAll('&amp;','&'),url).href;method='POST';body=new URLSearchParams(fields).toString();continue;}
  throw Error('UNEXPECTED_NON_REDIRECT_FIXTURE_RESPONSE');
 }
 throw Error('FIXTURE_REDIRECT_LIMIT');
}
let exit=0;
try{
 const first=await flow('fixture-A');assert.equal(first.ok,true,'first account fixture must succeed');
 nativeAccount='fixture-B';const switched=await flow('fixture-B');
 // Model-specific revocation must not remove resumable interaction or other principals' grants.
 const revoked=events.includes('grant:revoked');assert.equal(revoked,true);
 const result={fixture:true,realLibrary:'oidc-provider@9.15.0',persistence:'isolated-postgresql',first,switched,oldGrantRevocationObserved:revoked,cookieAttributes:requests,productionAccountsUsed:0};
 await writeFile(path.join(output,'RESULT.json'),JSON.stringify(result,null,2));
 if(!switched.ok){console.log('ACCOUNT_SWITCH_FAILED='+switched.error);exit=1;}else {
  assert.equal(await provider.AuthorizationCode.find(issued.get('fixture-A').codeId),undefined);
  assert.equal(await provider.Grant.find(issued.get('fixture-A').grantId),undefined);
  assert.notEqual(issued.get('fixture-B').grantId,issued.get('fixture-A').grantId);
  const models=['AccessToken','AuthorizationCode','RefreshToken','DeviceCode','BackchannelAuthenticationRequest','PreAuthorizedCode'];
  for(const model of [...models,'Interaction','Session','Grant'])await new Adapter(model).upsert('fixture-'+model,{grantId:'fixture-scope',value:model},120);
  await new Adapter('AccessToken').revokeByGrantId('fixture-scope');
  assert.equal(await new Adapter('AccessToken').find('fixture-AccessToken'),undefined);
  for(const model of [...models.slice(1),'Interaction','Session','Grant'])assert.ok(await new Adapter(model).find('fixture-'+model));
  for(const model of models.slice(1))await new Adapter(model).revokeByGrantId('fixture-scope');
  for(const model of models)assert.equal(await new Adapter(model).find('fixture-'+model),undefined);
  for(const model of ['Interaction','Session','Grant'])assert.ok(await new Adapter(model).find('fixture-'+model));
  console.log('PASS persistent OIDC account switch A->B; resume cookie paths; old grant revoked; new account callback bound');
  console.log('PASS model-scoped revocation: all 6 credential models revoked through their adapters; Interaction/Session preserved; Grant remains explicit destroy');
 }
}finally{
 server.closeAllConnections();await new Promise(r=>server.close(r));await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();delete globalThis[Symbol.for('identity.resume.fixture.pool')];
}
process.exitCode=exit;
