# 2026-10-30 画布持久分组浮层

## 用户目标与确认缺口

- 用户要求多选成组后，图片成为可见的整体，像轻轻浮起的一层；成员仍是各自可编辑、可连线的图片，而不是合成一张图。
- 基线 `3065cf964e53ccac9865ab8b26d7da6359dcec94` 已有 `Artwork.canvasGroupId`、`POST /api/canvas/groups`、原事务与历史 undo/redo。此前只有选中成员标题的小成组图标，没有持久的组边界/底板。
- 原成员拖动还要求 `multiSel` 已完全等于组成员；取消选择后的第一次拖动可以绕过整体拖动分支。

## 模块职责与本次实现

- `src/lib/canvas/group-layer.ts`：从既有 RF 节点的 `canvasGroupId` 派生组边界，使用真实测量尺寸，提供一次起点快照的整体位移和网格吸附计算。不修改业务节点、项目分组或工作流清单，不另建保存表。
- `src/components/canvas/group-layer.tsx` + CSS：ReactFlow 原生 `ViewportPortal` 坐标投影；浅色底板、边框、阴影、简洁组合数量。取消选择仍保留边界。点底板/组标识选择全组，拖底板实时移动成员，结束一次调用原 `saveManyNodePositions`，复用原历史和事务。
- 投影层 `z-index=-100001`，低于已有节点排序的最小值 `-100000`；不挡图片操作、独立文字节点和连线。布局/缩放/组成员尺寸变化都重新计算边界。
- 拖动使用 pointer capture 和屏幕到画布坐标换算；Escape/取消恢复原位置，不落历史；只读、锁定成员、手形工具、原历史保存中不能由底板提交位移。项目/账号/工作空间切换通过组件 key 清除旧手势；layout cleanup 先于 DOM 移除清理 pointer capture 状态，工作空间事件和 revision 核对阻止旧坐标写入新项目。
- 成员首拖去除“必须先完整多选”的额外前置条件，沿用原 grouped drag 保存分支。组成员的锁定语义仍由原节点处理代码负责；底板不允许部分移动一个含锁定成员的组。
- 本次成组对象沿用既有 API 的图片节点；没有宣称新增文字/视频/任意类型混合持久成组能力。文字节点依然独立交互，不因浮层变成不可点。

## 父集成位置

本子模块不直接写并行独占的 `canvas-client.tsx`。精确补丁：

`E:/Workspace/naumi/output/canvas-feedback-20261030/group-client.patch`

三处：

1. 导入 `CanvasGroupLayer`。
2. 成员 `onNodeDragStart` 去掉 `multiSel.length === groupMembers.length` 门槛，先调用原 `applyArtworkSelection`。
3. ReactFlow 子元素接入，`nodes={rfNodes}`；预览只改 RF position；commit 调原 `saveManyNodePositions`；不新增业务节点、组 API 或历史类型。

## 集中验证

工作目录：`E:/Workspace/naumi-canvas-feedback-20261030`。

### 基线源码证据

```powershell
node scripts/verify-canvas-group-layer.cjs --baseline --source-root E:/Workspace/naumi/output/canvas-feedback-20261030/group/baseline-source --output-root E:/Workspace/naumi/output/canvas-feedback-20261030/group/baseline
```

基线 `canvas-client.tsx` 由 `git show 3065cf96:src/components/canvas/canvas-client.tsx` 原字节提取，SHA-256 `0bbb7fb98eb39e479e8ca39565f5c22fb39fc53127693ccbb938b00409f0b626`。

字面输出：

```text
CANVAS_GROUP_BASELINE=REPRODUCED PERSISTED_ID=YES FRAME=ABSENT FIRST_DRAG_REQUIRES_PRESELECTION=YES SUPPLIER_CALLS=0 EXIT=1
```

退出码 `1` 为预期基线缺口；这是对真实基线源码的断言，不称基线完整浏览器行为回归。

### 实际组件/样式/ReactFlow

```powershell
node scripts/verify-canvas-group-layer.cjs --source-root . --output-root E:/Workspace/naumi/output/canvas-feedback-20261030/group/modified-scope-final
```

```text
CANVAS_GROUP_LAYER=PASS CHECKS=20 REAL_REACTFLOW=YES SUPPLIER_CALLS=0 PAGEERRORS=0 EXIT=0
```

覆盖两个组、单成员/无效几何、成员间距、吸附、组选择和取消选择、未选择底板直接拖动、一次 commit、缩放位移、Escape、锁定、只读、原图片编辑/文字输入、连线、解组/历史回调、成员缩放、同节点 ID 跨项目/工作空间迟到 pointerup、commit.from 起点快照，以及无额外业务节点。

- 测试加载生产完整 `CanvasGroupLayer`、CSS、helper 和真实 ReactFlow；保存/解组/undo 是明确的本地 callback fixture，不冒充真实 PG API 回归。
- `node node_modules/eslint/bin/eslint.js src/components/canvas/group-layer.tsx src/lib/canvas/group-layer.ts`：无输出，exit `0`。
- 首轮测试在第三次拖动时选择的右上坐标恰好与独立文字节点重叠，因此拖动了文字节点而未触发组拖动；只修改了测试定位，保留 `group/modified/ERROR.json` 与失败截图。该行为说明组底板没有覆盖正常节点交互，产品未为测试放宽条件。
- 最终图片已真实渲染、落盘并打开：`group/modified-scope-final/canvas-group-selected.png`、`canvas-group-persistent.png`。

## 证据边界与后续

本子模块无生产操作、收费供应商请求、SQL 修改、提交或推送。父任务负责 client 补丁整合、最终类型与完整画布集中验证、副本回滚、合入 main；不能把这里的真实组件测试扩大为线上已发布。
