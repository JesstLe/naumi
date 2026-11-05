# R7I：Canvas 次级生成应用编排

## 基线与问题

完整基线 `08a3f730`。独立 worktree / 分支继续，主线已观察到 `2c2d194e`，本模块先完成既有切片，达到三模块边界再按原规则普通同步，不把追赶主线代替重构。

R7D/H 已拆 activity、generation/pending 展示；但 Canvas 仍亲自组合 edit/detail/Comfy 的 request、retained billing、task、attachment、timer、失败恢复和工作流 Map。修改结果落地或恢复规则仍会传播到三个大组件函数。

## 职责和依赖

- `canvas/edit-run`：组合已有 edit-task、retained billing submission、result attachment、原 scoped pending/activity；拥有本次编辑在原视图的编排，不定义新生成/计费协议。
- `canvas/detail-run`：组合已有 detail-task-request/controller、原任务卡与可选 blank pending、原结果竖排 attachment；选中节点与提示位置继续由 UI 决定。
- `canvas/workflow-runs`：持有原 Comfy controller 的 session registry，以现有 receipt key 分区；UNKNOWN 与已知结果复用原 controller/payload，明确未受理/完成后才退休。业务请求和原回执查询继续由 comfy-workflow 负责。
- `CanvasGenerationRunContext` 是这三条已存在流程的窄组装边界，传入原 owner、展示/文档、几何和请求 adapter。只有 type imports；不是 DI 容器、事件总线、第二套存储或通用任务平台。
- Canvas 的三个原入口保留供真实 UI 调用，但只做交互前置、当前输入和 view adapter；不再直接建立 task/attachment/retained quote，也不持有 Comfy controller Map 或进度 timer。

原同步 busy 语义、账号/workspace/project epoch、未知不自动重提、已知结果只续接、原 body/quote/operation、一次 history、视频202交由原native owner不变。没有改价、确认、权限、业务限额、数据库或供应商协议。

## 集中验证

新增完整基线与新版实际 Canvas 入口对照，复用现有记录型 I/O 夹具；对成功、明确拒绝、unknown、保存失败、partial、视图切换/ABA/卸载及授权切换，比较原创作字节/结果/定位/history轨迹。结构断言确认组合已离开 React，不只在新文件加层转发。Comfy 继续沿原 request/workflow 真实组合回归，观察本地 original receipt 与 supplier POST 计数。

本文件不预填通过数字；最终命令、原始输出、退出码、固定源码、失败尝试和四产物以 `output/refactor-r7i-20261029/VERIFICATION.txt` / DELIVERY.json 为准。实际 React/Next、夹具 PG 与完整 Linux/产品/容量分别陈述。

## 初轮对照与修正

完整基线50场景168检查、新版50场景172检查的实际入口请求/结果/定位/history轨迹精确一致；既有workflow39/88、activity38/137通过。首次全项目tsc记录edit-run经泛型view.activity推断为unknown：补回原组件execute回调已有的Promise<boolean>注解，运行逻辑不变。首次类型日志保留，不混成通过。

## 交付和剩余

保留完整原源码哈希，修改副本并留 archive/patch/verification/可执行 rollback，独立副本恢复旧行为；实际工作树保留新版。整体目标 ACTIVE，未合 main、未部署。分支超过48小时是用户持续独立整体重构要求，完整版本退出未满足，不能将局部验证冒充整版完成。

下一步继续 Canvas 外围组装、同场景 INP/容量、有效 required CI 和完整版本主线整合；历史媒体原生 errno 根因仍 OPEN。
