import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {Pool} from 'pg';
import type {WorkflowStore} from '../services/enterprise-workflow/src/store';
import {checkCancellationHttp} from '../services/enterprise-workflow/tests/cancellation-http';
export async function verifyCancellationBff(pool:Pool,source:{root:string;foreign:string;owner:string;ordinary:string},enterpriseId:string,teamId:string,store:WorkflowStore){
 const api=await import('../src/app/api/enterprise/workflow/route'),native=await import('../src/lib/native-auth'),reviewer='change-reviewer@fixture.invalid';
 (store as unknown as {cancellationsEnabled:boolean}).cancellationsEnabled=true;await pool.query('UPDATE enterprise_workflow.runtime_installation SET cancellations_enabled=true,minimum_reader=35,minimum_writer=35');
 const req=(q:Record<string,string>,body?:unknown,email=source.owner)=>new Request('http://fixture.invalid/api/enterprise/workflow?'+new URLSearchParams({enterpriseId:source.root,teamId,...q}),{method:body?'POST':'GET',headers:{cookie:email?'nv_user='+native.signUserSession(email,Date.now()):'','content-type':'application/json','x-workflow-viewer':email,origin:'http://fixture.invalid'},...(body?{body:JSON.stringify(body)}:{})});
 for(const [email,q,status]of [['',{action:'cancellation-preview'},401],[source.owner,{action:'cancellation-preview',enterpriseId:source.foreign},404],[source.owner,{action:'cancellation-preview',teamId:randomUUID()},403],[source.owner,{action:'cancellation-preview',role:'manage'},400]]as const){const r=await api.POST(req(q as Record<string,string>,{},email));assert.equal(r.status,status,await r.clone().text());}
 const bad=req({action:'cancellation-preview'},{});bad.headers.set('origin','https://foreign.invalid');assert.equal((await api.POST(bad)).status,403);
 const result=await checkCancellationHttp(async(path,body,status=200,who='manager')=>{const q:Record<string,string>=path==='/v1/commands'?{action:'command'}:path==='/v1/cancellation-preview'?{action:'cancellation-preview'}:{action:'order',id:path.split('/')[3]},email=who==='worker'?source.ordinary:who==='reviewer'?reviewer:source.owner,r=await(body?api.POST:api.GET)(req(q,body,email));assert.equal(r.status,status,await r.clone().text());return r.json();});
 const out=process.env.NAUMI_INTEGRATION_EVIDENCE_DIR;if(out){await mkdir(out,{recursive:true});await writeFile(join(out,'CANCELLATION_FIXTURE.json'),JSON.stringify({...result,sourceId:source.root,enterpriseId,teamId,fixture:true},null,2));}
 console.log('CANCELLATION_BFF_PASS: native_session=1 anonymous401=1 foreign404=1 team403=1 role400=1 origin403=1 independent_pair=1 apply=1');
}
