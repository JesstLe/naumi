# R4A7 — 商业与后台账号数据归属收尾

## 实施范围与基线

- 独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 原提交 `df177d062c41ef282a4e62696f241fc95e7d6c93`，4206 个原文件的实际字节与 SHA256 保存在 `output/refactor-r4a7-20261025/BASELINE_SOURCE.tar`、`BASELINE.json`。
- 迁走旧 db 最后37个声明与35个生产消费者/67绑定；原子兑换、订单履约、跨表账号管理和旧预占/退款保持完整，不按 SQL 语句拆事务。

## 数据归属

- `billing/card-keys.ts`：卡密发行/状态/兑换/查询，沿原冻结赠额策略与账本事务。
- `licensing/repository.ts`：历史 License 发行、校验、部署激活与查询。
- `payments/orders.ts`：订单记录、保存的商品合同、履约与历史 Pro 授权补发。
- `accounts/administration.ts`：后台账号聚合与用量统计、owner设置、跨表账号删除。
- `billing/legacy-credit-reservation.ts`：旧同步工具预占/退款适配，依旧识别已存在的同步 operation，未知状态不重新生成。
- `access-codes.ts`：两种现有 NOVA 编码格式的共享纯函数，不引入 repository。
- 连接探针归属既有 `platform/db/pool.ts`；该基础层仍无业务 import、无自动 schema 初始化。
- `db.ts` 只留原函数兼容 re-export，没有 SQL、业务函数和初始化实现；生产调用改为直接依赖真实 owner。

## 本轮行为约束

本轮以行为保持为主，不改价格、积分有效期、用户业务限额或原任务身份。旧 reserve/refund 中读取后完全未使用的 auth-mode/native-auth 动态 import 已删除，实际 `creditMeteringEnabled` 及同步 operation 分支保留。

旧 owner 改绑仍有 public namespace 的历史发现逻辑，License 激活/历史 Pro 授权生成仍是原先的多次 SQL 流程；此次迁出不把它们扩大为已完成并发或全量账号迁移改造。集中验收区分真实覆盖与这些剩余边界。

## 结构与行为对照

- `db.ts` **905 → 51 行**；编译发射的生产静态消费者 **35 → 0**。保留原 **223 个导出名称**，门面中执行声明为0。
- 37 个迁移声明均完成 AST 对照，仅删除4处确实未读取的动态 import（每个绑定在原函数中只出现于声明）。36 个其他原源码文件的266个声明保持，实际入口只调整 import。
- 6 个新增业务模块不在任何静态/含动态 import 的依赖环。最大20文件环保持，视频20、图片恢复12、模型组装8和身份/creation/billing7等后续继续。
- 平台 Pool 仍只 import `server-only`/`pg`，max=5，lazy singleton不变；连接探针本身不触发DDL。现有完整 `/api/health` 还读取settings，不能据此声称完整health请求已消除运行DDL。

## 集中验收

输入：`DATABASE_URL=postgresql://fixture:fixture-local-only@127.0.0.1:65453/naumi_refactor_r4a7_fixture`、`NAUMI_VERIFY_ISOLATED_DB=1`、`NODE_OPTIONS=--conditions=react-server`。每部分独立进程与随机schema；无数据库部分单独核验未配置模式。对照使用完整旧/新checkout，不做混合源投影。

```powershell
node --conditions=react-server --import tsx scripts/verify-commercial-admin-owners-pg.ts --baseline --source-root output/refactor-r4a7-20261025/baseline
node --conditions=react-server --import tsx scripts/verify-commercial-admin-owners-pg.ts
```

- BASELINE：6部分 **138检查**，exit0。
- MODIFIED：6部分 **164检查**，exit0。新增26项是兼容出口同函数等价检查，138项原运行行为检查保持；本轮不把它们写成新增26个业务场景。
- 卡密：原冻结7天赠额在current变40天后保持；并发重复兑换只赠一次、跨账号不可再领、禁用/过期、账本冲突全事务回滚均通过。
- 授权：原NOVA格式、状态与到期、同host恢复、顺序设备行为、实际activate HTTP 200/400保持；未把这些顺序用例扩大为激活竞争验收。
- 订单：原990分/17积分/7天合同在current变1490分/99积分/40天后不变；四次并发回调只履约一次，错误金额无赠额，账本故障整体回滚、guest钱包创建、历史Pro顺序补发保持。真实支付签名回调另沿既有entitlements脚本验证，无支付外网请求。
- 后台：原消费统计排除管理员调整、范围与余额投影保持；删除用户在真实trigger报错后恢复全部原事务写入。owner设置核验同邮箱/已存在邮箱拒绝和早期无旧账号fallback；**未覆盖有历史数据的全量改绑成功**。
- 旧预占/退款：metering开关、余额/在途竞争、退款下限保持；实际同步计费上下文先准备6积分合同，旧reserve不再二次预占，unknown保持hold且重进原operation不重复执行、不新扣款。
- 探针：未配置、真实连接、连接失败及实际health HTTP保持，探针前后表数量为0。

相邻回归均exit0：Agent会话隔离、wallet、entitlements（包含真实支付签名handler）、195登录handler、持久任务3/226、R4A6数据家族7/290、持久化6/78与29/90、平台真实PG29。有效settings期望使用原R4A2留存JSON并核SHA，不冒充重新运行原R4A2基线。

平台unit verifier只更新旧“必须import门面”的文本断言为AST核验等价的import+export或直接re-export；同一更新脚本针对旧/新完整源码均 **28/166**通过，业务断言未放宽。全项目tsc与本轮44个TS/TSX源文件及脚本lint均exit0，未运行完整build、浏览器或容量测试。

首次主verifier未按真实工具顺序调用`configuredToolCost`，因此同步operation尚未建立，旧/新均在fixture末尾读state失败；修正fixture准备后完整重跑，生产源码未为此改行为。第一轮完整tsc已通过；最终类型检查再次覆盖修正后的verifier。初次AST统计在架构扫描完成前读取文件导致ENOENT，扫描完成后对照通过，失败日志保留。

四产物、副本字节/行为恢复、补丁重放和提交推送的最终实际证据在 `output/refactor-r4a7-20261025/VERIFICATION.txt`、`DELIVERY.json`。实际候选始终保留新版，回滚只在另一个副本执行。

## 后续

旧大db的数据归属拆分已经收口；R4B的运行DDL/默认bootstrap与配置组装读写分离继续，随后R5 Worker与R6整体验收。历史owner全量改绑、授权竞争及账号删除数据策略分别留在真实owner下处理，未在本次纯迁移中改业务语义。

本轮是上次main同步后的第3个完整模块；收尾普通整合origin/main，结果及计数归零以DELIVERY记录为准。整体重构未完成，独立候选不合main、不部署。
