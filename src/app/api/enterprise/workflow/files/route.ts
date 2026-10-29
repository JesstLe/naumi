import {workflowSameOrigin} from '@/lib/enterprise/workflow-origin';
import {z} from 'zod';
import {workflowSourceIdentity,workflowBridgeConfig,workflowIdentityToken} from '@/lib/enterprise/workflow-identity';
import {IntegrationError} from '@/lib/enterprise/integration/policy';
import {teamJson,teamFailure} from '@/lib/teams/access';
import { checkRateLimit } from "@/lib/rate-limit-http";
export const runtime='nodejs';export const dynamic='force-dynamic';
const uuid=z.string().uuid(),scope={enterpriseId:uuid,teamId:uuid},max=32*1024*1024;
const page=z.coerce.number().int().min(1).max(10000).optional(),viewer=z.string().min(1).max(254).optional();
const getSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('library'),...scope,query:z.string().max(120).optional(),scope:z.enum(['all','mine']).optional(),state:z.enum(['all','candidate','submitted','historical','accepted']).optional(),page}),
 z.strictObject({action:z.literal('list'),...scope,orderId:uuid,taskId:uuid}),
 z.strictObject({action:z.literal('download'),...scope,id:uuid,viewer}),
 z.strictObject({action:z.literal('preview'),...scope,id:uuid,viewer}),
 z.strictObject({action:z.literal('scan-history'),...scope,id:uuid,page})]);
export async function GET(request:Request){const parsed=getSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return teamJson({error:'INVALID_FILE_QUERY'},400);try{
 const q=parsed.data,stream=q.action==='download'||q.action==='preview';let guarded=request;
 if(stream&&q.viewer){const headers=new Headers(request.headers);if(headers.has('x-workflow-viewer')&&headers.get('x-workflow-viewer')!==q.viewer)return teamJson({error:'ACCOUNT_CHANGED'},409);headers.set('x-workflow-viewer',q.viewer);guarded=new Request(request,{headers});}
 const identity=await workflowSourceIdentity(guarded,q.enterpriseId);const rateLimitResult = await checkRateLimit('workflow-file-read:'+JSON.stringify(identity),120,60000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) return teamJson({error:'RATE_LIMITED'},429);
 const c=workflowBridgeConfig(),params=new URLSearchParams();for(const [k,v] of Object.entries(q))if(!['action','enterpriseId','teamId','viewer'].includes(k)&&v!==undefined)params.set(k,String(v));let r:Response;
 try{r=await fetch(c.origin+'/v1/delivery/'+(q.action==='list'?'assets':q.action)+'?'+params,{headers:{authorization:'Bearer '+workflowIdentityToken(identity,c,q.teamId)},cache:'no-store',redirect:'error',signal:AbortSignal.any([request.signal,AbortSignal.timeout(stream?900000:120000)])});}catch{return teamJson({error:'FILE_SERVICE_UNAVAILABLE'},503);}
 if(!stream||!r.ok){if(!r.headers.get('content-type')?.includes('application/json'))return teamJson({error:'FILE_RESPONSE_INVALID'},502);return teamJson(await r.json(),r.status);}
 const mime=q.action==='preview'?r.headers.get('content-type'):'application/octet-stream';if(q.action==='preview'&&!['image/png','image/jpeg'].includes(mime||'')){await r.body?.cancel();return teamJson({error:'FILE_RESPONSE_INVALID'},502);}
 const headers=new Headers({'Content-Type':mime!,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});for(const k of ['content-length','content-disposition','x-content-sha256']){const value=r.headers.get(k);if(value)headers.set(k,value);}if(q.action==='preview')headers.set('content-disposition','inline');return new Response(r.body,{headers});
 }catch(e){return e instanceof IntegrationError?teamJson({error:e.code},e.status):teamFailure(e);}}
export async function POST(request:Request){if(new URL(request.url).searchParams.get('action')==='scan')return rescan(request);const parsed=z.strictObject({...scope,assetId:uuid,orderId:uuid,taskId:uuid,expectedVersion:z.coerce.number().int().positive(),name:z.string().min(1).max(180)}).safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return teamJson({error:'INVALID_UPLOAD'},400);
 if(!workflowSameOrigin(request))return teamJson({error:'ORIGIN_REQUIRED'},403);if(request.headers.get('content-type')!=='application/octet-stream')return teamJson({error:'BINARY_REQUIRED'},415);if(!request.body)return teamJson({error:'EMPTY_ASSET'},400);if(Number(request.headers.get('content-length')||0)>max)return teamJson({error:'ASSET_TOO_LARGE'},413);
 try{const q=parsed.data,identity=await workflowSourceIdentity(request,q.enterpriseId);const rateLimitResult2 = await checkRateLimit('workflow-file-write:'+JSON.stringify(identity),20,60000);
  if (rateLimitResult2 instanceof Response) return rateLimitResult2;
  if (!rateLimitResult2) return teamJson({error:'RATE_LIMITED'},429);const c=workflowBridgeConfig();let bytes=0,oversize=false;const limited=request.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>max){oversize=true;throw Error('ASSET_TOO_LARGE');}controller.enqueue(chunk);}}));const params=new URLSearchParams({assetId:q.assetId,orderId:q.orderId,taskId:q.taskId,expectedVersion:String(q.expectedVersion),name:q.name});let r:Response;
  try{r=await fetch(c.origin+'/v1/delivery/upload?'+params,{method:'POST',headers:{authorization:'Bearer '+workflowIdentityToken(identity,c,q.teamId),'content-type':'application/octet-stream'},body:limited,duplex:'half',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(120000)} as RequestInit&{duplex:'half'});}catch{return teamJson({error:oversize?'ASSET_TOO_LARGE':'UPLOAD_RESULT_UNCERTAIN',uncertain:!oversize},oversize?413:503);}
  if(!r.headers.get('content-type')?.includes('application/json'))return teamJson({error:'FILE_RESPONSE_INVALID'},502);return teamJson(await r.json(),r.status);
 }catch(e){return e instanceof IntegrationError?teamJson({error:e.code},e.status):teamFailure(e);}}
async function rescan(request:Request){const q=z.strictObject({action:z.literal('scan'),...scope,id:uuid}).safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!q.success)return teamJson({error:'INVALID_SCAN_QUERY'},400);if(!workflowSameOrigin(request))return teamJson({error:'ORIGIN_REQUIRED'},403);try{
 const identity=await workflowSourceIdentity(request,q.data.enterpriseId);const rateLimitResult3 = await checkRateLimit('workflow-scan:'+JSON.stringify(identity),10,60000);
  if (rateLimitResult3 instanceof Response) return rateLimitResult3;
  if (!rateLimitResult3) return teamJson({error:'RATE_LIMITED'},429);const c=workflowBridgeConfig();let r:Response;try{r=await fetch(c.origin+'/v1/delivery/scan',{method:'POST',headers:{authorization:'Bearer '+workflowIdentityToken(identity,c,q.data.teamId),'content-type':'application/json'},body:JSON.stringify({assetId:q.data.id}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(120000)});}catch{return teamJson({error:'SCAN_RESULT_UNCERTAIN'},503);}if(!r.headers.get('content-type')?.includes('application/json'))return teamJson({error:'FILE_RESPONSE_INVALID'},502);return teamJson(await r.json(),r.status);
 }catch(e){return e instanceof IntegrationError?teamJson({error:e.code},e.status):teamFailure(e);}}
