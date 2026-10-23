# 历史供应商额度不足：本地 OPEN benchmark

- 基线：`d7461ee734f886bbaa2649c92e4a4fa1f0de1992`；只增加本脚本与本文档，不改产品源码/依赖，不 push、SSH、联网供应商或发布。生产 **HOLD**。
- 历史依据：`E:/Workspace/naumi/output/recent-admin-failures47-20261023/REPORT.md` 与同目录快照。09:10:12—09:40:12 的失败逻辑请求为 **24 = 22 供应商403额度不足 + 2 供应商侧完成但应用未取得完整图片**；24父＋24子不是48次生成。后2笔不在本脚本覆盖范围。
- `snapshot-02.txt:27` 的 `LOG_SUMMARY.last` 仅保存403额度不足日志摘要（不推断数值货币单位）。`supplier_error_samples` 只有状态/哈希等元数据，未留完整原始 body。因此本脚本保留摘要文字与403状态，**JSON envelope、prompt、模型、通道、图片均为本地 fixture，不是员工 exact 输入或原始 body 复放**；不读取/提交员工 prompt、账号、凭据。

## 实现与判断

复用 `createModelFixture` 的 UUID schema、`createModelExecutor.resolve/describe` 冻结双通道和真实 `channelRoutingFetch`，本地 A 返回403额度不足且没有 `not_charged`，B可返回有效PNG。实际调用必须满足403、A POST1、B POST0、仅A执行阶段一次、HTTP发出时持有lease、结束后lease0。当前 `channel-fetch.ts` 的非显式 `not_charged` 图片4xx早退保留，故输出 **`QUOTA_CASE=OPEN`，不是修复 PASS**。本次报价/并发改动不保证解决这22笔故障。

独立对照人为添加 `billing_status: not_charged`，验证既有fallback产生200和A1/B1，返回PNG字节一致；对照不证明历史供应商未扣费，也不改变 OPEN。脚本不调用用户账务、未建立客户余额/预扣表，输出 `ACCOUNTING=NOT_EXECUTED CUSTOMER_BALANCE=NOT_VERIFIED`；**不声称验证客户扣费0或余额**。历史报告记载的客户consume0与本地测试证据分开。

## 集中运行

仅使用父提供的独立PG；脚本拒绝其他host/port/database。复用授权的完整本地 `node_modules` junction，不安装依赖。

```powershell
$env:DATABASE_URL='postgresql://fixture:fixture-local-only@127.0.0.1:65434/history_benchmark'
$env:NAUMI_VERIFY_ISOLATED_DB='1'
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-imagegen-history-supplier-quota.ts
```

2026-10-23 集中实测输出，退出 **0**（观察与当前语义一致，**不是历史故障已修复**）：

```text
QUOTA_CASE=OPEN STATUS=403 A_POSTS=1 B_POSTS=0 LEASED_POSTS=1 LEASES=0 ACCOUNTING=NOT_EXECUTED CUSTOMER_BALANCE=NOT_VERIFIED SOURCE=SUMMARY_FIXTURE EXACT_REPLAY=0
NOT_CHARGED_CONTROL=EXPECTED_FALLBACK STATUS=200 A_POSTS=1 B_POSTS=1 LEASED_POSTS=2 LEASES=0 ACCOUNTING=NOT_EXECUTED CUSTOMER_BALANCE=NOT_VERIFIED
ISOLATED_SCHEMA_CLEANUP=PASS SCHEMA_EXISTS=0
```

脚本在 `finally` 关闭应用pool、删除自己随机schema和关闭本地HTTP，再用独立连接确认schema不存在；不移除父PG容器，不清其他schema。任一断言失败退出1。

首次本地启动误用了主目录 React18 依赖，报 `This entry point is not yet supported outside of experimental channels`，未进入用例。已改为父授权的完整 React19 junction，精确结束该次自有测试进程并核实/删除其唯一空随机schema；随后上述整模块运行完成，未改依赖内容或产品源码。

父benchmark应将这22笔列为**已复现但未解决**；另外2笔交付异常仍未覆盖。未做线上验收、员工exact replay或客户账务验收；生产继续 **HOLD**。
