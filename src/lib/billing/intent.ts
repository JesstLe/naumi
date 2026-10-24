import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import { resolveUserEmail } from "@/lib/admin-auth";
import { imageWorkerAuthorized } from "@/lib/durable-image-jobs";
import { billingRequestIdentity } from "./synchronous";
import { operationIdFor, billingErrorResponse } from "./request";
import { billingJson, sameSiteBillingMutation } from "./access";
import { BillingError } from "./types";
export type SubmissionIdentity={operationId:string;email:string;path:string;hash:string};
export type SubmissionReceipt={status:number;body:Record<string,any>};
/** One durable receipt owner for HTTP and in-process submissions. No task replay. */
export async function claimSubmission(identity:SubmissionIdentity):Promise<SubmissionReceipt|null>{
    if(!/^[a-zA-Z0-9_-]{8,120}$/.test(identity.operationId))throw new BillingError("INVALID_RESULT","计费操作编号无效",400);
    await ensureSchema();
    const id=`intent-${identity.operationId}`;
    const created=await getPool().query("INSERT INTO app_billing_intents(id,email,path,request_fingerprint) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id",[id,identity.email.toLowerCase(),identity.path,identity.hash]);
    if(created.rowCount)return null;
    const row=(await getPool().query("SELECT * FROM app_billing_intents WHERE id=$1",[id])).rows[0];
    if(!row||row.email!==identity.email.toLowerCase()||row.path!==identity.path||row.request_fingerprint!==identity.hash)throw new BillingError("OPERATION_CONFLICT","提交编号已用于不同请求",409);
    return row.response?{status:row.response_status,body:row.response}:{status:409,body:{code:"OPERATION_PENDING",error:"提交结果待核查，请查看任务列表或联系管理员；不会重复执行",operationId:id}};
}
export async function saveSubmissionReceipt(operationId:string,status:number,body:unknown){
    const id=`intent-${operationId}`;
    if(status>=200&&status<300&&body&&JSON.stringify(body).length<262144)
        await getPool().query("UPDATE app_billing_intents SET response=$2::jsonb,response_status=$3 WHERE id=$1",[id,JSON.stringify(body),status]);
    else if(status>=400&&status<500)await getPool().query("DELETE FROM app_billing_intents WHERE id=$1",[id]);
}
/** Durable submission receipt prevents a lost HTTP response creating a second job.
 * A crash without a receipt stays pending; existing domain recovery owns the task.
 */
export async function withBillingIntent(request: Request, action: () => Promise<Response>): Promise<Response> {
    if (!dbEnabled || !request.headers.has("x-naumi-billing-operation-id") || imageWorkerAuthorized(request))
        return action();
    if (!sameSiteBillingMutation(request))
        return billingJson({ error: "请求来源无效" }, 403);
    try {
        const email = await resolveUserEmail(request);
        if (!email)
            return billingJson({ error: "请先登录" }, 401);
        await ensureSchema();
        const operationId=operationIdFor(request),path=new URL(request.url).pathname,identity=await billingRequestIdentity(request);
        const previous=await claimSubmission({operationId,email,path,hash:identity.hash});
        if(previous)return billingJson(previous.body,previous.status);
        const response = await action(), body = await response.clone().json().catch(() => null);
        await saveSubmissionReceipt(operationId,response.status,body);
        return response;
    }
    catch (e) {
        return billingErrorResponse(e);
    }
}
