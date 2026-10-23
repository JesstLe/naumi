import {createVideoReferenceMediaHandler} from "@/lib/video/reference-media";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const serve=createVideoReferenceMediaHandler();
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){return serve(request,(await params).token);}
export async function HEAD(request:Request,{params}:{params:Promise<{token:string}>}){return serve(request,(await params).token);}
