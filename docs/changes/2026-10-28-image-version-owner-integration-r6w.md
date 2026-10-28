# R6W：原位重生成与版本历史接入既有 owner

## 模块、基线与职责

独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`；基线 `0145812070fca641e0f9b681585600288763fc61`。本轮整合固定 main `cfb6f80033fd89885f1337d6fbe83d82c663e253` 的 4 个提交、28 个路径。完整 4758 个原始文件已归档、逐文件 hash 检查并重新打开；原始 main 也有独立归档。

保留主线已实现的产品行为：普通图片主操作在原节点重生成，原始媒体和生成回执不可变，显示版本独立持久化；明确的三视图等工具仍派生；旧任务迟到、锁定或节点删除时不覆盖当前显示。

## 公共接口、依赖、数据与事务归属

- `canvas/image-version-store` 拥有版本历史、显示版本 CAS 和挂载回执。原 owner 账户事务锁、行锁、operation 身份、旧图与原媒体规则保留；改为直接使用 platform pool、窄 creation-access 和 creation-scope，不经 `db` 或上下文大出口组装。
- 原 `app_artworks` 两列进入既有 persistence schema；主线版本表原 SQL 进入 `canvas/storage-schema` 的 pool-scoped readiness，并由 application persistence startup 显式初始化。没有新增表、钱包或任务体系。
- 作品显示与原媒体读取归 `artworks/row`、`artworks/repository` 和原 DTO。`listArtworksByIds(...,{original:true})` 保留任务回执原图；`db.ts` 保持纯兼容出口，不恢复实现。
- 正常及恢复的结果落库仍共用 `complete-image-delivery`，原位生成输出标记在该唯一 writer 中处理。父任务挂载版本保留本分支原有的实际结算与 partial 口径，未恢复 main 的旧双份交付、旧 `childCharges` 或 Route 执行代码。
- HTTP 兼容轮询的 `canvasAttachment` 进入既有 `generation-query`，Route 保持薄传输适配。
- `image-version` 进入共享 history contract/compiler/controller，读取当前 artwork 后冻结 expected revision；重试、ABA、scope、回执、撤销重做继续由原 controller 负责，不复制 main 的独立 historyAttempts 状态。
- 普通生成意图归 `image-creation`，FormData 与目标快照归 `image-task-request`，提交/轮询/失败恢复归原 `image-task-controller`。原位结果和原任务恢复共用 `createCanvasImageVersionAttachment`：只合并原节点，不写位置、不添加派生节点。
- 原位等待/失败的渲染归 scene projection 与 artwork renderer，历史入口归已有 image composer。历史读取使用 document scope；主组件只保留小型调用适配，不恢复内联提交/轮询/版本写入循环。
- 创作素材的 `storage_snapshot` 沿主线实现冻结实际输入像素；后续节点换图不改写历史输入证据。

## 实现与迁移状态

8 处 Git 合并冲突均已按已有 owner 迁入，索引已逐路径解决，未恢复巨石实现。原始 Route、db、creation-context 保留本分支实现；main 变更迁入实际职责文件。主线取消的独立“重做”按钮已从 composer 移除，普通主操作显示“重新生成”；已有失败任务按钮仍恢复原 operation，不把未知提交改成一次新购买。

本分支已有 partial delivery 语义继续保留：不完整结果进入历史，但不覆盖当前图片。初次整合脚本的 Python 字符串转义、错误定位到已瘦身 Route、以及旧 import 空格断言失败均保留日志；这些失败发生在缓冲写入前，不记为产品回归通过。

## 集中验证与未完成项

已完成首轮模块集中验证：真实 Canvas adapter/creation owner 基线保留派生行为，新版普通主操作原位执行、独立重做入口退休；新 request/projection/history/attachment/row 合同 9 组检查通过；真实隔离 PG 16 组版本操作通过；完整真实生成入口和 loopback 供应商管线通过，1 次成功结算、UNKNOWN 重放新增 POST=0。完整固定候选 core、镜像及产品控件验收尚待执行。版本 CAS、同任务重放、并发、锁定/删除、原始图片、创作素材快照和未知状态禁止重 POST 都须验证；不以源码静态存在代替运行结果。

本轮不合入 main、不部署。R6V 的通过记录只作前序证据，不自动升级成本轮验收；整体重构目标继续，剩余 UI 组装、实际 CI 设置和同机性能对照仍未完成。

## R6W 集中检查与具体修正

- 真实 startup fixture 已扩为 41 个显式 owner，版本表 SQL 仍只有 storage-schema 一个 owner。
- 当前 TypeScript exit 0；Next lint exit 0，保留既有 warnings，不写成零警告。静态、全 import、emitted 静态、emitted 全 import 四类 SCC 均为 0；原有 release fixture 两条 lib→app 与 billing toast 一条 lib→UI 仍单列，不虚报全部反向边已消除。
- 复现并修正已有内联 Data URL 的兼容拒绝：`expectedImage` 是已持久化媒体身份，不是新输入网址；提交和 history 的 4096 字符限制移除，真实两个 schema 通过 6,600,022 字符合同检查。原 owner/scope/revision/素材授权不变，不引入新限额。
- 退役 `retryCanvasImageCreation`：生产搜索仅剩已删除按钮的失效 import，无真实调用方；已删除未使用的旧应用分支，历史源验收仍从基线副本读取，不重新增加生产按钮来满足旧脚本。
- 模块 fixture 首轮缺 VM process、随后缺 sourceNodeId 的准备错误和 incoming history 旧路径错误均保留原 exit 1 日志；没有把这些失败记成通过。主线真实 schema 复现另用正确源路径记录。
- 产品验收改为真实同节点生成与版本选择/共享 undo redo；三视图、合成图及 Comfy 仍沿真实派生流程。未以 DOM mock 或新 API 替代原完整产品。

本文件随固定候选封版结果继续更新；尚未取得的完整候选结果不提前写 PASS。原始 4758 文件基线、当前改动、回滚副本与最终 Git 来源将在本轮 DELIVERY 中绑定。整体目标保持进行中。
