import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {getPool} from '@/platform/db/pool';
import {businessQuerySchema,businessSnapshotSchema,FLEET_BUSINESS_QUERY_MAX_AGE_MS,type FleetBusinessQuery,type FleetBusinessSnapshot} from './business-contracts';
import {readFleetBusinessQuery} from './business-read-model';
import {businessRequestSchema,type BusinessSite,type BusinessSource,type FleetBusinessRequest,type FleetBusinessResponse} from './business-central-contracts';
import {boundFleetBusinessResponse} from './business-response';
import {canonical,type FleetActor} from './contracts';
import {enqueueCommand,fleetBusinessInstances,fleetReadCommand,FleetError} from './server';

const WINDOW_MS=30_000,REQUEST_LIFE_MS=180_000,REMOTE_WAIT_MS=FLEET_BUSINESS_QUERY_MAX_AGE_MS;
const tokenSchema=z.object({v:z.literal(1),actor:z.string().regex(/^[a-f0-9]{64}$/),issuedAt:z.number().int(),
  site:businessRequestSchema.shape.site,registry:z.string().regex(/^[a-f0-9]{64}$/),query:businessQuerySchema}).strict();
type RequestToken=z.infer<typeof tokenSchema>;
type RegistryRow={id:string;name:string;kind:'main'|'enterprise';enabled:boolean;last_seen:string|Date|null;status:Record<string,unknown>};
type CacheEntry={promise:Promise<FleetBusinessSnapshot>;expiresAt:number};
const state=globalThis as typeof globalThis&{__naumiBusinessLocalCache?:Map<string,CacheEntry>};
function cache(){return state.__naumiBusinessLocalCache??=new Map();}
function key(){const value=process.env.SETTINGS_SECRET;if(!value||value.length<32)throw new FleetError('查询签名配置未就绪',503);return value;}
function mac(value:string){return createHmac('sha256',key()).update(value).digest('hex');}
const actorKey=(actor:FleetActor)=>mac('business-actor:'+actor.actor.trim().toLowerCase());
function encode(value:RequestToken){const payload=Buffer.from(JSON.stringify(value)).toString('base64url');return payload+'.'+mac('business-request:'+payload);}
function decode(raw:string,actor:FleetActor,now:number):RequestToken{
  if(raw.length>3000)throw new FleetError('查询标识无效',400);
  const [payload,signature,...extra]=raw.split('.');
  if(extra.length||!payload||!/^[a-f0-9]{64}$/.test(signature||'')||
    !timingSafeEqual(Buffer.from(mac('business-request:'+payload),'hex'),Buffer.from(signature,'hex')))throw new FleetError('查询标识无效',400);
  let value:RequestToken;try{value=tokenSchema.parse(JSON.parse(Buffer.from(payload,'base64url').toString('utf8')));}catch{throw new FleetError('查询标识无效',400);}
  if(value.actor!==actorKey(actor))throw new FleetError('查询不属于当前账号',403);
  if(value.issuedAt>now+5000||now-value.issuedAt>REQUEST_LIFE_MS)throw new FleetError('查询已过期，请重新查询',409);
  if(Date.parse(value.query.asOf)!==value.issuedAt)throw new FleetError('查询时间不一致',400);
  return value;
}
function commandId(token:RequestToken,instanceId:string){
  const h=mac('business-command:'+canonical({actor:token.actor,query:token.query,instanceId}));
  return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);
}
function date(value:string|Date|null){return value?new Date(value).toISOString():null;}
function localSite():BusinessSite{return{id:'local',name:'103平台',kind:'local',enabled:true,lastSeen:null};}
function publicSite(row:RegistryRow):BusinessSite{return{id:row.id,name:row.name,kind:row.kind,enabled:row.enabled,lastSeen:date(row.last_seen)};}
function selected(rows:RegistryRow[],site:FleetBusinessRequest['site']){
  if(site==='local')return[];
  if(site==='all')return rows;
  const result=rows.filter(r=>r.id===site);if(result.length!==1)throw new FleetError('站点不存在或已移除',404);return result;
}
function registryHash(rows:RegistryRow[],site:FleetBusinessRequest['site']){
  return mac(canonical({site,instances:selected(rows,site).map(r=>({id:r.id,enabled:r.enabled,kind:r.kind})).sort((a,b)=>a.id.localeCompare(b.id))}));
}
function matching(raw:unknown,query:FleetBusinessQuery,issuedAt:number,now:number){
  const data=businessSnapshotSchema.parse(raw),from=new Date(Date.parse(query.asOf)-query.days*86400000).toISOString();
  if(data.view!==query.view||data.page!==query.page||data.asOf!==query.asOf||data.from!==from||data.scope!=='site')throw new Error('BUSINESS_QUERY_REPLY_MISMATCH');
  const observed=Date.parse(data.observedAt);if(observed<issuedAt-5000||observed>now+5000)throw new Error('BUSINESS_QUERY_REPLY_NOT_FRESH');
  return data;
}
async function localResult(token:RequestToken,now:number):Promise<BusinessSource>{
  const local=localSite(),site={id:local.id,name:local.name,kind:local.kind},id=mac('business-local:'+canonical(token.query));
  for(const[k,v]of cache())if(v.expiresAt<now)cache().delete(k);
  while(cache().size>256)cache().delete(cache().keys().next().value!);
  let entry=cache().get(id);
  if(!entry){const promise=readFleetBusinessQuery(getPool(),token.query);entry={promise,expiresAt:token.issuedAt+REQUEST_LIFE_MS};cache().set(id,entry);}
  try{return{...site,status:'succeeded',data:matching(await entry.promise,token.query,token.issuedAt,Date.now())};}
  catch{return{...site,status:'failed',error:'103业务数据读取失败'};}
}
async function remoteResult(actor:FleetActor,row:RegistryRow,token:RequestToken,now:number):Promise<BusinessSource>{
  const site=publicSite(row),id=commandId(token,row.id),base={id:site.id,name:site.name,kind:site.kind,commandId:id};
  if(!row.enabled)return{...base,status:'offline',error:'站点连接已停用'};
  try{
    let command=await fleetReadCommand(actor,row.id,id);
    if(command){
      if(canonical(command.operation)!==canonical(token.query))return{...base,status:'unknown',error:'查询回执不匹配'};
      if(command.state==='succeeded'){
        const result=command.result as {status?:string;data?:{business?:unknown}};
        if(result?.status!=='succeeded')return{...base,status:'unknown',error:'查询回执无效'};
        return{...base,status:'succeeded',data:matching(result.data?.business,token.query,token.issuedAt,Date.now())};
      }
      if(command.state==='failed')return{...base,status:'failed',error:'站点业务数据读取失败'};
      if(command.state==='blocked')return{...base,status:'unknown',error:'查询回执状态未知'};
      if(now-token.issuedAt>=REMOTE_WAIT_MS)return{...base,status:'unknown',error:'尚未收到站点查询回执'};
      return{...base,status:'pending'};
    }
    const lastSeen=row.last_seen?new Date(row.last_seen).getTime():0;
    if(!Number.isFinite(lastSeen)||now-lastSeen>90_000)return{...base,status:'offline',error:'站点当前离线'};
    if(row.status?.business!==1)return{...base,status:'unknown',error:'数据连接器待更新'};
    if(now-token.issuedAt>=REMOTE_WAIT_MS)return{...base,status:'unknown',error:'查询等待已结束，请重新查询'};
    // Stable IDs coalesce concurrent readers. Only a signed read query is queued;
    // no billing, wallet, account or provider mutation is performed here.
    await enqueueCommand(actor.actor,row.id,id,token.query,actor);
    command=await fleetReadCommand(actor,row.id,id);
    if(!command)return{...base,status:'unknown',error:'未取得查询回执'};
    if(command.state==='succeeded'){
      const result=command.result as {status?:string;data?:{business?:unknown}};
      return{...base,status:'succeeded',data:matching(result.data?.business,token.query,token.issuedAt,Date.now())};
    }
    return{...base,status:command.state==='failed'?'failed':'pending',...(command.state==='failed'?{error:'站点业务数据读取失败'}:{})};
  }catch(error){
    if(error instanceof FleetError&&error.status===503)return{...base,status:'unknown',error:error.message};
    if(error instanceof FleetError&&(error.status===403||error.status===404||error.status===409))return{...base,status:'unknown',error:'站点查询权限或状态已变化'};
    return{...base,status:'unknown',error:'站点数据暂未确认'};
  }
}
async function response(actor:FleetActor,token:RequestToken,rows:RegistryRow[],now:number):Promise<FleetBusinessResponse>{
  if(!actor.root)throw new FleetError('业务总览需要总后台管理员身份',403);
  if(registryHash(rows,token.site)!==token.registry)throw new FleetError('站点列表已变化，请重新查询',409);
  const targets=selected(rows,token.site),sources:BusinessSource[]=[];
  if(token.site==='all'||token.site==='local')sources.push(await localResult(token,now));
  // Bound concurrent metadata work without limiting the number of registered sites.
  for(let i=0;i<targets.length;i+=4)sources.push(...await Promise.all(targets.slice(i,i+4).map(r=>remoteResult(actor,r,token,now))));
  const result=boundFleetBusinessResponse({requestId:encode(token),query:token.query,sites:[localSite(),...rows.map(publicSite)],sources,
    complete:sources.length>0&&sources.every(s=>s.status==='succeeded')});
  if(!result)throw new FleetError('站点目录超出响应大小上限，请联系管理员',503);
  return result;
}
export async function startFleetBusinessQuery(actor:FleetActor,input:unknown,now=Date.now()){
  if(!actor.root)throw new FleetError('业务总览需要总后台管理员身份',403);
  const request=businessRequestSchema.parse(input),issuedAt=request.refresh?now:Math.floor(now/WINDOW_MS)*WINDOW_MS;
  const rows=await fleetBusinessInstances(actor) as RegistryRow[];
  const query=businessQuerySchema.parse({type:'business.query',view:request.view,days:request.days,asOf:new Date(issuedAt).toISOString(),page:request.page,search:request.search,...(request.email?{email:request.email}:{})});
  const token:RequestToken={v:1,actor:actorKey(actor),issuedAt,site:request.site,registry:registryHash(rows,request.site),query};
  return response(actor,token,rows,now);
}
export async function pollFleetBusinessQuery(actor:FleetActor,requestId:string,now=Date.now()){
  if(!actor.root)throw new FleetError('业务总览需要总后台管理员身份',403);
  const token=decode(requestId,actor,now),rows=await fleetBusinessInstances(actor) as RegistryRow[];
  return response(actor,token,rows,now);
}
