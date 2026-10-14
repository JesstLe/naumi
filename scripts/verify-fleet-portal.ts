import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
async function command(args:string[]){return new Promise<string>((resolve,reject)=>{const p=spawn('docker',args,{stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>out+=b);p.on('error',reject);p.on('close',code=>code===0?resolve(out.trim()):reject(Error(out)));});}
async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');const database=new URL(process.env.DATABASE_URL!);assert.equal(database.hostname,'127.0.0.1');
  Object.assign(process.env,{FLEET_CONTROL_ENABLED:'1',NAUMI_MULTI_USER:'1',NAUMI_VIDEO_WORKER:'0',SETTINGS_SECRET:'fleet-portal-settings-012345678901234567890',VIDEO_WORKER_SECRET:'fleet-portal-worker-012345678901234567890'});
  const db=await import('../src/lib/db'),auth=await import('../src/lib/admin-auth'),native=await import('../src/lib/native-auth'),fleet=await import('../src/lib/fleet/server');
  await auth.setAdminPassword('fleet-portal-fixture-password');const cookie=await auth.authenticateAdminPassword('fleet-portal-fixture-password');assert.ok(cookie);await db.getOrCreateUser('ordinary@portal.test');await fleet.createInstance('fixture','103 主站','main');
  const beforeUsers=(await db.getPool().query('SELECT row_to_json(u) AS row FROM app_users u ORDER BY email')).rows;
  const tag='naumi-fleet-portal-'+randomUUID().slice(0,8),app=tag+'-app',gateway=tag+'-gateway',out=path.resolve('output/fleet-portal');await fs.mkdir(out,{recursive:true});database.hostname='host.docker.internal';
  let browser;
  try{
    await command(['network','create','--label','io.naumi.fixture='+tag,tag]);
    const env={DATABASE_URL:database.toString(),SETTINGS_SECRET:process.env.SETTINGS_SECRET!,VIDEO_WORKER_SECRET:process.env.VIDEO_WORKER_SECRET!,NAUMI_MULTI_USER:'1',NAUMI_VIDEO_WORKER:'0',FLEET_CONTROL_ENABLED:'1',FLEET_PORTAL_ONLY:'1',FLEET_RELEASE_DISPATCH_ENABLED:'0',STORAGE_DRIVER:'local'};
    await command(['run','-d','--name',app,'--network',tag,'--network-alias','portal','--label','io.naumi.fixture='+tag,'--memory','512m','--cpus','1',...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),process.env.FLEET_PORTAL_IMAGE||'naumi-fleet-portal:64ef26d']);
    await command(['run','-d','--name',gateway,'--network',tag,'--label','io.naumi.fixture='+tag,'-p','127.0.0.1::80','nginx:1.27-alpine']);
    const conf=path.join(out,'gateway-'+tag+'.conf');await fs.writeFile(conf,`server { listen 80; client_max_body_size 64k; location /fleet-assets/_next/ { proxy_pass http://portal:3000/_next/; proxy_set_header Host $host; } location / { proxy_pass http://portal:3000; proxy_set_header Host $http_host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Real-IP $remote_addr; proxy_set_header CF-Connecting-IP ""; } }`);
    await command(['cp',conf,gateway+':/etc/nginx/conf.d/default.conf']);await command(['exec',gateway,'nginx','-t']);await command(['exec',gateway,'nginx','-s','reload']);
    const port=(await command(['port',gateway,'80/tcp'])).split(':').at(-1),origin='http://127.0.0.1:'+port;
    for(let i=0;i<60;i++){try{if((await fetch(origin+'/api/version')).status===200)break;}catch{}await new Promise(r=>setTimeout(r,500));}
    assert.equal((await fetch(origin+'/api/admin/fleet')).status,401);
    for(const [method,url] of [['POST','/api/generate-image'],['POST','/api/imagegen'],['POST','/api/canvas/assistant'],['POST','/api/auth/register'],['GET','/canvas'],['GET','/admin'],['GET','/api/fleet/not-allowed']])assert.equal((await fetch(origin+url,{method,headers:{'content-type':'application/json'},...(method==='POST'?{body:'{}'}:{})})).status,404,url);
    assert.equal((await fetch(origin+'/api/fleet/poll',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,400);
    browser=await chromium.launch({headless:true,executablePath:process.env.FLEET_CHROMIUM});const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'nv_admin',value:cookie,url:origin}]);const page=await context.newPage(),errors:string[]=[],assets:number[]=[],requestPaths:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requestPaths.push(new URL(r.url()).pathname));page.on('response',r=>{if(r.url().includes('/fleet-assets/_next/'))assets.push(r.status());});
    await page.goto(origin+'/admin/deployments');await page.getByRole('heading',{name:'部署管理',exact:true}).waitFor();await page.getByRole('button',{name:/103 主站/}).click();
    await page.getByRole('textbox',{name:'实例名称',exact:true}).fill('47 企业接入');const created=page.waitForResponse(r=>r.url().endsWith('/api/admin/fleet')&&r.status()===201);await page.getByRole('button',{name:'注册实例',exact:true}).click();const id=(await(await created).json()).id;await page.getByRole('button',{name:'已保存，关闭',exact:true}).click();
    await page.getByRole('button',{name:'查询用户',exact:true}).click();await page.getByText('待执行',{exact:true}).waitFor();assert.equal((await db.getPool().query('SELECT state FROM app_fleet_commands WHERE instance_id=$1',[id])).rows[0].state,'queued');
    assert.ok(assets.length>2);assert.ok(assets.every(s=>s===200));assert.equal(requestPaths.some(p=>p.startsWith('/_next/static/')),false);assert.equal(errors.length,0,errors.join('\n'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:path.join(out,'portal-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:path.join(out,'portal-mobile.png'),fullPage:true});
    const ordinary=await browser.newContext();await ordinary.addCookies([{name:'nv_user',value:native.signUserSession('ordinary@portal.test',Date.now()),url:origin}]);assert.equal((await ordinary.request.get(origin+'/api/admin/fleet')).status(),403);await ordinary.close();
    const inspector=JSON.parse(await command(['inspect',app]))[0];assert.equal(inspector.Config.User,'node');assert.ok(inspector.HostConfig.Memory<=512*1024*1024);await fs.writeFile(path.join(out,'runtime-results.json'),JSON.stringify({imageId:inspector.Image,nonroot:true,staticRequests:assets.length,staticErrors:assets.filter(s=>s!==200).length,pageErrors:errors.length,queuedNotExecuted:true,ordinaryDenied:true,productionWrites:0},null,2));
    assert.deepEqual((await db.getPool().query('SELECT row_to_json(u) AS row FROM app_users u ORDER BY email')).rows,beforeUsers);
    console.log('FLEET_PORTAL=PASS ACTUAL_LINUX_NEXT=1 NONROOT=1 NGINX_NAMESPACE=1 STATIC_ERRORS=0 ANON_DENIED=1 ORDINARY_DENIED=1 GENERATION_ROUTES_DENIED=1 REGISTER=1 QUEUE_ONLY=1 DESKTOP1440=1 MOBILE390=1 OVERFLOW=0 PAGEERROR=0 PRODUCTION_WRITES=0');
  }finally{if(browser)await browser.close();for(const name of [gateway,app]){try{const data=JSON.parse(await command(['inspect',name]))[0];if(data.Config.Labels['io.naumi.fixture']===tag)await command(['rm','-f',name]);}catch{}}await command(['network','rm',tag]).catch(()=>{});await db.getPool().end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
