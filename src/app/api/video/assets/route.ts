import {NextResponse} from "next/server";
import {z} from "zod";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {ModelConfigError} from "@/lib/model-config/types";
import {importVideoAsset,listOwnedVideoAssets} from "@/lib/video/assets";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=240;
export async function POST(request:Request){const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站登记素材"},{status:403});
  try{return NextResponse.json({ok:true,asset:await importVideoAsset(actor,JSON.parse(await readBounded(new Response(request.body),32768)))},{status:201,headers:{"cache-control":"private, no-store"}});}catch(error){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):NextResponse.json({error:"媒体素材登记暂不可用"},{status:503});}}
export async function GET(request:Request){const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});const params=new URL(request.url).searchParams,kind=params.get("kind")||undefined,limit=Number(params.get("limit")??30);let cursor:{createdAt:string;id:string}|undefined;
  try{if(params.has("cursor"))cursor=z.strictObject({createdAt:z.iso.datetime(),id:z.string().min(1).max(160)}).parse(JSON.parse(params.get("cursor")!));}catch{return NextResponse.json({error:"素材分页参数无效"},{status:422});}
  if(kind&&!['image','video','audio'].includes(kind)||!Number.isInteger(limit)||limit<1||limit>100)return NextResponse.json({error:"素材查询参数无效"},{status:422});
  try{return NextResponse.json({ok:true,...await listOwnedVideoAssets(actor,{kind:kind as "image"|"video"|"audio"|undefined,limit,cursor})},{headers:{"cache-control":"private, no-store"}});}catch{return NextResponse.json({error:"媒体素材历史暂不可用"},{status:503});}}
