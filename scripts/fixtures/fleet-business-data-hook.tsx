import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { useBusinessData } from "../../src/components/admin/business-data/use-business-data";
import type { BusinessFilter, BusinessResponse } from "../../src/components/admin/business-data/types";

const scope = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; __HOOK_REVIEW?: unknown };
scope.IS_REACT_ACT_ENVIRONMENT = true;
const asOf = "2026-11-04T08:00:00.000Z";
type Request = BusinessFilter & { refresh: boolean };
function reply(request: Request, credits = 42): BusinessResponse {
  return {
    requestId: "finite-hook-fixture", query: { type: "business.query", view: request.view, days: request.days, asOf, page: request.page, search: request.search, ...(request.email ? { email: request.email } : {}) },
    sites: [{ id: "local", name: "103 平台", kind: "local", enabled: true, lastSeen: null }],
    sources: [{ id: "local", name: "103 平台", kind: "local", status: "succeeded", data: {
      schemaVersion: 1, view: request.view, asOf, from: new Date(Date.parse(asOf) - request.days * 86400_000).toISOString(), observedAt: asOf, timeZone: "Asia/Shanghai", scope: "site", page: request.page, pageSize: 30, total: 61,
      totals: { credits, operations: 1, activeUsers: 1, balance: 58, users: 1, artworks: 1, paidOrders: 0, paidAmount: 0, refundCredits: 0, administrativeDebits: 0 },
      users: [{ email: "hook@example.test", name: "测试账户", role: "user", plan: "free", banned: false, balance: 58, creditsTotal: 58, creditsUsed: 0, credits, operations: 1, lastUsedAt: asOf }], daily: [], orders: [], ledger: [], creations: [],
    } }], complete: true,
  };
}

function budgetReply(request: Request, phase: "terminal" | "pending" | "finished"): BusinessResponse {
  const value = reply(request), data = value.sources[0].data!;
  value.sites.push({ id: "remote-budget", name: "47 企业站", kind: "enterprise", enabled: true, lastSeen: asOf });
  value.sources.push({ id: "remote-budget", name: "47 企业站", kind: "enterprise", status: phase === "pending" ? "pending" : phase === "finished" ? "succeeded" : "unavailable", ...(phase === "pending" ? {} : { data }), error: "汇总结果达到大小上限，请选择该站点查看" });
  if (phase !== "terminal") {
    value.sites.push({ id: "extra-budget", name: "其他站点", kind: "enterprise", enabled: true, lastSeen: asOf });
    value.sources.push({ id: "extra-budget", name: "其他站点", kind: "enterprise", status: "unavailable", data, error: "汇总结果达到大小上限，请选择该站点查看" });
  }
  if (phase === "finished") value.sources[0] = { ...value.sources[0], status: "unavailable", error: "汇总结果达到大小上限，请选择该站点查看" };
  value.complete = false;
  return value;
}

