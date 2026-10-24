import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {authorizeVideoProject} from "@/lib/canvas/video-node-service";
import {videoNodeIdSchema,videoProjectKeySchema} from "@/lib/canvas/video-node-schema";
import {z} from "zod";
import {ModelConfigError} from "@/lib/model-config/types";
import {saveVideoScriptAsset} from "@/lib/video/script-assets";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
export const runtime="nodejs",dynamic="force-dynamic";
export async function POST(request:Request){
  const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
  try{return NextResponse.json(await saveVideoScriptAsset(actor,JSON.parse(await readBounded(new Response(request.body),512*1024))),{headers:{"cache-control":"private, no-store"}});}
  catch(error){
    if(error instanceof z.ZodError||error instanceof SyntaxError)return NextResponse.json({error:"剧本资产字段无效"},{status:422});
    if(error instanceof ModelConfigError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});
    return NextResponse.json({error:"剧本资产暂不可保存"},{status:503});
  }
}
const cursorSchema=z.strictObject({updatedAt:z.iso.datetime(),id:videoNodeIdSchema});
export async function GET(request:Request){const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});const params=new URL(request.url).searchParams,id=params.get("id")||undefined,key=params.get("projectKey")||undefined;
  let cursor:z.infer<typeof cursorSchema>|undefined;try{if(id)videoNodeIdSchema.parse(id);if(key)videoProjectKeySchema.parse(key);if(params.has("cursor"))cursor=cursorSchema.parse(JSON.parse(params.get("cursor")!));if(!id&&!key)throw new Error("请选择项目");}catch{return NextResponse.json({error:"文字来源查询无效"},{status:422});}
  try{await ensureSchema();if(key)await authorizeVideoProject(actor,key);
    if(id){const row=(await getPool().query("SELECT id,project_key,title,content,prompt,status FROM app_canvas_text_nodes WHERE email=$1 AND id=$2 AND ($3::text IS NULL OR project_key=$3)",[actor,id,key||null])).rows[0];if(!row)return NextResponse.json({error:"文字节点不存在或无权访问"},{status:404});return NextResponse.json({node:{id:row.id,projectKey:row.project_key,title:row.title,content:row.content||row.prompt||"",status:row.status}},{headers:{"cache-control":"private, no-store"}});}
    const rows=(await getPool().query(`SELECT id,project_key,title,status,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at FROM app_canvas_text_nodes WHERE email=$1 AND project_key=$2 AND ($3::timestamptz IS NULL OR (updated_at,id)<($3::timestamptz,$4::text)) ORDER BY updated_at DESC,id DESC LIMIT 31`,[actor,key,cursor?.updatedAt||null,cursor?.id||null])).rows,last=rows[29];
    return NextResponse.json({nodes:rows.slice(0,30).map(row=>({id:row.id,projectKey:row.project_key,title:row.title,status:row.status})),nextCursor:rows.length>30&&last?{updatedAt:last.updated_at,id:last.id}:null},{headers:{"cache-control":"private, no-store"}});
  }catch(error){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):NextResponse.json({error:"文字来源暂不可用"},{status:503});}
}
