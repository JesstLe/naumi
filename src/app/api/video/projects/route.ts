import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {ownedCanvasVideoProjects} from "@/lib/canvas/video-projects";
export const runtime="nodejs",dynamic="force-dynamic";
export async function GET(request:Request){const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});try{return NextResponse.json({projects:await ownedCanvasVideoProjects(actor)},{headers:{"cache-control":"private, no-store"}});}catch{return NextResponse.json({error:"画布项目读取失败"},{status:503});}}
