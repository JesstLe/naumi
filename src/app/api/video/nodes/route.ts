import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {getPool} from "@/platform/db/pool";
import { authorizeVideoProject } from "@/lib/canvas/project-access";
import { videoNodeIdSchema } from "@/lib/canvas/video-node-schema";
import { videoProjectKeySchema } from "@/lib/canvas/project-key";
import {ModelConfigError} from "@/lib/model-config/types";
import {z} from "zod";
export const runtime="nodejs",dynamic="force-dynamic";
const cursorSchema=z.strictObject({createdAt:z.iso.datetime(),id:videoNodeIdSchema});
export async function GET(request:Request){const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});const params=new URL(request.url).searchParams,key=params.get("projectKey");let cursor:z.infer<typeof cursorSchema>|undefined;
  try{videoProjectKeySchema.parse(key);if(params.has("cursor"))cursor=cursorSchema.parse(JSON.parse(params.get("cursor")!));}catch{return NextResponse.json({error:"视频节点列表查询无效"},{status:422});}
  try{await authorizeVideoProject(actor,key!);const rows=(await getPool().query(`SELECT id,project_key,title,revision,last_task_id,last_result_id,display_result_id,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at FROM app_canvas_video_nodes WHERE email=$1 AND project_key=$2 AND deleted_at IS NULL AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::text)) ORDER BY created_at DESC,id DESC LIMIT 31`,[actor,key,cursor?.createdAt||null,cursor?.id||null])).rows,last=rows[29];
    return NextResponse.json({nodes:rows.slice(0,30).map(row=>({id:row.id,projectKey:row.project_key,title:row.title,revision:Number(row.revision),lastTaskId:row.last_task_id,lastResultId:row.last_result_id,displayResultId:row.display_result_id})),nextCursor:rows.length>30&&last?{createdAt:last.created_at,id:last.id}:null},{headers:{"cache-control":"private, no-store"}});
  }catch(error){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):NextResponse.json({error:"视频节点列表暂不可用"},{status:503});}
}
