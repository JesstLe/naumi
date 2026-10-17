/** Disposable source + workflow DB fixture; no fixture login/control enters product code. */
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import type {Pool} from 'pg';
export async function workspacePreview(pool:Pool,m:{source:{root:string;foreign:string;ordinary:string;owner:string};enterpriseId:string;teamId:string}){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL!).hostname!=='127.0.0.1')throw Error('ISOLATED_FIXTURE_REQUIRED');
 const {GET,POST}=await import('../src/app/api/enterprise/workflow/route');const {GET:html}=await import('../src/app/enterprise/workflow/route');const files=await import('../src/app/api/enterprise/workflow/files/route');const native=await import('../src/lib/native-auth');
 const secondTeam=randomUUID(),secondTenant=randomUUID(),secondSource=randomUUID(),thirdTeam=randomUUID();
 await pool.query("UPDATE enterprise_workflow.team_members SET permissions='[\"manage\",\"request\",\"dispatch\",\"review\"]' WHERE enterprise_id=$1 AND subject='provisioner'",[m.enterpriseId]);
 await pool.query('UPDATE enterprise_workflow.source_identities SET enabled=true WHERE enterprise_id=$1',[m.enterpriseId]);
 await pool.query("UPDATE enterprise_workflow.team_members SET permissions='[\"request\",\"execute\"]' WHERE enterprise_id=$1 AND subject='worker'",[m.enterpriseId]);
 await pool.query("UPDATE enterprise_workflow.teams SET name='品牌设计一组' WHERE enterprise_id=$1 AND team_id=$2",[m.enterpriseId,m.teamId]);
 await pool.query("INSERT INTO enterprise_workflow.teams(enterprise_id,team_id,name)VALUES($1,$2,'品牌设计二组'),($3,$4,'第二企业设计组')",[m.enterpriseId,secondTeam,secondTenant,thirdTeam]);
 await pool.query("INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds)VALUES($1,$2,'worker','[\"request\"]','[]')",[m.enterpriseId,secondTeam]);
 await pool.query("INSERT INTO app_team_access_grants(email,scope,created_by,updated_by)VALUES($1,'owned','fixture','fixture')",[m.source.ordinary]);
 await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until)VALUES($1,'第二企业 · 合成验收',$2,now()+interval '30 days')",[secondSource,m.source.ordinary]);await pool.query('INSERT INTO app_enterprise_settings(team_id)VALUES($1)',[secondSource]);
 await pool.query("INSERT INTO enterprise_workflow.accounts(enterprise_id,subject)VALUES($1,'second-worker')",[secondTenant]);
 await pool.query("INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds)VALUES($1,$2,'second-worker','[\"request\"]','[]')",[secondTenant,thirdTeam]);
 await pool.query("INSERT INTO enterprise_workflow.source_enterprises(source_instance,source_enterprise,enterprise_id)VALUES('fixture-source-a',$1,$2)",[secondSource,secondTenant]);
 await pool.query("INSERT INTO enterprise_workflow.source_identities(source_instance,source_enterprise,enterprise_id,source_subject,subject)VALUES('fixture-source-a',$1,$2,$3,'second-worker')",[secondSource,secondTenant,m.source.ordinary]);
 const db=await import('../src/lib/db');
 for(const [subject,email,kind,nickname] of [['designer-b','designer-b@fixture.invalid','design','合成设计乙'],['artist','artist@fixture.invalid','artwork','合成美工']]){
  await db.getOrCreateUser(email,nickname);await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment)VALUES($1,$2,$3,NULL,'permanent')",[m.source.root,email,m.source.owner]);
  await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject)VALUES($1,$2)',[m.enterpriseId,subject]);await pool.query("INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds)VALUES($1,$2,$3,'[\"execute\"]',$4)",[m.enterpriseId,m.teamId,subject,JSON.stringify([kind])]);
  await pool.query("INSERT INTO enterprise_workflow.source_identities(source_instance,source_enterprise,enterprise_id,source_subject,subject)VALUES('fixture-source-a',$1,$2,$3,$4)",[m.source.root,m.enterpriseId,email,subject]);
  await pool.query("INSERT INTO enterprise_workflow.person_profiles(enterprise_id,person_id,real_name,nickname,source_instance,source_enterprise,source_subject)VALUES($1,$2,'合成真名',$3,'fixture-source-a',$4,$5)",[m.enterpriseId,randomUUID(),nickname,m.source.root,email]);
 }
 process.env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE='shared';process.env.NAUMI_ENTERPRISE_ALLOWED_IDS='';
 const port=18508,origin='http://127.0.0.1:'+port;
 const accounts:Record<string,string>={employee:m.source.ordinary,manager:m.source.owner,personal:'workspace-personal@fixture.invalid',unbound:'staff@fixture.invalid',designer:'designer-b@fixture.invalid',artist:'artist@fixture.invalid'};
 const server=createServer(async(req,res)=>{try{
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(400);return res.end();}const u=new URL(req.url||'/',origin);
  const respond=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  if(req.method==='POST'&&req.headers.origin!==origin)return respond(403,{error:'ORIGIN_REQUIRED'});
  let size=0;const chunks:Buffer[]=[];for await(const b of req){size+=b.length;if(size>33*1024*1024)return respond(413,{error:'BODY_TOO_LARGE'});chunks.push(b);}const body=Buffer.concat(chunks);
  if(req.method==='POST'&&u.pathname==='/fixture/login'){const {account}=JSON.parse(body.toString());if(!accounts[account]&&account!=='anonymous')return respond(400,{error:'UNKNOWN_FIXTURE_ACCOUNT'});res.setHeader('set-cookie',`nv_user=${account==='anonymous'?'':native.signUserSession(accounts[account],Date.now())}; HttpOnly; SameSite=Strict; Path=/`);return respond(200,{account});}
  if(req.method==='GET'&&u.pathname==='/fixture/meta')return respond(200,{...m,secondTeam,secondSource,thirdTeam});
  if(req.method==='POST'&&u.pathname==='/fixture/revoke'){const {enabled}=JSON.parse(body.toString());await pool.query("UPDATE enterprise_workflow.team_members SET enabled=$2 WHERE enterprise_id=$1 AND subject='worker'",[m.enterpriseId,!!enabled]);return respond(200,{enabled});}
  if(req.method==='POST'&&u.pathname==='/fixture/policy'){const {dedicated}=JSON.parse(body.toString());process.env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE=dedicated?'dedicated':'shared';process.env.NAUMI_ENTERPRISE_ALLOWED_IDS=dedicated?m.source.root:'';return respond(200,{dedicated});}
  if(req.method==='POST'&&u.pathname==='/fixture/shutdown'){respond(200,{closed:true});setTimeout(()=>{server.close();server.closeAllConnections();},50);return;}
  const headers=new Headers();for(const key of ['cookie','origin','content-type','x-workflow-viewer']){const v=req.headers[key];if(typeof v==='string')headers.set(key,v);}
  const request=new Request(u,{method:req.method,headers,...(req.method==='POST'?{body}: {})});
  const response=u.pathname==='/api/enterprise/workflow/files'?(req.method==='POST'?await files.POST(request):await files.GET(request)):u.pathname==='/api/enterprise/workflow'?(req.method==='POST'?await POST(request):await GET(request)):['/','/preview.html','/enterprise/workflow'].includes(u.pathname)?await html():new Response('not found',{status:404});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e instanceof Error?e.message:'fixture_error');res.writeHead(500);res.end('fixture_error');}});
 server.listen(port,'127.0.0.1');await once(server,'listening');console.log(`WORKSPACE_PREVIEW_READY: ${origin}/preview.html?v=4 native_session=1 source_and_workflow=isolated fixture_login_only=1`);await once(server,'close');
}
