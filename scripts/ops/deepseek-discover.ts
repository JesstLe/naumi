import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {Pool} from 'pg';
import {createCredentialReader} from '../../src/lib/model-config/credential-reader';

async function main(){
 const root=process.argv[2];assert(root?.startsWith('/tmp/deepseek-discover-'));
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,ssl:false,options:'-c default_transaction_read_only=on',connectionTimeoutMillis:5000});
 try{
  const snap=(await pool.query('SELECT v.version,v.config FROM app_model_config_state s JOIN app_model_config_versions v ON v.version=s.active_version WHERE singleton=true')).rows[0];
  const p=snap.config.providers.find((p:any)=>p.id==='apib-text');assert(p?.enabled&&p.protocol==='openai-chat'&&p.baseUrl==='https://api.apib.ai/v1'&&p.credentialRef);
  const key=await createCredentialReader(pool).read(p.credentialRef,p.id);
  const response=await fetch(p.baseUrl+'/models',{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200);const bytes=await response.text();assert(bytes.length<3*1024*1024);
  const body=JSON.parse(bytes);assert(Array.isArray(body.data));
  const models=body.data.filter((m:any)=>typeof m.id==='string'&&/deepseek/i.test(m.id));
  const evidence={method:'GET',url:p.baseUrl+'/models',providerId:p.id,authenticated:true,status:response.status,version:Number(snap.version),observedAt:new Date().toISOString(),sha256:createHash('sha256').update(bytes).digest('hex'),models};
  writeFileSync(root+'/DISCOVERY.json',JSON.stringify(evidence),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify(evidence));
 }finally{await pool.end()}
}
main().catch(e=>{console.error('DEEPSEEK_DISCOVERY_HOLD',e.code||e.name,e.message);process.exitCode=1});
