import {serveMedia} from "@/lib/media/response";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){
  return serveMedia(request,(await params).path||[]);
}
