import {FLEET_BUSINESS_RESPONSE_MAX_BYTES,type BusinessSource,type FleetBusinessResponse} from './business-central-contracts';

const encoder=new TextEncoder();
/** Measure the UTF-8 size of a serialized JSON value for the envelope budget, including field names and delimiters. */
const bytes=(value:unknown)=>encoder.encode(JSON.stringify(value)).byteLength;

/** Budget the entire JSON envelope, including every site's terminal fallback.
 * Admit whole snapshots in stable source order; never mutate cached receipts,
 * truncate rows or present a partial response as complete global accounting.
 * null means the metadata alone is oversized and needs a short API error. */
export function boundFleetBusinessResponse(input:FleetBusinessResponse):FleetBusinessResponse|null{
  const sources:BusinessSource[]=input.sources.map(source=>{
    if(source.status!=='succeeded')return source;
    const {id,name,kind,commandId}=source;
    return{id,name,kind,...(commandId===undefined?{}:{commandId}),status:'unavailable',error:'汇总结果达到大小上限，请选择该站点查看'};
  });
  const result={...input,sources,complete:false};
  // Reserve full sites/query/requestId metadata, punctuation and complete:false
  // before accepting data, so later pending/error entries can never overflow it.
  let used=bytes(result);
  const extras=sources.map((source,i)=>input.sources[i].status==='succeeded'?bytes(input.sources[i])-bytes(source):0);
  const complete=input.complete&&input.sources.every(source=>source.status==='succeeded');
  // A complete envelope uses "true" (one byte less than "false"). Preserve an
  // exactly-at-limit complete response instead of unnecessarily dropping data.
  if(used+extras.reduce((sum,value)=>sum+value,0)-(complete?1:0)<=FLEET_BUSINESS_RESPONSE_MAX_BYTES)return{...input,complete};
  if(used>FLEET_BUSINESS_RESPONSE_MAX_BYTES)return null;
  for(let i=0;i<sources.length;i++){
    if(input.sources[i].status!=='succeeded')continue;
    const extra=extras[i];
    if(used+extra<=FLEET_BUSINESS_RESPONSE_MAX_BYTES){sources[i]=input.sources[i];used+=extra;}
  }
  result.complete=input.complete&&sources.every(source=>source.status==='succeeded');
  return result;
}
