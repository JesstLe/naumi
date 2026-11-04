# Fleet 验证器：每条普通读独立生成 asOf

## 基线与问题

PR #11 review `5773394710`、inline `4471418645` 覆盖 `429a3d85470e0217647532845882d3b0ad1b274f`。唯一新增 Minor 是测试可靠性：queue compatibility 调用方在进入整轮控制矩阵时只生成一次 `asOf`，被各场景共用；每个 tick 都启动子进程，慢环境下后续正常场景可能已越过生产 90 秒派发期限，误测成过期读。

本轮只改测试脚本、CI 接线和文档，不改任何 `src/` 产品文件。原三个文件的 SHA256 保存在 `output/fleet-business-fixture-clock-20261105/BASELINE_SOURCE.json`；Git 的 `src` 子树也纳入最终封存校验。

## 实现与职责

`verifyFleetBusinessControlPriority` 的普通读改为：

```ts
const readAt = (asOf = new Date().toISOString()) => ({
  type: "business.query" as const, view: "usage" as const, days: 30 as const,
  asOf, page: 1, search: "",
});
```

- 五处普通 enqueue 调用 `readAt()`，默认参数在每次调用时求值，每条命令获得独立对象和当前时间。
- 六处显式输入继续传入原表达式：一个 -120 秒、一个 -60 秒、三个明确新鲜时刻和一个非法 timestamp。没有刷新或放宽过期反例，也不重写已入队 operation/receipt。
- `Fixture.asOf` 与唯一调用方的共享 asOf 一并移除；该输入不再被其他路径使用。
- 产品的 90 秒规则、中央 UNKNOWN、控制优先/FIFO、状态/ACK、页面入口、权限和账务均不修改。

## 确定性验证

新增 `scripts/verify-fleet-business-enqueue-clock.mjs`：使用 TypeScript AST 读取实际 producer 与 enqueue 表达式，再在独立 VM 的 Date 时钟中执行。它不复制 producer 实现，不改真实全局时间；时钟从起点推进 105,000ms，检查五处正常输入各自新鲜、返回独立对象且不修改旧对象，同时核对六处显式场景的时间差与非法输入。原函数类型与真实调用方也被检查，避免共享参数残留。

该检查是**真实脚本源表达式的数据流验证**，不是完整 PG/HTTP、实际慢 GitHub runner、容量或生产验收。没有等待真实 90 秒，也没有为通过测试提高产品期限。

实际执行：

- 原 429 源码：`FLEET_BUSINESS_ENQUEUE_CLOCK=REPRODUCED assertions=32 failures=13`，exit 1。五处普通调用复用旧时间/同一个对象，另有共享参数残留；这是一个根因的多项断言，不是 13 个产品缺陷。
- 修改版：32/32、exit 0；显式 -120/-60 秒、三个新鲜时刻、非法输入全部保留。
- 原真实隔离 PG/HTTP 全矩阵重新执行：控制优先 23/23、业务时效 20/20、完整 protocol **144/144**，exit 0；付费调用和积分调整 apply 为 0。
- 全库 `tsc --noEmit --incremental false` 无输出、exit 0。没有因测试脚本小修重复跑无关页面/供应商/付费流程。

新 clock 检查已接入既有 `fleet-business` workflow，并上传 modified result JSON。此前 429 的快速本地 PG 矩阵已经通过；不将本确定性检查写成“旧版真实慢 CI 已复现”，尤其旧远端作业还存在 steps=0 的账单阻塞。

## 四产物与交接

本切片五文件封装到 `output/fleet-business-fixture-clock-20261105/final/`：修改 ZIP、diff、完整命令/输入/字面输出验证记录、可执行 copy-only rollback。独立副本恢复三个原文件并移除两个新增文件；clock harness 从工作树外读取实际恢复后的两个源文件，重新出现原 13 项失败。后续编辑须触发首写前零写拒绝；工作树与 ZIP 留修改版。

最新 SHA、CI、复审和 `src` 子树未变的结果统一写入 `FINAL_SEAL.json`。本地通过不是远端通过；当前未合 main、未重建或发布 103/47、未完成生产数据核对或用户验收。保持现有 PR 跟进，不重复触发旧 SHA 审查或重跑旧失败 job。
