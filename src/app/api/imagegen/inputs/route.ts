import {resolveUserEmail} from "@/lib/admin-auth";
import {sameSiteBillingMutation} from "@/lib/billing/access";
import {saveImagegenInput} from "@/lib/imagegen/input-assets";
import {rateLimit} from "@/lib/rate-limit";
export const runtime="nodejs";
export async function POST(request:Request){
 if(!sameSiteBillingMutation(request))return Response.json({error:"请求来源无效"},{status:403});
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 if(!rateLimit(`imagegen-inputs:${owner}`,100,600000))return Response.json({error:"上传过于频繁"},{status:429});
 if(Number(request.headers.get("content-length"))>13*1024*1024)return Response.json({error:"素材超过12MiB"},{status:413});
 try{const form=await request.formData(),file=form.get("image");if(!(file instanceof File)||file.size>12*1024*1024||!file.size)throw new Error("请选择12MiB以内的PNG、JPEG或WebP");return Response.json(await saveImagegenInput(Buffer.from(await file.arrayBuffer()),owner));}
 catch(error){return Response.json({error:error instanceof Error?error.message:"上传失败"},{status:400});}
}
