import { NextResponse } from "next/server";
import { supplierLedger } from "@/lib/supplier-cost/runtime";
import { enqueueCallback } from "@/lib/supplier-cost/callback";
import { readBounded } from "@/lib/supplier-cost/io";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/ip";
export const runtime="nodejs",dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:{account:string}}){
  if(!/^[a-f0-9]{64}$/.test(params.account))return NextResponse.json({error:"invalid account"},{status:400});
  if(!rateLimit(`supplier-callback:${params.account}:${clientIp(request)}`,60,60000))return NextResponse.json({error:"rate limited"},{status:429});
  try{const raw=await readBounded(new Response(request.body),65536);await enqueueCallback(supplierLedger(),params.account,raw);return NextResponse.json({accepted:true,confirmation:"server-query-required"},{status:202});}
  catch{return NextResponse.json({error:"callback could not be queued"},{status:503});}
}
