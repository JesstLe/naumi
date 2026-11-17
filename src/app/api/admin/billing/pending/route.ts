import { billingAuthorize, billingJson } from "@/lib/billing/access";
import { readPendingOverview, readPendingSummary } from "@/lib/billing/pending-read";
import { withBillingReviewRead } from '@/lib/billing/review-read';
import { getPool } from "@/platform/db/pool";
export const runtime = "nodejs", dynamic = "force-dynamic";

export async function GET(request: Request) {
    const auth = await billingAuthorize(request);
    if (auth instanceof Response) return auth;
    try {
        const summary=new URL(request.url).searchParams.get('view')==='summary';
        return await withBillingReviewRead(getPool(),request.signal,async tx=>billingJson(summary?await readPendingSummary(tx):await readPendingOverview(tx)));
    }
    catch {
        return request.signal.aborted?billingJson({error:'查询已取消'},499):billingJson({ error: "待核查数据暂不可用" }, 503);
    }
}
