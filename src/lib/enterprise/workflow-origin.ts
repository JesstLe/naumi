/** Canonical public-origin check for the workflow BFF behind a loopback proxy.
 * Never trust a client-controlled forwarded-host header or equate localhost aliases.
 */
export function workflowSameOrigin(request:Request,env:Record<string,string|undefined>=process.env){
 if(request.headers.get('sec-fetch-site')==='cross-site')return false;
 const origin=request.headers.get('origin');if(!origin)return false;
 const configured=env.NAUMI_ENTERPRISE_PUBLIC_ORIGIN;
 if(configured===undefined)return origin===new URL(request.url).origin;
 try{
  const url=new URL(configured);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname)))return false;
  return origin===url.origin&&request.headers.get('host')===url.host;
 }catch{return false;}
}
