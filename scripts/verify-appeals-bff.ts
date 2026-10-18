import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Pool} from 'pg';
import {seedCorrectionAcceptance} from '../services/enterprise-workflow/tests/seed-correction-acceptance';
import {checkAppealsHttp} from '../services/enterprise-workflow/tests/appeals-http';
export async function verifyAppealsBff(pool:Pool,source:{root:string;foreign:string;ordinary:string;owner:string},enterpriseId:string){
 const api=await import('../src/app/api/enterprise/workflow/appeals/route'),native=await import('../src/lib/native-auth'),db=await import('../src/lib/db'),teamId=randomUUID(),root=await mkdtemp(join(tmpdir(),'appeals-bff-'));
 await pool.query("INSERT INTO enterprise_workflow.teams(enterprise_id,team_id,name)VALUES($1,$2,'绩效申诉验收组')",[enterpriseId,teamId]);
 const emails:Record<string,string>={manager:source.owner,worker:source.ordinary,reviewer:'appeal-original@fixture.invalid','appeal-reviewer':'appeal-independent@fixture.invalid'};
 for(const subject of ['reviewer','appeal-reviewer']){const email=emails[subject];await db.getOrCreateUser(email,'合成申诉复核');await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment)VALUES($1,$2,$3,NULL,'permanent') ON CONFLICT DO NOTHING",[source.root,email,source.owner]);await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject)VALUES($1,$2) ON CONFLICT DO NOTHING',[enterpriseId,subject]);await pool.query("INSERT INTO enterprise_workflow.source_identities(source_instance,source_enterprise,enterprise_id,source_subject,subject)VALUES('fixture-source-a',$1,$2,$3,$4) ON CONFLICT DO NOTHING",[source.root,enterpriseId,email,subject]);}
 for(const [subject,permissions]of [['provisioner',['manage','request','dispatch','review']],['worker',['execute']],['reviewer',['manage','review']],['appeal-reviewer',['review']]] as const)await pool.query('INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds)VALUES($1,$2,$3,$4,$5)',[enterpriseId,teamId,subject,JSON.stringify(permissions),'["design"]']);
 const fixture=await seedCorrectionAcceptance(pool,enterpriseId,teamId,root,'provisioner','worker','reviewer');
 const req=(q:Record<string,string>,body?:unknown,email=source.owner)=>new Request('http://fixture.invalid/api/enterprise/workflow/appeals?'+new URLSearchParams({enterpriseId:source.root,teamId,...q}),{method:body?'POST':'GET',headers:{cookie:email?'nv_user='+native.signUserSession(email,Date.now()):'',origin:'http://fixture.invalid','content-type':'application/json','x-workflow-viewer':email},...(body?{body:JSON.stringify(body)}:{})});
 const q={action:'basis',periodId:fixture.periodId,factId:fixture.factId};for(const [params,email,status]of [[q,'',401],[{...q,enterpriseId:source.foreign},source.ordinary,404],[{...q,teamId:randomUUID()},source.ordinary,403],[{...q,role:'manage'},source.ordinary,400]]as const)assert.equal((await api.GET(req(params,undefined,email))).status,status);
 const spoof=req(q,undefined,source.ordinary);spoof.headers.set('x-workflow-viewer',source.owner);assert.equal((await api.GET(spoof)).status,409);const origin=req({},{});origin.headers.set('origin','https://foreign.invalid');assert.equal((await api.POST(origin)).status,403);
 const result=await checkAppealsHttp(async(path,body,status=200,who='manager')=>{const u=new URL(path,'http://fixture.invalid'),r=await(body?api.POST:api.GET)(req(Object.fromEntries(u.searchParams),body,emails[who]));assert.equal(r.status,status,await r.clone().text());return r.json();},fixture);
 await pool.query("UPDATE enterprise_workflow.team_members SET enabled=false WHERE enterprise_id=$1 AND team_id=$2 AND subject='worker'",[enterpriseId,teamId]);assert.equal((await api.GET(req(q,undefined,source.ordinary))).status,403);await pool.query("UPDATE enterprise_workflow.team_members SET enabled=true WHERE enterprise_id=$1 AND team_id=$2 AND subject='worker'",[enterpriseId,teamId]);
 const out=process.env.NAUMI_INTEGRATION_EVIDENCE_DIR;if(out){await mkdir(out,{recursive:true});await writeFile(join(out,'APPEALS_FIXTURE.json'),JSON.stringify({teamId,enterpriseId,sourceId:source.root,...result,accounts:emails,fixture:true},null,2));}
 console.log('APPEAL_BFF_PASS: native_session=1 anonymous401=1 foreign404=1 team403=1 forged400=1 viewer409=1 origin403=1 submitted=1 independent_review=1 replay=1 revoked403=1 original_scores_preserved=1');
}