async function main() {
  const requests: Request[] = [], assertions: { name: string; passed: boolean; observed?: unknown }[] = [];
  let status = 200, delayed: (() => void) | undefined;
  let budgetMode: "normal" | "terminal" | "pending" = "normal", polls = 0, lastRequest: Request | undefined, pollReached: (() => void) | undefined;
  globalThis.fetch = async (_url, init) => {
    if (!init?.body) {
      polls++;
      if (budgetMode !== "pending" || !lastRequest) throw new Error("unexpected fixture poll");
      pollReached?.();
      return new Response(JSON.stringify(budgetReply(lastRequest, "finished")), { status: 200 });
    }
    const request = JSON.parse(String(init?.body)) as Request; requests.push(request);
    lastRequest = request;
    if (budgetMode !== "normal") return new Response(JSON.stringify(budgetReply(request, budgetMode)), { status: 200 });
    if (request.search === "slow") return new Promise(resolve => { delayed = () => resolve(new Response(JSON.stringify(reply(request, 999)), { status: 200 })); });
    return new Response(status === 200 ? JSON.stringify(reply(request)) : status === 401 ? "<html>login</html>" : "null", { status });
  };
  const check = (name: string, passed: boolean, observed?: unknown) => assertions.push({ name, passed, ...(observed === undefined ? {} : { observed }) });
  const root = createRoot(document.getElementById("root")!);
  let current: ReturnType<typeof useBusinessData> | undefined;
  const props = { filter: { site: "all", view: "usage", days: 30, search: "", page: 1 } as BusinessFilter, identity: "admin-a@example.test", ready: false, revision: 0 };
  function Probe() { current = useBusinessData(props.filter, props.identity, props.ready, props.revision); return createElement("output", null, String(current.data?.sources[0]?.data?.totals.credits ?? "unknown")); }
  async function render() { await act(async () => { root.render(createElement(Probe)); }); }
  await render(); check("not_ready_sends_no_request", requests.length === 0);
  props.ready = true; await render();
  check("initial_query_coalesces", requests.at(-1)?.refresh === false, requests.at(-1));
  check("actual_hook_renders_authorized_result", current?.data?.sources[0]?.data?.totals.credits === 42);
  props.revision = 1; await render(); check("first_refresh_true", requests.at(-1)?.refresh === true, requests.at(-1));
  props.filter = { ...props.filter, days: 7 }; await render(); check("filter_after_refresh_coalesces", requests.at(-1)?.refresh === false, requests.at(-1));
  props.filter = { ...props.filter, view: "users" }; await render(); check("tab_after_refresh_coalesces", requests.at(-1)?.refresh === false, requests.at(-1));
  props.filter = { ...props.filter, page: 2 }; await render(); check("page_after_refresh_coalesces", requests.at(-1)?.refresh === false, requests.at(-1));
  props.revision = 2; await render(); check("second_refresh_true", requests.at(-1)?.refresh === true, requests.at(-1));
  props.revision = 3; await render(); check("consecutive_refresh_true", requests.at(-1)?.refresh === true, requests.at(-1));
  props.identity = "admin-b@example.test"; await render(); check("identity_change_without_new_revision_coalesces", requests.at(-1)?.refresh === false, requests.at(-1));
  status = 401; props.revision = 4; await render(); check("401_clears_authorized_snapshot", current?.data === null && current.error === "登录已失效，请重新登录" && !current.busy);
  status = 200; props.revision = 5; await render(); check("authorized_refresh_recovers", current?.data?.sources[0]?.data?.totals.credits === 42);
  status = 403; props.revision = 6; await render(); check("403_clears_authorized_snapshot", current?.data === null && current.error === "当前账号没有跨站数据访问权限" && !current.busy);
  status = 404; props.revision = 7; await render(); check("404_clears_authorized_snapshot", current?.data === null && current.error === "当前账号没有跨站数据访问权限" && !current.busy);
  status = 200; props.filter = { ...props.filter, search: "slow" }; await render();
  props.identity = "admin-c@example.test"; props.filter = { ...props.filter, search: "fast" }; await render();
  await act(async () => { delayed?.(); });
  check("cancelled_old_identity_result_never_overwrites_new_identity", current?.key.startsWith("admin-c@example.test\0") === true && current.data?.sources[0]?.data?.totals.credits === 42);
  budgetMode = "terminal"; props.revision = 8; await render();
  check("unavailable_is_terminal_without_poll_or_global_error", !current?.busy && current?.error === "" && polls === 0);
  check("unavailable_clears_stale_payload_but_preserves_healthy_source", current?.data?.sources[0].data?.totals.credits === 42 && current.data.sources[1].status === "unavailable" && current.data.sources[1].data === undefined);
  const reached = new Promise<void>(resolve => { pollReached = resolve; });
  budgetMode = "pending"; props.revision = 9; await render();
  check("pending_still_polls_alongside_unavailable", current?.busy === true && current.data?.sources[1].status === "pending");
  await act(async () => { await reached; });
  check("pending_finishes_with_bounded_terminal_response", polls === 1 && !current?.busy && current?.data?.sources[1].status === "succeeded");
  check("later_response_removes_previously_successful_source_payload", current?.data?.sources[0].status === "unavailable" && current.data.sources[0].data === undefined && current.data.sources[2].data === undefined);
  await act(async () => { root.unmount(); });
  const failures = assertions.filter(item => !item.passed).length;
  scope.__HOOK_REVIEW = { layer: "actual-react-dom-hook-finite-fetch-fixture", result: failures ? "FAIL" : "PASS", assertions, failures, requests, businessWrites: 0, providerCalls: 0, HTTPServersStarted: 0, SSH: 0 };
}
void main().catch(error => { scope.__HOOK_REVIEW = { result: "ERROR", error: error instanceof Error ? error.stack : String(error) }; });
