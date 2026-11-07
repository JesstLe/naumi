import { gatewayJson, gatewayRoute } from "@/lib/agent-gateway/http";
import { budgetState } from "@/lib/agent-gateway/calls";
import { getUser } from "@/lib/accounts/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return gatewayRoute(request, async caller => {
    const [user, budget] = await Promise.all([getUser(caller.email), budgetState(caller.token)]);
    const { id, name, prefix, scopes, dailyCreditLimit, expiresAt, createdAt } = caller.token;
    return gatewayJson({
      site: caller.origin,
      account: { email: caller.email, name: user?.name ?? null, plan: user?.plan ?? null, balance: user ? user.creditsTotal - user.creditsUsed : null },
      token: { id, name, prefix, scopes, dailyCreditLimit, expiresAt, createdAt, spentToday: budget.spentToday, remainingToday: budget.remainingToday },
    });
  });
}
