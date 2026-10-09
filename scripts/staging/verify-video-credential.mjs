// Read-only: compare inherited credential and one provider catalog request. Never log keys.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,createDecipheriv} from 'node:crypto';
const require=createRequire('/app/server.js'),{Pool}=require('pg');
assert.equal(process.env.NAUMI_ENVIRONMENT,'staging');
const work=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});
const url=new URL(process.env.DATABASE_URL);url.pathname='/naumi_snapshot_reference';
const ref=new Pool({connectionString:url.toString(),ssl:false});
function decrypt(blob){const [iv,tag,ct]=blob.split('.').map(x=>Buffer.from(x,'base64'));const d=createDecipheriv('aes-256-gcm',createHash('sha256').update(process.env.SETTINGS_SECRET).digest(),iv);d.setAuthTag(tag);return Buffer.concat([d.update(ct),d.final()]).toString('utf8')}
try{
 const query="SELECT v.config FROM app_model_config_state s JOIN app_model_config_versions v ON v.version=s.active_version WHERE s.singleton=true";
 const w=(await work.query(query)).rows[0].config,r=(await ref.query(query)).rows[0].config;
 const provider=w.providers.find(p=>p.id==='video:openai-videos'),source=r.providers.find(p=>p.id===provider.id);
 assert.ok(provider&&source);assert.equal(provider.baseUrl,source.baseUrl);assert.equal(provider.credentialRef,source.credentialRef);
 const sql='SELECT key_enc FROM app_model_credentials WHERE id=$1 AND provider_id=$2';
 const wc=(await work.query(sql,[provider.credentialRef,provider.id])).rows[0].key_enc;
 const rc=(await ref.query(sql,[provider.credentialRef,provider.id])).rows[0].key_enc;
 assert.equal(wc,rc);const key=decrypt(wc);assert.ok(key);
 console.log(`STAGING_VIDEO_CREDENTIAL_COPY=PASS SOURCE_REFERENCE_IDENTICAL=1 DECRYPTED=1 ENV_EQUALS_DB=${Number(key===process.env.VIDEO_API_KEY)}`);
 const endpoint=new URL(provider.baseUrl);assert.equal(endpoint.protocol,'https:');assert.equal(endpoint.hostname,'heyroute.ai');assert.equal(endpoint.username,'');assert.equal(endpoint.password,'');endpoint.pathname=endpoint.pathname.replace(/\/$/,'')+'/v1/models';
 const response=await fetch(endpoint,{headers:{authorization:provider.options?.rawAuthorization?key:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(25000)});
 await response.body?.cancel();console.log(`STAGING_VIDEO_PROVIDER_CATALOG HTTP=${response.status} ORIGIN=https://heyroute.ai PROVIDER=${provider.id} NEW_GENERATION=0`);
 if(response.status===401||response.status===403)process.exitCode=2;else assert.equal(response.status,200);
}finally{await work.end();await ref.end()}
