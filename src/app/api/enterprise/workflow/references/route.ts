import {z} from 'zod';
import {workflowSourceIdentity,workflowBridgeConfig,workflowIdentityToken} from '@/lib/enterprise/workflow-identity';
import {IntegrationError} from '@/lib/enterprise/integration/policy';
import {teamJson,teamFailure} from '@/lib/teams/access';
import {rateLimit} from '@/lib/rate-limit';
export const runtime='nodejs';export const dynamic='force-dynamic';
const scope={enterpriseId:z.string().uuid(),teamId:z.string().uuid(),orderId:z.string().uuid()};
const query=z.discriminatedUnion('action',[z.strictObject({action:z.literal('list'),...scope}),z.strictObject({action:z.literal('file'),...scope,id:z.string().regex(/^[a-f0-9]{64}$/),viewer:z.string().email().max(254),download:z.enum(['0','1']).default('0')})]);
export async function GET(request:Request){const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return teamJson({error:'INVALID_REFERENCE_QUERY'},400);try{
 const q=parsed.data,headers=new Headers(request.headers);if(q.action==='file')headers.set('x-workflow-viewer',q.viewer);const identity=await workflowSourceIdentity(new Request(request,{headers}),q.enterpriseId);if(!rateLimit('workflow-reference-read:'+JSON.stringify(identity),180,60000))return teamJson({error:'RATE_LIMITED'},429);const c=workflowBridgeConfig();let r:Response;
 const params=new URLSearchParams({orderId:q.orderId,...(q.action==='file'?{id:q.id,download:q.download}:{})});try{r=await fetch(c.origin+(q.action==='file'?'/v1/references/file?':'/v1/references?')+params,{headers:{authorization:'Bearer '+workflowIdentityToken(identity,c,q.teamId)},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(120000)});}catch{return teamJson({error:'REFERENCE_SERVICE_UNAVAILABLE'},503);}
 if(q.action==='list'||!r.ok){if(!r.headers.get('content-type')?.includes('application/json'))return teamJson({error:'REFERENCE_RESPONSE_INVALID'},502);return teamJson(await r.json(),r.status);}
 const mime=r.headers.get('content-type');if(!['image/png','image/jpeg','application/octet-stream'].includes(mime||''))return teamJson({error:'REFERENCE_RESPONSE_INVALID'},502);const output=new Headers({'Content-Type':mime!,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});for(const k of ['content-length','content-disposition','x-content-sha256']){const v=r.headers.get(k);if(v)output.set(k,v);}return new Response(r.body,{headers:output});
 }catch(e){return e instanceof IntegrationError?teamJson({error:e.code},e.status):teamFailure(e);}}
