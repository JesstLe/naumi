import "server-only";
import { dbEnabled, ensureSchema, getPool } from "@/lib/db";
import { resolveUserEmail } from "@/lib/admin-auth";
import { imageWorkerAuthorized } from "@/lib/durable-image-jobs";
import { billingRequestIdentity } from "./synchronous";
import { operationIdFor, billingErrorResponse } from "./request";
import { billingJson, sameSiteBillingMutation } from "./access";
import { BillingError } from "./types";
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
        const id = `intent-${operationIdFor(request)}`, path = new URL(request.url).pathname, identity = await billingRequestIdentity(request);
        const created = await getPool().query("INSERT INTO app_billing_intents(id,email,path,request_fingerprint) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id", [id, email.toLowerCase(), path, identity.hash]);
        if (!created.rowCount) {
            const row = (await getPool().query("SELECT * FROM app_billing_intents WHERE id=$1", [id])).rows[0];
            if (!row || row.email !== email.toLowerCase() || row.path !== path || row.request_fingerprint !== identity.hash)
                throw new BillingError("OPERATION_CONFLICT", "提交编号已用于不同请求", 409);
            if (row.response)
                return billingJson(row.response, row.response_status);
            return billingJson({ code: "OPERATION_PENDING", error: "提交结果待核查，请查看任务列表或联系管理员；不会重复执行", operationId: id }, 409);
        }
        const response = await action(), body = await response.clone().json().catch(() => null);
        if (response.ok && body && JSON.stringify(body).length < 262144)
            await getPool().query("UPDATE app_billing_intents SET response=$2::jsonb,response_status=$3 WHERE id=$1", [id, JSON.stringify(body), response.status]);
        else if (response.status >= 400 && response.status < 500)
            await getPool().query("DELETE FROM app_billing_intents WHERE id=$1", [id]);
        return response;
    }
    catch (e) {
        return billingErrorResponse(e);
    }
}
