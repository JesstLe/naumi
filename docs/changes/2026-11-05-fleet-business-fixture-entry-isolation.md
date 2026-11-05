# Fleet 验证入口：连接和 DDL 前隔离

## 已核验的入口缺口

CodeRabbit 汇总评论 `6632233901` 在覆盖 `45969b3` 的架构说明中指出：protocol verifier 将 DATABASE_URL 原样传入 Pool，并在 retained helper 之前执行 schema reset。`85e95a44` 已修复 helper 自身的 host/port 参数覆盖，但其校验不会倒推保护先前的连接或 DDL。

本轮以 `85e95a44` 为基线复核，确认三个可执行入口和两个 exported 写入辅助函数需要前置约束：protocol main、receipt worker、central/source worker、queue compatibility、control priority。central HTTP verifier 本身使用固定 URL 创建 Pool、覆盖应用环境并派生子进程；它检查的 supplied URL 没有被转发，因此没有为该处制造额外“外部 URL 已连接”的结论。

## 实现

- 新增纯配置模块 `scripts/lib/fleet-business-fixture-url.ts`。调用必须有明确 isolation flag，只接受 postgres/postgresql、字面 `127.0.0.1:65298`、query-free/fragment-free URL，以及每个入口的固定 DB 或严格生成名。
- protocol 在任何 Pool 构造和 schema reset 之前校验，再把应用环境绑定为该 URL。两个 worker 在产品 pool/connector 导入前校验；tick/source、poll/central 的配对检查与未知模式拒绝也发生在导入之前。
- queue compatibility 在 CREATE DATABASE 之前同时检查实际传入 Pool URL 与应用环境，要求完整配置一致；随机 source URL 由该已核验 URL 派生并再次按 receipt 名称规则校验。
- control priority 在产品服务导入或任何控制写入前检查实际 central/source Pool；HTTP origin 的原 loopback 约束继续保留。
- 原 retained helper 的更窄 host/port 拒绝保留不动。允许无路由参数的 retained helper 对照不等于允许 destructive verifier 入口携带查询参数。
- 校验错误不包含原始连接串或凭据。此模块只是 fixture 配置边界，不证明生产数据库身份、RLS/归属、外部 producer 冻结或正式发布许可。

## 验证层级和记录

新增 `verify-fleet-business-fixture-entry.mjs` 执行五个完整实际入口函数的 AST，并执行它们真实导入的配置规则。只有 Pool/SQL/产品导入的 first-I/O 边界被有限替代；无真实连接、DDL 或网络。反向对照检查路由参数、编码/重复参数、所有查询或片段、错误协议/端口/数据库、缺 flag、实际 Pool 与环境不一致。正常 URL 必须到达有限 I/O 边界，避免用全拒绝假装通过。

原版158项中106失败；修改版、既有 retained URL 专项、真实本地 protocol/central HTTP 集成及全库 TypeScript 的实际集中结果，以作者本地 `output/fleet-business-fixture-entry-20261105/final/VERIFICATION.txt` 为准。baseline 和副本恢复的 DDL 计数只表示有限边界内记录到调用，不代表执行过 SQL。正向真实本地 PG 另行记录，不把 AST/有限 I/O 结果冒充完整程序的真实运行。

首次152项矩阵和真实集成均通过后，独立源码复核发现 worker 模式/数据库配对仍在 pool 导入之后。已保留初版 runner、worker、完整命令与输出，增加三组错配/未知模式对照并将检查前移；最终158项矩阵、受影响的 central HTTP 与类型检查集中重验。protocol 与 retained URL 的相关源码在这次顺序修正中没有变化，沿用同轮已通过的实际记录。

Workflow 接入新专项和具名 JSON artifact 路径。四份本地产物记录原始哈希、实际副本恢复、later-edit 零写保护与复开；它们不是远端 CI 上传成功或生产回退证明。

## 发布状态

公共业务 admission 继续硬性关闭，生产发布保持 **PREPARATION ONLY / HOLD**。未合 main、未部署103/47、未进行生产操作。Docstring 汇总警告仍开放；新 HEAD 的完整复审、CI 和现场发布准入分别记录。
