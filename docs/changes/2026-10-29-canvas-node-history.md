# 截图排查：空节点、失败节点删除/撤销与浅色连线

## 基线与模块边界

- 本任务固定基线 `3b6a5279b4364590954751e8f5b5c9d566010806`，父工作树 `E:/Workspace/naumi-canvas-reported-issues-20261029`。
- 负责截图 1/4/9/10 中的删除快捷键、空节点批量删除、撤销、重构比例失败节点连线与 `signal timed out` 表现。工具报价、模型配置、批量反推与上传同步由同轮其他切片处理。
- 修改点集中于 `canvas-client.tsx` 的选择、删除、本地历史和生成占位显示；没有改任务提交、供应商、扣款、后端权限或发布配置。

## 确认存在的问题

1. `runDelete`、`batchDelete`、Delete/Backspace 分支均显式排除 `pend-` 和 `task-`。混选两个空图片节点和一个文字节点时，确认框只计后者；真实删除亦只发送文字节点。
2. `CanvasGenerationTask` 的失败占位仍 `selectable:false`，点击/右键对所有 `task-` 提前返回。因此失败节点没有同普通节点一致的删除路径。
3. `addPendAtScreen` 和多图合并空节点创建没有写入 undo。空节点不是服务端作品，原有只处理持久节点的历史协议也无法恢复它。
4. 生成任务连线使用 React Flow `default`，全局 CSS 默认浅白线；浅色画布的深色适配只覆盖 `CometEdge` 的 `.cw-base`。比例工具的连线存在于状态，但白底视觉近乎不可见，不是后端缺失父子关系。
5. 删除请求每次重试生成新 operationId、提交前清空选择；丢响应后无法沿原幂等命令核验。history 原有 WeakMap 已保留 undo/redo 的原操作编号，原始网络超时文案仍直接显示为 `signal timed out`。

## 修复

- 同一删除入口接收持久图文、可删除空节点和失败展示节点；运行中、上传中、needs-attention 占位保留。批量操作确认数来自实际可删除对象，混合选择右键与底部批量删除一致。
- 失败 task 可选择，支持 Delete/Backspace、右键删除和单次 undo；运行 task 仍不开放删除。进度连线复用浅色可见的 comet，失败停止流动但保留线条。
- 空节点创建写 `pending-add`；本地删除写 `local-delete`，混合删除在同一 `mixed-delete` 中保存本地与持久快照。本地操作不发空 delete/history API。
- 删除只移除展示，不删除 `editTaskStateRef`、生成恢复凭据或上传 receipt。独立 `hiddenLocalNodeIdsRef` 防止删除失败预览后切项目返回又恢复；undo 解除隐藏。它不是取消供应商任务的接口。
- 持久删除沿原 API/事务，冻结 operationId 和请求体，失败保留原节点和选择；重试原请求。发送前等待文字保存，并核对账号、空间 revision 和项目；20s 有界超时。显示超时本身不证明数据库未提交。
- history 超时提示改为“保存响应超时，修改仍保留；请重试原操作”，原 undo 栈和冻结 nonce 保持；没有宣称服务器网络超时根因已消除。
- 删除到空项目不再立即退出到项目网格，让当前 undo 仍可达。输入框、弹窗、只读与锁定保护保留。

## 实际验证

证据目录：`E:/Workspace/naumi/output/canvas-reported-issues-20261029/node-history`。

### 原函数回归

`node scripts/verify-canvas-node-history.cjs <source-root> <output-root> [--baseline]` 用 TypeScript AST 取得完整原函数体（不重写算法），执行真实 runDelete / applyHistory / onKey / addPendAtScreen / restoreEditTasks / 生成占位循环；显式替换 state setters 与 HTTP 持久化边界。

- BASELINE：原始 `git show 3b6a5279:src/components/canvas/canvas-client.tsx`，`REPRODUCED PASS=4 FAIL=9`，exit 1。失败是行为断言，不以缺少新导出接口作复现。
- MODIFIED：`PASS PASS=13 FAIL=0`，exit 0。覆盖空+失败+普通图片+文字混选单次删除/undo/redo、仅本地零 API、空创建 undo、真实快捷键分支、计数、深色连接、执行中保护、receipt 保留、隐藏后项目返回、删除与 undo 丢响应同 nonce、输入/弹窗及锁定。
- 原 `verify-canvas-scoped-history.cjs`：12 项通过；因 doUndo/doRedo 新引用 `historyFailureMessage`，夹具仅补加载这个真实函数，不放宽原断言。

### 完整 Next 页面

`scripts/serve-canvas-unified-dock-fixture.cjs`，独立 Next 17870 / proxy 17871，`NEXT_DIST_DIR=.next-node-history-issues`；`node scripts/verify-canvas-node-history-ui.cjs`。

- **8 项真实页面点击通过**：空创建 Ctrl+Z/redo；单空 Backspace/undo；两空+一文字 Shift 混选、确认数 3、全部删除；单次 undo 恢复三者；history 503/超时响应保留画面、重试相同 operationId/body；真实重构比例入口产生失败占位、浅色深色连线；失败节点 Delete/undo；空节点+失败节点+普通图片三者混选删除、单次 undo 全部恢复。
- 页面错误 0、外网请求 0、供应商调用 0。任务/账务/数据库/API 均为局部 fixture，不表示生产收费任务端到端验收。
- 首次 GUI 脚本误用 `role=dialog`（原确认层无该 role），第二次将宽屏按钮写成“16:9”而非真实“宽屏 16:9”；均是测试定位错误，保留错误报告并修正定位，未放宽业务断言。
- 最终截图 `tests/ui-final8-r2/node-history.png` 已打开检查，undo 恢复后的普通图也等待实际解码完成。图中的失败是故意注入的报价错误，用于检验节点/连线/删除，不作为工具报价问题仍未修复的结论。最后的混选先退出文本输入焦点，等待真实单选状态，再连续按住 Shift，避免测试逐次 modifier 瞬间切换早于 React Flow 的键盘状态更新。

## 仍需区分

- 截图中的原始生产超时没有 requestId/具体时间。代码可确认 20s 客户端边界和旧删除 nonce 缺陷；本轮局部故障注入验证恢复，不把它扩大为定位了当时全部服务器故障。
- 3b6 基线的 d62afb7d / 613cf62 是**视频节点保存**队列修复，并非本轮空图片/失败占位操作的解决方案；原保护没有被覆盖。
- 隐藏状态和本地空节点历史属于当前 CanvasClient 会话；刷新/跨浏览器持久化不是本轮新增能力。已受理任务的既有服务端/浏览器恢复凭据独立保留。
- 父线程集中执行最终类型检查、整合与副本回滚；本子任务没有 Git 提交/推送、SSH、发布或真实供应商调用。
