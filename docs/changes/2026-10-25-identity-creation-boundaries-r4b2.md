# R4B2 — 身份、账务与创作上下文的职责边界

## 基线与目标

- 独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 基线 `2c48cb94aa43175093cf6848b17a71a4789941cc`；4225个原文件的实际字节与SHA保存在 `output/refactor-r4b2-20261025/BASELINE_SOURCE.tar`、`BASELINE.json`。
- 承接R4B1，拆开身份、账务和创作上下文的7文件环。不是改写认证或引入第二套账务。

## 实现

1. `accounts/mode.ts`拥有原生多用户模式事实与事务内设置读取；计费runtime不再依赖会话签名模块。
2. `billing/metering.ts`拥有原 `creditsMeteringOn` 兼容逻辑；与 `meteringFor` 的legacy语义差别明确保留，不把多用户模式与手动计费误合成一个判断。
3. `feature-access/repository.ts`拥有账户权限读取、管理员写入的CAS/幂等审计和原错误类型。HTTP身份解析、请求门禁及工具入口仍属于 `server.ts`，底层创作访问不再导入HTTP授权适配器。
4. `saas/creation-scope.ts`拥有唯一AsyncLocalStorage、冻结scope校验与原ID生成。HTTP入口、账务、作品和恢复任务引用同一store；旧出口返回同一函数，不生成第二份上下文。
5. `saas/creation-access.ts`拥有项目/媒体归属和有效创作权益；writer不再反向导入HTTP请求适配。`creation-context.ts`保留请求摘要、签名continuation、路由包装及旧兼容导出。
6. 实际生产消费者改为引用职责owner；不是只加一层门面。无业务单价、权限策略、参数、任务协议或数据库schema变更。

## 结构与行为保持

- 25个抽出声明及48个原源码文件中的339个保留声明AST一致；45个生产消费者90绑定切换owner。
- 原身份/账务/创作7文件动态环已拆开，5个新owner无环。HTTP创作上下文的生产静态消费者47→21，剩余调用者是真正使用HTTP请求包装/continuation的入口。
- 当前最大的20文件视频环、12文件图片恢复环仍存在；不将局部解环写成全项目无环。

## 集中验收结果

输入为 `DATABASE_URL=postgresql://fixture:fixture-local-only@127.0.0.1:65455/naumi_refactor_r4b2_fixture`、`NAUMI_VERIFY_ISOLATED_DB=1`、`NODE_OPTIONS=--conditions=react-server`。每组使用随机schema，完整baseline来自本轮4225文件原始字节，不是局部投影。

```powershell
node --conditions=react-server --import tsx scripts/verify-identity-creation-boundaries-pg.ts --baseline --source-root output/refactor-r4b2-20261025/baseline
node --conditions=react-server --import tsx scripts/verify-identity-creation-boundaries-pg.ts
```

- 完整旧版8组168检查、新版8组171检查均exit0。baseline的冷导入auth耦合按原行为复现，新版scope/底层policy/billing service不再加载HTTP创作适配和admin-auth；两边冷导入的应用pool连接数均0，没有创建业务表。schema建立/检查使用另一个fixture管理池，不计作应用读写。
- 原生/Supabase模式、环境开关、事务内设置回滚及手动metering与legacy-auto差异保持；新增owner与兼容导出同函数。
- 8路并发scope、嵌套退出/异常恢复共享唯一AsyncLocalStorage；旧出口和新owner观察同一个对象，无跨请求混入。
- 实际cookie、原生管理员、二次后台口令、封禁、密码撤权、到期及reset/user token隔离保持。权限CAS竞争只一笔成功，命令重复返回原结果；审计写入注入失败时权限变更同事务回滚。
- 实际个人文字项目绑定、跨账号/工作空间拒绝、历史receipt不补归属、项目事务回滚、媒体归属、HTTP摘要及签名continuation正负例通过。
- 实际钱包/creation链将原7版6积分报价在current已改99积分后结算为6；重复扣款一笔，真实余额不足不留operation，reserve与创作链接同事务回滚，unknown保留原预占与原operation。供应商与外部网络调用均0。
- 相邻原脚本：195用户真实登录handler、完整feature-access、wallet、entitlements、creation-writers均exit0；writer包含实际企业权益、输入证据故障、跨租户素材、视频恢复和批次取消。所有脚本只运行于本轮loopback PG及自有随机schema，writer媒体输出定向到本轮专有cwd。
- 全项目tsc和本轮54个TS/TSX文件lint最终exit0。1371个生产源文件与结构分析时的hash一致，fixture修正没有改变生产源码。未运行full build、产品浏览器、外部供应商或容量验收。

## 原始失败与修正

第一次集中运行中，verifier错误地认为共享imagegen入口只关闭generate就必然拒绝；原catalog允许共享端点的替代权益，因此旧版和新版同样在该fixture断言失败。修正为测试明确的creation=false关闭，不改变既有权限实现。另有5个TS诊断均来自verifier动态BillingService推断为unknown，补明确类型后通过。原 `BASELINE_1.log`、`MODIFIED_1.log`、`TSC_1.log`、`attempt1/`与 `FIXTURE_CORRECTIONS.json` 保留；仅重跑主A/B与tsc/lint，没有重复已通过的相邻suite。

## 未完成边界

本模块不移除所有请求ensure或增加启动hook；显式Web/Worker生命周期和其余模型/账务组装继续R4B。视频20与图片恢复12文件环、外围UI、多tab CAS、R5 Worker及R6完整候选build/CI/性能容量仍在后续台账。

本轮是main同步后的第2模块；不合入main、不部署、不接管发布锁。四产物、副本回滚、提交/推送及最终结果在 `output/refactor-r4b2-20261025/VERIFICATION.txt`、`DELIVERY.json` 实读记录。
