/** Preserve the requested application view without accepting an external redirect. */
export function authDestination(raw:string|null|undefined):string|null{
 if(!raw||!raw.startsWith('/')||raw.startsWith('//')||/[\\\u0000-\u001f]/.test(raw))return null;
 try{const url=new URL(raw,'http://internal');if(url.origin!=='http://internal'||url.pathname.startsWith('/api/')||['/sign-in','/sign-up'].includes(url.pathname))return null;return url.pathname+url.search+url.hash;}catch{return null;}
}
