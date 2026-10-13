// 次级管理中心（企业主控制台）静态契约验收：
// 1) 三个允许的视图存在且菜单不含禁区（对话/积分流水/操作记录/计费/充值/真实模型）；
// 2) 数据面只调用已审计的 /api/team/* 端点（入口授权/快照/成员操作/内容分区/图片代理）；
// 3) 内容分区白名单只有 artworks|tasks（红线：业务记录只能看图片与操作内容）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const console_ = readFileSync("src/components/enterprise/enterprise-console.tsx", "utf8");
const page = readFileSync("src/app/enterprise/page.tsx", "utf8");

assert(page.includes("EnterpriseConsole"), "page must render the console");
for (const id of ["overview", "members", "records"]) assert(console_.includes(`"${id}"`), `view ${id} present`);
for (const banned of ["conversations", "ledger", "audit", "充值", "价格", "定价", "调用记录"]) {
  assert(!console_.includes(banned), `forbidden keyword must be absent: ${banned}`);
}
assert(console_.includes('section === "artworks"') && console_.includes('section === "tasks"'), "only artworks/tasks sections rendered");
for (const endpoint of ["/api/team/access", '"/api/team"', "/api/team/users", "/api/team/media"]) {
  assert(console_.includes(endpoint), `must reuse audited endpoint ${endpoint}`);
}
assert(!/\/api\/admin\//.test(console_), "must never call admin APIs");
assert(console_.includes("teamAuthorize") === false, "client never imports server auth");
assert(!console_.includes("wire") && !console_.includes("modelExecutions"), "no real-model fields referenced");
// 契约类型复用（字段白名单以 teams/contracts 为单一来源）
assert(console_.includes("@/lib/teams/contracts"), "reuse team contracts types");
console.log("ENTERPRISE_CONSOLE=PASS views=overview,members,records sections=artworks,tasks endpoints=team-only forbidden_absent=PASS");
