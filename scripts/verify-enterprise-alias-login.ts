/** Run only against an isolated imported database copy; never starts App/Worker. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {POST} from '../src/app/api/auth/login/route';
import {getPool} from '../src/lib/db';
import {verifyUserSession} from '../src/lib/native-auth';
import {enterpriseSnapshot} from '../src/lib/enterprise/server';
async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
  assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
  const manifest=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const password=JSON.parse(readFileSync(0,'utf8')).password;
  let passed=0;
  for(const [index,email] of manifest.created.entries()){
    const alias=email.slice(0,email.lastIndexOf('@'));
    const response=await POST(new Request('http://fixture.local/api/auth/login',{method:'POST',headers:{'content-type':'application/json','x-real-ip':`10.99.0.${index+1}`},body:JSON.stringify({email:alias,password})}));
    assert.equal(response.status,200,alias+' native login');
    const body=await response.json();assert.equal(body.ok,true);assert.equal(body.user.email,email);
    assert.equal(body.user.creditsTotal,99999);
    const cookie=response.headers.get('set-cookie')!;
    assert(cookie.includes('HttpOnly')&&cookie.toLowerCase().includes('samesite=lax'));
    const token=cookie.match(/nv_user=([^;]+)/)![1];assert.equal(verifyUserSession(decodeURIComponent(token),Date.now()),email);
    passed++;
  }
  const first=manifest.created[0];
  const wrong=await POST(new Request('http://fixture.local/api/auth/login',{method:'POST',headers:{'content-type':'application/json','x-real-ip':'10.98.0.1'},body:JSON.stringify({email:first,password:password+'-wrong'})}));assert.equal(wrong.status,401);
  const snapshot=await enterpriseSnapshot({email:manifest.owner,admin:false},manifest.enterpriseId);
  for(const email of [...manifest.created,...manifest.linkedExisting])assert(snapshot.members.some(m=>m.email===email),'Owner sees imported enterprise member');
  await assert.rejects(()=>enterpriseSnapshot({email:first,admin:false},manifest.enterpriseId),/当前岗位没有企业管理权限/);
  console.log(`NATIVE_LOGIN_HTTP_200=${passed}; SESSION_IDENTITY=PASS; WRONG_PASSWORD_HTTP=401; OWNER_VISIBILITY=PASS; EMPLOYEE_PRIVILEGES=NO_MANAGEMENT; PROVIDER_CALLS=0`);
  await getPool().end();
}
main().catch(e=>{console.error('LOGIN_TEST_ERROR='+String(e));process.exitCode=1});
