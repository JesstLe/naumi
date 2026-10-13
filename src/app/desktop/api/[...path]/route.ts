import { NextRequest } from "next/server";
// The sidecar reuses its own canonical API handlers, auth and billing gates.
// Fixed loopback target: no client-controlled upstream and no privileged headers.
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=300;
async function proxy(request:NextRequest){
 const path=request.nextUrl.pathname.slice("/desktop".length);
 if(!path.startsWith("/api/") || /[\\\u0000-\u001f]/.test(path))return Response.json({error:"无效路径"},{status:400});
 const headers=new Headers(request.headers);headers.delete("connection");headers.delete("content-length");headers.delete("x-middleware-subrequest");headers.set("accept-encoding","identity");
 const target=new URL(path+request.nextUrl.search,`http://127.0.0.1:${process.env.PORT || 3000}`);
 const response=await fetch(target,{method:request.method,headers,body:["GET","HEAD"].includes(request.method)?undefined:await request.arrayBuffer(),redirect:"manual",cache:"no-store",signal:request.signal});
 const out=new Headers(response.headers);out.delete("transfer-encoding");out.delete("connection");out.delete("content-encoding");out.delete("content-length");out.set("cache-control","private, no-store");
 return new Response(response.body,{status:response.status,headers:out});
}
export const GET=proxy,POST=proxy,PUT=proxy,PATCH=proxy,DELETE=proxy,HEAD=proxy,OPTIONS=proxy;
