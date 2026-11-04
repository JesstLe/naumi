import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { accountIdentity, businessFilter, businessNavigation, combinedTotals, hasNextSourcePage, localTime, money, number, sourceRows } from "../src/components/admin/business-data/model";
import { businessEntryView, businessExplicitEntry, businessLocalDetail, businessPresentation } from "../src/components/admin/business-data/entry";
import { adminLinkActive, adminModuleLinks } from "../src/components/admin/navigation";
import { readBusinessResponse, BusinessReadError } from "../src/components/admin/business-data/client";
import { fleetBusinessClientCases } from "./lib/fleet-business-client-cases";
import type { BusinessResponse, BusinessSnapshot } from "../src/components/admin/business-data/types";

const remote = "47105059-0142-4000-8000-000000000047";
const asOf = "2026-11-04T08:00:00.000Z";
/** Create a typed usage snapshot with a configurable credit total and nullable wallet balance for UI/model contract assertions. */
function data(credits: number, balance: number | null = 500): BusinessSnapshot {
  return {
    schemaVersion: 1, view: "usage", asOf, from: "2026-10-05T08:00:00.000Z", observedAt: asOf, timeZone: "Asia/Shanghai", scope: "site", page: 1, pageSize: 30, total: 1,
    totals: { credits, operations: 1, activeUsers: 1, balance, users: 1, artworks: 2, paidOrders: 1, paidAmount: 1800, refundCredits: 3, administrativeDebits: 12 },
    users: [{ email: "same@example.test", name: "同名账户", role: "user", plan: "pro", banned: false, balance, creditsTotal: balance, creditsUsed: balance === null ? null : 0, credits, operations: 1, lastUsedAt: asOf }],
    daily: [{ date: "2026-11-04", credits, operations: 1 }], orders: [], ledger: [], creations: [],
  };
}
function full(): BusinessResponse {
  return {
    requestId: "signed-query-fixture", query: { type: "business.query", view: "usage", days: 30, asOf, search: "", page: 1 },
    sites: [{ id: "local", name: "103 平台", kind: "local", enabled: true, lastSeen: null }, { id: remote, name: "47 企业站", kind: "enterprise", enabled: true, lastSeen: asOf }],
    sources: [{ id: "local", name: "103 平台", kind: "local", status: "succeeded", data: data(7) }, { id: remote, name: "47 企业站", kind: "enterprise", status: "succeeded", data: data(42) }], complete: true,
  };
}
/** Verify actual URL/entry ownership, per-source identity and totals semantics, plus finite response parsing; this matrix does not exercise Next HTTP or production data. */
async function main() {
  let assertions = 0;
  const check = (predicate: unknown, message: string) => { assert.ok(predicate, message); assertions++; };
  const response = full();
  check(!businessExplicitEntry({}) && !businessExplicitEntry({}, true), "bare usage/center entries keep native local owners");
  check(!businessExplicitEntry({ section: "usage" }, true) && !businessExplicitEntry({ section: ["overview"] }, true), "invalid BI section cannot become explicit overview through normalization");
  check(businessExplicitEntry({ site: "all" }) && businessExplicitEntry({ view: "usage" }) && businessExplicitEntry({ section: "overview" }, true), "explicit Fleet scope and valid overview remain available");
  const fleetDefault = businessNavigation(new URLSearchParams("site=all"), { days: 30, page: 1 });
  check(businessExplicitEntry(Object.fromEntries(fleetDefault)) && businessExplicitEntry(Object.fromEntries(fleetDefault), true), "default navigation retains Fleet ownership on both page reloads");
  check(businessFilter(new URLSearchParams()).site === "all", "all sites is the default");
  check(businessFilter(new URLSearchParams("view=bad&days=8&page=-1&site=https://evil.test")).site === "all", "invalid source falls back to registered source selection");
  check(businessFilter(new URLSearchParams("view=bad&days=8&page=-1")).view === "usage", "invalid view cannot select arbitrary data");
  check(businessFilter(new URLSearchParams("view=bad&days=8&page=-1")).days === 30, "bounded period");
  check(businessFilter(new URLSearchParams("page=10001")).page === 1, "bounded page");
  const beforeRapidChanges = new URLSearchParams(`site=${remote}&view=creations&page=2`);
  const afterView = businessNavigation(beforeRapidChanges, { view: "usage", page: 1 });
  const afterSite = businessNavigation(afterView, { site: "all", page: 1, email: undefined });
  const afterDays = businessNavigation(afterSite, { days: 90, page: 1 });
  check(businessFilter(afterDays).view === "usage" && businessFilter(afterDays).site === "all" && businessFilter(afterDays).days === 90 && businessFilter(afterDays).page === 1, "rapid creations-to-consumption then all-sites then period merges each latest URL without a render");
  check(beforeRapidChanges.get("view") === "creations" && beforeRapidChanges.get("page") === "2", "navigation does not mutate a prior render's parameter object");
  const initialUsers = businessNavigation(new URLSearchParams("section=users&email=same%40example.test"), { view: "usage", email: undefined }, "users");
  const usersToAll = businessNavigation(initialUsers, { site: "all" }, "users");
  check(usersToAll.get("section") === "users" && usersToAll.get("view") === "usage" && !usersToAll.has("email"), "rapid navigation preserves non-default entry, explicit usage and account clearing");
  for (const [section, view] of [["overview", "usage"], ["users", "users"], ["orders", "orders"], ["ledger", "ledger"], ["artworks", "creations"]] as const) {
    check(businessEntryView(section) === view && businessFilter(new URLSearchParams(), view).view === view, `${section} uses its cross-site initial view`);
    check(businessFilter(new URLSearchParams("view=usage"), view).view === "usage", `${section} can navigate back to consumption without losing its initial-view context`);
  }
  check(businessEntryView("operations") === null && businessEntryView("models") === null, "unrelated full BI remains under its existing owner");
  for (const key of ["from", "to", "tenantId", "sort", "size"]) check(businessLocalDetail({ [key]: "" }) && businessLocalDetail({ [key]: "" }, true), `${key} legacy deep link stays local even when empty`);
  for (const key of ["q", "accountType", "status", "period", "id", "source"]) check(businessLocalDetail({ [key]: "legacy" }, true), `${key} keeps complete native BI filters`);
  check(businessLocalDetail({ detail: "local" }, true) && !businessLocalDetail({ section: "users" }, true), "explicit local detail preserves management, default user entry is federated");
  check(businessLocalDetail({ email: "same@example.test" }, true) && !businessLocalDetail({ email: "same@example.test", view: "ledger" }, true) && !businessLocalDetail({ email: "same@example.test", site: remote }, true), "legacy account deep link is local while explicit cross-site drilldown stays federated, including initial-tab links");
  check(businessPresentation("usage", "overview").active === "overview" && businessPresentation("usage", "overview").localHref === "/admin/center?section=overview&detail=local", "overview keeps correct navigation and complete native analytics link");
  check(businessPresentation("users", "users").localHref === "/admin/center?section=users&detail=local", "user mutations remain reachable at native owner");
  check(businessPresentation("creations", "artworks").active === "creations" && adminModuleLinks.creations?.some(link => link.href === "/admin/creations") && adminModuleLinks.creations?.some(link => link.href === "/admin/center?section=artworks"), "full creation manager and cross-site metadata entry coexist");
  check(!adminLinkActive("/admin/center?section=users", "/admin/center", new URLSearchParams("section=users&detail=local")) && adminLinkActive("/admin/center?section=users&detail=local", "/admin/center", new URLSearchParams("section=users&detail=local")), "read-only data and native mutation navigation do not both appear active");
  const centerSource = readFileSync(new URL("../src/app/admin/center/page.tsx", import.meta.url), "utf8");
  check(centerSource.includes('process.env.FLEET_CONTROL_ENABLED === "1"') && centerSource.includes("businessLocalDetail(query, true)") && centerSource.includes("initialView={initialView}") && centerSource.includes('<PlatformConsole embedded />') && centerSource.includes('<BiDashboard initialSection={section} />'), "center dispatch wires FLEET only and preserves complete legacy component paths");
  check(combinedTotals(response)?.credits === 49, "actual 103+47 consumption is included");
  check(combinedTotals(response)?.activeUsers === 2, "same email remains two site accounts");
  check(combinedTotals(response)?.refundCredits === 6, "refunds remain separate, not silently netted");
  check(combinedTotals(response)?.administrativeDebits === 24, "admin adjustments do not become extra consumption");
  check(accountIdentity("local", "same@example.test") !== accountIdentity(remote, "same@example.test"), "identity is namespaced by site");
  check(sourceRows(response.sources[0], "users")[0].sourceId === "local", "local row has true source");
  check(sourceRows(response.sources[1], "users")[0].sourceId === remote, "remote row has true source");
  const partial = full(); partial.complete = false; partial.sources[1] = { ...partial.sources[1], status: "unknown", data: undefined, error: "数据连接器待更新" };
  check(combinedTotals(partial) === null, "missing remote is not zero or complete local-only total");
  check(sourceRows(partial.sources[1], "users").length === 0, "unknown source has no invented rows");
  const capped = full(); capped.complete = false; capped.sources[1] = { ...capped.sources[1], status: "unavailable", error: "汇总结果达到大小上限，请选择该站点查看" };
  check(combinedTotals(capped) === null, "budget-limited source never becomes a complete global total");
  check(sourceRows(capped.sources[1], "users").length === 0 && sourceRows(capped.sources[0], "users").length === 1, "unavailable stale rows are excluded while healthy rows remain visible");
  capped.sources[1].data!.total = 100;
  check(!hasNextSourcePage(capped), "unavailable stale data cannot enable next page");
  const orphan = full(); orphan.sources[1].data = data(42, null);
  check(combinedTotals(orphan)?.credits === 49, "known consumption survives unknown orphan balance");
  check(combinedTotals(orphan)?.balance === null, "unknown balance never becomes zero");
  check(number(null) === "—" && number(0) === "0", "explicit missing vs zero rendering");
  check(money(1234) === "¥12.34", "order cents render correctly");
  check(localTime(null) === "—", "missing date is not a fresh timestamp");
  check(!hasNextSourcePage(response), "single complete page");
  response.sources[1].data!.total = 31;
  check(hasNextSourcePage(response), "next page follows every source, not merged duplicate emails");
  const fetchBefore = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify(full()), { status: 200, headers: { "content-type": "application/json" } });
    check((await readBusinessResponse("/api/admin/business", new AbortController().signal)).sources[1].data?.totals.credits === 42, "validated source result reaches client");
    globalThis.fetch = async () => new Response(JSON.stringify(capped), { status: 200 });
    const acceptedCap = await readBusinessResponse("/api/admin/business", new AbortController().signal);
    check(acceptedCap.sources[1].status === "unavailable" && acceptedCap.sources[1].data === undefined && acceptedCap.sources[0].data?.totals.credits === 7, "explicit response budget state strips stale data without rejecting healthy sites");
    globalThis.fetch = async () => new Response(JSON.stringify({ ...capped, complete: true }), { status: 200 });
    await assert.rejects(() => readBusinessResponse("/api/admin/business", new AbortController().signal), /尚未完整返回/); assertions++;
    const mismatch = full(); mismatch.sources[1].data = { ...mismatch.sources[1].data!, asOf: "2026-11-03T08:00:00.000Z" };
    globalThis.fetch = async () => new Response(JSON.stringify(mismatch), { status: 200 });
    await assert.rejects(() => readBusinessResponse("/api/admin/business", new AbortController().signal), /回执与当前查询不一致/); assertions++;
    const stale = full(); stale.sources[1] = { ...stale.sources[1], status: "unknown", data: data(999) }; stale.complete = false;
    globalThis.fetch = async () => new Response(JSON.stringify(stale), { status: 200 });
    check((await readBusinessResponse("/api/admin/business", new AbortController().signal)).sources[1].data === undefined, "old success payload cannot survive unknown status");
    const duplicate = full(); duplicate.sources[1].id = "local";
    globalThis.fetch = async () => new Response(JSON.stringify(duplicate), { status: 200 });
    await assert.rejects(() => readBusinessResponse("/api/admin/business", new AbortController().signal), /站点回执格式异常/); assertions++;
    globalThis.fetch = async () => new Response("not-json", { status: 403 });
    await assert.rejects(() => readBusinessResponse("/api/admin/business", new AbortController().signal), error => error instanceof BusinessReadError && error.status === 403); assertions++;
  } finally { globalThis.fetch = fetchBefore; }
  const transportCases = await fleetBusinessClientCases(readBusinessResponse, BusinessReadError);
  assert.deepEqual(transportCases.filter(item => !item.passed), [], "HTTP failures preserve normalized messages and status");
  assertions += transportCases.length;
  console.log(`FLEET_BUSINESS_DATA_UI_CONTRACT=PASS assertions=${assertions} realBusinessWrites=0 SSH=0`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
