/** Protocol skew handling only. No model capability, authentication, billing,
 * task admission, draft persistence or POST retry belongs here. The gateway
 * overwrites this private deadline header; it is never execution permission. */
export const RENDERER_DEADLINE_HEADER='x-naumi-rsc-until';
export const RENDERER_READ_PATHS=['/canvas','/dashboard','/works','/video'] as const;
export function isRendererRead(method:string,path:string,headers:Headers){
  return method==='GET'&&headers.get('rsc')==='1'&&!headers.get('next-action')&&(RENDERER_READ_PATHS as readonly string[]).includes(path);
}
export function rendererReadExpired(method:string,path:string,headers:Headers,now=Date.now()){
  if(!isRendererRead(method,path,headers))return false;
  const until=headers.get(RENDERER_DEADLINE_HEADER);
  if(until===null)return false; // Ordinary, unconfigured gateways are unchanged.
  return !/^[1-9][0-9]{9,11}$/.test(until)||!Number.isFinite(now)||now>=Number(until)*1000;
}
