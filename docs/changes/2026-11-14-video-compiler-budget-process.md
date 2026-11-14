# 视频编译器：冻结预算确认与真实 HTTP 恢复

## 模块与职责

基线 `012a6918cd2a930b7ba3ba699cefadf29d95b62a`，独立分支 `codex/video-compiler-budget-exit-20261114`。对应 RFC A12/A14：阶段最终报价超出原制作链授权时，必须先停下，准确展示报价，再经实际 HTTP 确认恢复原链；不得通过猜更大金额解决循环，也不应删除原预算约束。

## 已复现问题

真实 `/api/video/workflows` 受理后，在本机隔离随机schema中设置历史欠授权预算检查点：原授权1、冻结售价实际17。只改变测试检查点的预算，不伪造阶段状态、任务、确认、供应商回执或积分。

独立应用Worker按真实代码停为 `needs_confirmation`，task/预占/账本/供应商0。随后GET仍返回旧报价1；像现有Storyboard和Agent一样发送该报价确认，HTTP200，但仍停为 `needs_confirmation`。基线实际输出：

```text
BUDGET_BASELINE_REPRO=CONFIRMED DISPLAYED=1 REQUIRED=17 CONFIRM_RETURNS=200 STATUS=needs_confirmation TASKS_ADDED=0 PROVIDER_POSTS_ADDED=0
```

基线断言1≠17、exit1，失败完整保留。

**证据边界**：这是恢复已持久化欠授权检查点的真实HTTP/Worker验收。不是声称当前固定价正常准入会自然从1涨到17，也没有改生产数据来制造故障。

## 公共接口、依赖方向与数据归属

- `workflow-budget.ts` 只拥有公开阶段报价类型、带报价的 `WorkflowBudgetChanged` 及确认匹配规则；依赖计费类型，不依赖Route/React/DB。
- 最终报价检查仍在 `workflow-compiled.ts` 的原冻结上下文；超预算异常携带服务端实际报价的窄投影，不携带凭据或执行计划。
- `workflow.ts` 继续拥有制作链状态、原操作身份、锁和确认事务。在设置 `needs_confirmation` 的同一SQL里保存 `confirmation_quote`；普通失败不伪造新报价。
- `app_video_workflow_run_nodes.confirmation_quote jsonb` 是扩展列，由既有schema owner安装；原 `frozen_nodes_enc`、`public_frozen_nodes` 保持不变，不把补确认提案伪装成原授权。
- GET的已有 `node.quote` 在待确认时投影实际待确认金额，并另含 `frozenQuote`，无需客户端重新报价或选择模型。
- 确认入口仍持原advisory锁和run/node行锁；有提案时，版本不符、金额不足或非整数返回409 `WORKFLOW_CONFIRMATION_STALE`，不改确认或阶段状态。旧行无提案时保留原恢复路径；下一次真实预检发布所需报价。
- Storyboard按钮明确显示本次确认金额；Agent继续复用已有 `stage.quote`，不新增第二套定价。
- 正式任务受理、积分预占/单结算、UNKNOWN、原冻结model/binding/credential及幂等语义不变。

## 实现与迁移状态

1. 新等待状态：服务端准确发布所需报价；原预算永久保留。
2. 成功恢复：实际HTTP确认、并发确认、独立Worker落片和单笔账本。
3. 失败边界：跨用户404、陈旧版本/不足/小数409且零副作用，待确认取消后禁止继续。
4. Worker重启后提案与原预算仍可读；历史无提案检查点通过既有确认路径重新建立提案，不静默放行。
5. 扩展列可留在数据库，代码回退不删除列、不回灌业务表；旧代码继续读旧字段，但其旧报价循环会恢复，不能冒称旧版包含修复。

## 验证命令、结果与证据层级

证据根目录：`E:/Workspace/naumi/output/video-compiler-budget-process-20261114`。

```powershell
$env:NAUMI_VERIFY_ISOLATED_DB='1'
$env:DATABASE_URL='postgresql://postgres:video_compiler_local_fixture@127.0.0.1:15579/video_compiler_fixture'
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-video-compiler-process.ts --projected-worker-env --budget-process --workflow-process
```

首轮源工作树：预算7项＋底座14项＋Workflow13项，共34项，exit0。核心137、App138、完整TypeScript通过。独立解包最终 `copy-runtime/run-5612f8d8-849f-489a-8229-63e579bba88a` 完成75项组合，exit0：预算10（其中成本加成cap为纯规则检查）、底座14、工作台4、Canvas10、Workflow13、BYOC8、Agent6、远程工作流10。测试账本21笔347 fixture积分；预算新增1笔17；13子进程退出，两个浏览器上下文关闭，schema和pool清理。独立副本回退十路径原始哈希后，测试驱动覆盖原产品再次复现旧确认循环（预期exit1）；随后移除测试覆盖，原App138检查exit0。回滚准备时出现过换行哈希预检失败，两个仅底座14项的bootstrap运行保留但不计作回滚证明。

这些结果不是完整Storyboard确认按钮的真实浏览器操作证明；本轮按钮金额修改通过完整类型和整体画布回归，专用Storyboard浏览器验收继续。

## 未完成项与下一步

本切片不完成整个RFC。Canvas上传/连线/提及等价、完整Storyboard编辑审片成片、全在用/env-only绑定审计、固定生产Next构建、Linux活动中断/混合历史版本/蓝绿仍继续。旧开发缓存曾出现的冷加载异常也未据此宣布修复。

总目标ACTIVE；47 HOLD；生产schema/配置修改0、真实付费0、部署0。
