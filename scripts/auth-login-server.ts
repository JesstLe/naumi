/** Minimal production wrapper around the real login route. No worker/Agent/media paths. */
import http from 'node:http';
import {POST} from '../src/app/api/auth/login/route';
import {getPool,ensureSchema} from '../src/lib/db';
import {ensureLoginGuardSchema} from '../src/lib/auth-login-limit';
import {settingsSecret} from '../src/lib/settings-secret';
const source=process.env.SOURCE_COMMIT||'',port=Number(process.env.PORT||3000);
async function main(){
 if(process.env.NAUMI_AUTH_LOGIN_ONLY!=='1'||process.env.NAUMI_VIDEO_WORKER!=='0'||!/^[a-f0-9]{40}$/.test(source))throw Error('AUTH_LOGIN_RUNTIME_CONFIG');
 settingsSecret();await ensureSchema();await ensureLoginGuardSchema(getPool());
 await getPool().query('SELECT email,password_hash,banned,account_expires_at,auth_revoked_before,management_version FROM app_users LIMIT 0');
 await getPool().query('SELECT email,remaining,expires_at FROM app_credit_batches LIMIT 0');
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  try{
   if(req.method==='GET'&&req.url==='/api/ready'){
    await getPool().query('SELECT 1');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,service:'auth-login',source}));return;
   }
   if(req.method!=='POST'||req.url!=='/api/auth/login'){res.statusCode=404;res.end();return;}
   let size=0;const chunks:Buffer[]=[];
   for await(const chunk of req){size+=chunk.length;if(size>8192){res.statusCode=413;res.end(JSON.stringify({error:'请求过大'}));return;}chunks.push(Buffer.from(chunk));}
   const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
   const request=new Request('http://auth-login/api/auth/login',{method:'POST',headers,body:Buffer.concat(chunks)});
   const response=await POST(request);res.statusCode=response.status;
   for(const [key,value] of response.headers)if(key.toLowerCase()!=='set-cookie')res.setHeader(key,value);
   const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
   res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'登录服务暂不可用，请稍后重试'}));}
 });
 server.headersTimeout=10_000;server.requestTimeout=20_000;server.keepAliveTimeout=5000;server.listen(port,'0.0.0.0',()=>console.log('AUTH_LOGIN_READY=1 SOURCE='+source));
 const close=()=>{server.close(()=>{void getPool().end().then(()=>process.exit(0));});};process.on('SIGTERM',close);process.on('SIGINT',close);
}
main().catch(()=>{console.error('AUTH_LOGIN_STARTUP=FAILED');process.exitCode=1;});
