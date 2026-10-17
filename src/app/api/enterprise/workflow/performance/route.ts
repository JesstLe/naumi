import {z} from 'zod';
import {teamJson,teamFailure} from '@/lib/teams/access';
import {rateLimit} from '@/lib/rate-limit';
import {workflowSourceIdentity,workflowBridgeConfig,workflowIdentityToken} from '@/lib/enterprise/workflow-identity';
import {IntegrationError} from '@/lib/enterprise/integration/policy';
import {performanceQuerySchema} from '../../../../../../services/enterprise-workflow/src/performance-contracts';
import {scoreCsv} from '../../../../../../services/enterprise-workflow/src/performance-domain';
export const runtime='nodejs';export const dynamic='force-dynamic';
const scope=z.strictObject({enterpriseId:z.string().uuid(),teamId:z.string().uuid()});
export async function GET(request:Request){
 const input=Object.fromEntries(new URL(request.url).searchParams),{enterpriseId,teamId,format,...raw}=input,p=scope.safeParse({enterpriseId,teamId}),q=performanceQuerySchema.safeParse(raw);if(!p.success||!q.success||format!==undefined&&!(format==='csv'&&q.data.action==='period'))return teamJson({error:'INVALID_PERFORMANCE_QUERY'},400);
 try{const identity=await workflowSourceIdentity(request,p.data.enterpriseId);if(!rateLimit('performance-read:'+JSON.stringify(identity),60,60000))return teamJson({error:'RATE_LIMIT'},429);const config=workflowBridgeConfig();let r:Response;try{r=await fetch(config.origin+'/v1/performance?'+new URLSearchParams(raw),{headers:{authorization:'Bearer '+workflowIdentityToken(identity,config,p.data.teamId)},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{return teamJson({error:'WORKFLOW_SERVICE_UNAVAILABLE'},503);}
  if(!r.headers.get('content-type')?.includes('application/json'))return teamJson({error:'WORKFLOW_RESPONSE_INVALID'},502);const data=await r.json();if(format!=='csv'||!r.ok)return teamJson(data,r.status);if(data.period?.status!=='confirmed'||!Array.isArray(data.period.snapshot?.results))return teamJson({error:'PERIOD_NOT_CONFIRMED'},409);
  return new Response(scoreCsv(data.period.snapshot.results),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="performance.csv"','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
 }catch(e){if(e instanceof IntegrationError)return teamJson({error:e.code},e.status);return teamFailure(e);}
}
export async function POST(request:Request){
 const p=scope.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!p.success)return teamJson({error:'INVALID_PERFORMANCE_QUERY'},400);if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return teamJson({error:'ORIGIN_REQUIRED'},403);if(!request.headers.get('content-type')?.startsWith('application/json'))return teamJson({error:'JSON_REQUIRED'},415);
 try{const identity=await workflowSourceIdentity(request,p.data.enterpriseId);if(!rateLimit('performance-write:'+JSON.stringify(identity),60,60000))return teamJson({error:'RATE_LIMIT'},429);const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;if(reader)for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>32768){await reader.cancel();return teamJson({error:'BODY_TOO_LARGE'},413);}chunks.push(r.value);}const text=Buffer.concat(chunks).toString('utf8');try{JSON.parse(text);}catch{return teamJson({error:'INVALID_JSON'},400);}
  const config=workflowBridgeConfig();let r:Response;try{r=await fetch(config.origin+'/v1/performance',{method:'POST',headers:{authorization:'Bearer '+workflowIdentityToken(identity,config,p.data.teamId),'content-type':'application/json'},body:text,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{return teamJson({error:'WORKFLOW_WRITE_UNCERTAIN'},503);}
  if(!r.headers.get('content-type')?.includes('application/json'))return teamJson({error:'WORKFLOW_RESPONSE_INVALID'},502);return teamJson(await r.json(),r.status);
 }catch(e){if(e instanceof IntegrationError)return teamJson({error:e.code},e.status);return teamFailure(e);}
}
