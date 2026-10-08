// Read-only inside app; print endpoint origins and presence flags, never keys.
import {createRequire} from 'node:module';
import {Socket} from 'node:net';
const require=createRequire('/app/server.js'), {Pool}=require('pg');
const db=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});
function endpoint(v){if(!v)return 'UNSET';try{const u=new URL(v);return u.origin}catch{return 'INVALID'}}
async function tcp(host,port){return new Promise(resolve=>{const s=new Socket();let finished=false;const done=v=>{if(finished)return;finished=true;s.destroy();resolve(v)};s.setTimeout(1500);s.once('connect',()=>done('OPEN'));s.once('timeout',()=>done('TIMEOUT'));s.once('error',e=>done(e.code||'ERROR'));s.connect(port,host)})}
try {
 console.log('PRIVATE_DEPENDENCY_ENV='+JSON.stringify({environment:process.env.NAUMI_ENVIRONMENT||'production',yutangBase:endpoint(process.env.YUTANG_API_BASE),yutangUserConfigured:!!process.env.YUTANG_USER,yutangPasswordConfigured:!!process.env.YUTANG_PASS,paddleBase:endpoint(process.env.PADDLE_OCR_BASE_URL),paddleKeyConfigured:!!process.env.PADDLE_OCR_API_KEY,paddleRequired:process.env.PADDLE_OCR_REQUIRED||'false',reviewBase:endpoint(process.env.REVIEW_MONITOR_BASE),scmBase:endpoint(process.env.SCM_LISTING_BASE)}));
 const sql="SELECT v.config FROM app_model_config_state s JOIN app_model_config_versions v ON v.version=s.active_version WHERE s.singleton=true";
 const row=(await db.query(sql)).rows[0];
 if(row){const c=row.config;const binding=c.bindings['vision.ocr'];console.log('OCR_MODEL_BINDING='+JSON.stringify(binding));console.log('MODEL_PROVIDER_ORIGINS='+JSON.stringify(c.providers.map(p=>({id:p.id,protocol:p.protocol,origin:endpoint(p.baseUrl),hasCredential:!!p.credentialRef}))));}
 // Only the application hard-coded Docker-host adapters, not public services.
 for(const port of [8766,3966,3967])console.log(`DOCKER_HOST_ADAPTER PORT=${port} TCP=${await tcp('host.docker.internal',port)}`);
 console.log('PRIVATE_DEPENDENCY_INSPECTION=PASS AUTH_REQUESTS=0 BUSINESS_WRITES=0 SUPPLIER_GENERATIONS=0');
}finally{await db.end()}
