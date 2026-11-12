import { billingAuthorize, billingJson } from "@/lib/billing/access";
import { exposeAbandonedBillingOperations } from "@/lib/billing/synchronous-operation";
import { readPendingOverview } from "@/lib/billing/pending-read";
import { getPool } from "@/platform/db/pool";
export const runtime = "nodejs", dynamic = "force-dynamic";

export async function GET(request: Request) {
    const auth = await billingAuthorize(request);
    if (auth instanceof Response) return auth;
    try {
        // Stale reservations become reviewable even if the worker tick has not
        // run yet; the same conversion runs on the tick cadence.
        await exposeAbandonedBillingOperations();
        return billingJson(await readPendingOverview(getPool()));
    }
    catch {
        return billingJson({ error: "待核查数据暂不可用" }, 503);
    }
}
