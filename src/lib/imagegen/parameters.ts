import { IMAGEGEN_FIELDS_BY_CAPABILITY } from "./capabilities";
import type { CapabilityKey,CapabilitySet,ImagegenRequest } from "./types";
/** Only native, evidenced parameters. Output formats can be handled locally without a wire field. */
export function mapImagegenParameters(request:ImagegenRequest,capabilities:CapabilitySet,map:Record<string,string>):Record<string,string|number|boolean>{
  const result:Record<string,string|number|boolean>={};
  const send=(key:CapabilityKey,value:string|number|undefined,required:boolean)=>{
    if(value===undefined)return;
    const field=map[key];if(field==="omit")return;
    if(!field&&!required)return;
    if(!field||!IMAGEGEN_FIELDS_BY_CAPABILITY[key].includes(field))throw new Error(`实际参数名未维护或不允许：${key}`);
    const cap=capabilities[key];if(cap?.state==="unsupported")throw new Error(`实际参数已明确禁用：${key}`);
    if(cap?.state==="supported"&&cap.values!==undefined&&!cap.values.includes(String(value)))throw new Error(`实际参数值不在已配置范围：${key}`);
    if(Object.hasOwn(result,field))throw new Error(`实际参数名重复：${field}`);
    result[field]=value;
  };
  send("inputFidelity",request.parameters.inputFidelity,true);
  send("moderation",request.parameters.moderation,true);
  send("transparent",request.output.background,false);
  send("outputFormat",request.output.format,false);
  send("outputCompression",request.output.compression,request.output.compressionMode==="native");
  if(request.parameters.width!==undefined&&request.parameters.height!==undefined)
    send("pixelSize",`${request.parameters.width}x${request.parameters.height}`,true);
  return result;
}
/** Local compression strength is an encoder control, not an assumed supplier percentage. */
export function imagegenWireRequest(request:ImagegenRequest):ImagegenRequest{return {...request,output:{...request.output,compression:request.output.compressionMode==="native"?request.output.compression:undefined}};}
