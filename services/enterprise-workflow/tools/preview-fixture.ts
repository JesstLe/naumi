/** Loopback-only acceptance fixture, NOT a login/BFF implementation. Never included in dist/service.mjs. */
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import pg from 'pg';
import { createBffAuthenticator, resolveDatabaseActor, WorkflowStore, SchedulingStore, createWorkflowServer } from '../src/server';
const name = `naumi-schedule-preview-${randomBytes(6).toString('hex')}`;
const password = randomBytes(24).toString('hex');
const docker = (args: string[]) => execFileSync('docker', args, {encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();
let started = false, pool: pg.Pool | undefined, backend: Server | undefined, front: Server | undefined;
const close = (s?: Server) => new Promise<void>(resolve => { if(!s?.listening)return resolve(); s.close(()=>resolve()); s.closeIdleConnections(); });
let stopping = false;
async function cleanup() { if(stopping)return; stopping=true; await close(front); await close(backend); await pool?.end(); if(started)docker(['rm','-f',name]); }
process.once('SIGINT',()=>{ void cleanup().then(()=>process.exit(0)); });
process.once('SIGTERM',()=>{ void cleanup().then(()=>process.exit(0)); });
try {
  const port = Number(process.argv[2] ?? '18489');
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('INVALID_LOOPBACK_PORT');
  docker(['run','-d','--name',name,'--label','naumi.fixture=schedule-preview','-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=schedule_preview','-p','127.0.0.1::5432','postgres:16-alpine']); started=true;
  let ready=false;
  for(let i=0;i<40;i++) { try{docker(['exec',name,'pg_isready','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));} }
  if(!ready)throw new Error('FIXTURE_DATABASE_NOT_READY');
  const dbPort=docker(['port',name,'5432/tcp']).split(':').at(-1);
  pool=new pg.Pool({connectionString:`postgresql://postgres:${password}@127.0.0.1:${dbPort}/schedule_preview`,max:4});
  for(const file of ['001-workflow.sql','002-scheduling.sql'])await pool.query(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  const enterpriseId=randomUUID(),teamId=randomUUID();
  await pool.query('INSERT INTO enterprise_workflow.teams(enterprise_id,team_id) VALUES($1,$2)',[enterpriseId,teamId]);
  const users=[{id:'lead',name:'陈序 · 主管',permissions:['manage','dispatch'],kinds:[]},{id:'lead2',name:'沈悦 · 主管',permissions:['dispatch'],kinds:[]},{id:'designer',name:'许知 · 设计师',permissions:['execute'],kinds:['design']}];
  for(const u of users) {
    await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject) VALUES($1,$2)',[enterpriseId,u.id]);
    await pool.query('INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds) VALUES($1,$2,$3,$4,$5)',[enterpriseId,teamId,u.id,JSON.stringify(u.permissions),JSON.stringify(u.kinds)]);
  }
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const auth=createBffAuthenticator({issuer:'fixture-bff',audience:'enterprise-workflow',publicKeys:{fixture:publicKey}});
  const schedules=new SchedulingStore(pool,resolveDatabaseActor);
  await schedules.execute({enterpriseId,teamId,subject:'lead'},{commandId:randomUUID(),teamId,expectedVersion:0,reason:'初始化隔离验收模板',action:{type:'initialize'}});
  backend=createWorkflowServer(new WorkflowStore(pool,resolveDatabaseActor,async()=>false),auth,schedules);
  backend.listen(0,'127.0.0.1');await once(backend,'listening');
  const address=backend.address();if(!address||typeof address==='string')throw new Error('NO_FIXTURE_ADDRESS');
  const html=await readFile(new URL('./fixture.html',import.meta.url));
  front=createServer(async(req,res)=>{
    try {
      if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`){res.writeHead(400);return res.end();}
      const url=new URL(req.url??'/','http://127.0.0.1');
      if(req.method==='GET'&&url.pathname==='/') {res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"});return res.end(html);}
      // Deliberately fixture-only: synthetic user picker and memory-only signing key, never production routes.
      if(req.method==='GET'&&url.pathname==='/fixture/session') {
        const user=users.find(u=>u.id===url.searchParams.get('subject'));
        if(!user){res.writeHead(400);return res.end();}
        const encode=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000);
        const data=`${encode({alg:'EdDSA',typ:'JWT',kid:'fixture'})}.${encode({iss:'fixture-bff',aud:'enterprise-workflow',sub:user.id,enterpriseId,teamId,iat:now,exp:now+180,jti:randomUUID()})}`;
        res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
        return res.end(JSON.stringify({teamId,users:users.map(u=>({id:u.id,name:u.name})),token:`${data}.${sign(null,Buffer.from(data),privateKey).toString('base64url')}`}));
      }
      if(!url.pathname.startsWith('/v1/')&&url.pathname!=='/readyz'){res.writeHead(404);return res.end();}
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>128*1024){res.writeHead(413);return res.end();}chunks.push(chunk);}
      const response=await fetch(`http://127.0.0.1:${address.port}${url.pathname}${url.search}`,{method:req.method,headers:{authorization:req.headers.authorization??'','content-type':'application/json'},...(chunks.length?{body:Buffer.concat(chunks)}:{})});
      res.writeHead(response.status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(await response.text());
    }catch{res.writeHead(500);res.end('{"error":{"code":"FIXTURE_ERROR"}}');}
  });
  front.listen(port,'127.0.0.1');await once(front,'listening');
  console.log(`FIXTURE_PREVIEW_READY: http://127.0.0.1:${port}/ database=disposable identity=synthetic persistence=postgres container=${name}`);
}catch(e){console.error(e instanceof Error?e.message:e);await cleanup();process.exitCode=1;}
