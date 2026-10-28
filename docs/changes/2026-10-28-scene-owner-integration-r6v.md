# R6V：场景与已验证 Data URL 修复接入现有 owner

## 模块与职责

基线 `944d2b0a1c61e31b184b96961e1f2cad87764be2`，独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。本轮普通整合固定 main `ac71259ae104c85ce41c0944f1d9cb4d732771fd`；整合输入与原 4731 个文件 hash 已保存于 `output/refactor-r6v-20261028/BASELINE.json` 和完整源码归档。

场景的定义、状态、普通图片/全景背景和导演快照沿用主线实现；重构工作不是重做场景功能，而是让它遵循现有数据与状态归属。

## 公共接口、依赖方向、数据与事务

- `scene/project`、`scene/director` 与 `canvas/visual-references` 是纯定义和转换。`VideoInputChoice` 仍归纯叶节点 `video/input-choice`，不反向依赖 UI 或 settings 编排。
- `canvas/scene-node-service` 编排授权、原 operation 回执、场景引用与同一图事务。repository 使用 platform pool 和 snapshot-value 叶模块；不经旧 `db.ts` 大入口。
- 主线原有两张场景表接入 `canvas/storage-schema` 的 pool-scoped readiness 和应用 persistence startup；没有另加表、任务、计费或自动重放体系。
- 场景渲染、项目卡片、选择、连线、撤销/重做、混合复制/删除分别接入既有 `scene-projection`、`project-catalog`、`selection`、`link-command`、history 和 node-lifecycle owner。图片/文字 CAS、原操作回执、事务和锁顺序保留。
- 场景状态和角色外观一次共同展开并编号，服务端读取真实定义、图片归属后沿原视频任务冻结；导演背景是显式普通图片/全景选择，后续场景编辑不重写已保存快照。
- 主线 Data URL 的线性校验与解码函数迁入已有 `object-storage/runtime`。`storage.ts` 继续兼容导出，不恢复旧存储单体。

## 实现与迁移状态

前序整合脚本已完成 backend、共享 owner 和前端接线；12 个 Git 冲突文件的正文已去除冲突标记，尚待集中验证后标记解决、固定提交。初次完整 TypeScript 已 exit 0。本轮新增 `verify-scene-owner-integration.cjs`，覆盖真实共享 owner 的场景投影、历史、混合节点、精确引用解除及导演背景，不用字符串存在代替行为验证。

## 验证与证据层级

集中验证、失败记录、最终固定源码、完整 core、Linux 镜像及同镜像 runtime/browser、副本回滚和四产物在收尾后追加。当前不把已写断言或前序 R6U 的结果计作本轮运行通过。

## 未完成项与下一步

本轮集中运行与封存仍进行中。整体重构继续，后续收敛 Canvas 助手和外围组合，并执行最终整合退出审计；独立重构分支本轮不合 main、不部署。

### 首批集中结果

共享 owner：旧 7、新 51 检查；场景原规则 39、角色共享 owner 39、导演共享 owner 34、历史原 67 场景/184 检查、实际场景编辑器控件均通过。结构对照：1880 个其它原产品文件 hash 保持，原 Canvas 163 个函数中 150 个正文保持，13 个接线改动、无删除；Canvas 5687→5752 行。db/storage 两个兼容入口原字节一致，原场景 SQL、主线线性 decoder 函数及 4 个纯规则叶模块保持。初次结构四类 SCC 均为 0。

完整旧对象存储实现上运行新 Data URL 全量检查得到 41 项中 14 个负例失败（原进程 exit 1）；这些正是旧 regex 对 MIME/填充位的宽松行为，不是主线脚本原先预期的另一个中间版 baseline。所有正例含大图在本机旧实现上通过，不能声称在本机复现原线上栈溢出。`baseline-proof.py` 对固定 14 个失败名、41 项和全正例通过作精确断言，exit 0；原失败日志保留。新版 41/41 通过。回滚时仍须重复旧行为并对照相同失败集合。

真实场景完整应用首轮通过：实际 Next、隔离 PG、Worker、私有媒体、账务和 Chromium 全流程，模拟供应商创建 5 次、真实付费 0、pageerror 0；覆盖场景创建/上传/状态/移动/锁定/复制删除/撤销重做、引用、导演背景、混合事务和制作链冻结。首次模块 lint 在两份主线 verifier 的局部 `module` 变量报错；仅改局部绑定名，原错误保留为 `LINT_MODULE.log`，Canvas 原 hooks warning 单列。

### 固定候选首轮失败与控件前置条件修正

`dd38806d` 的完整core在场景刷新后首次raw鼠标拖动时停止：29 PASS / 1 FAIL / 39 NOT_RUN，PG坐标仍536，未观察到拖动保存请求，页面错误为0；失败截图/诊断/cleanup原样保留在 `core-final/scene-application`。早先实际场景完整应用通过并不覆盖这次失败。脚本直接boundingBox读不等待Flow视图定位的actionability，因此加入真实标题hover的稳定/命中检查，记录单次pointer坐标；仍要求同一次实际拖动产生PG坐标变化及原undo/redo，不增加重试或放宽业务断言。该前置条件修正待新固定候选重新集中验收；不能仅据静态推断宣称原失败根因已关闭。原固定源码Linux镜像/runtime125/browser36通过，保持独立证据。
