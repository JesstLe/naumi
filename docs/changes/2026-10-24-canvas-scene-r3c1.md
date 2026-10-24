# R3C1：场景投影、节点渲染器与受控交互状态

日期：2026-10-24。目录 `E:/Workspace/naumi-refactor-20261024`；分支 `codex/core-refactor-20261024`。
基线 `f5d5373bafbf57cd598cdf38fb7e1042d52e1934`。本模块本地实现与集中验证完成，整体重构保持进行中。

## 职责与调用方向

```text
既有 artwork/text/video/task owners
        ↓ DTO + 已提交视图下的命令
scene-projection → useCanvasScene → React Flow
                         ↓                ↓
                 scene-reconciliation    nodes/registry
                                          ↓
                           artwork / text / pending / comet
                                          ↓ command(id)
                            现有文档 / 任务 / 交互执行函数
```

- `lib/canvas/scene-types.ts`：作品/文字/占位/生成任务的展示合同与按 ID 操作接口。不依赖父组件、不创建平行业务模型。
- `node-geometry.ts`：原图片、文字尺寸与估算函数的唯一实现，任务落地、布局、节点渲染继续共用。
- `scene-projection.ts`：已有作品图、混合节点、血缘、引用连线、任务占位、视频结果、导入分组、锁定/只读状态的投影。`projectCanvasScene` 不读 React ref、不执行网络或写入；可见任务由视图适配先过滤。`layoutGraph` 的显式 position cache 沿用原键与缺失坐标分配规则。
- `components/canvas/nodes/`：独立图片、文字、占位、连线 renderer 与稳定 registry。已有视频和工作流 renderer 继续复用。
- `use-canvas-scene-actions.ts`：稳定命令代理指向最近一次**已提交 render**的实现；layout effect 更新回调，避免把未提交渲染的闭包暴露给当前画布。不是事件总线。
- `use-canvas-scene.ts` / `scene-reconciliation.ts`：受控 React Flow 状态与业务投影同步；图文档仍由原 owner 管理。项目/账号/workspace scope 变化后不继承旧选择、拖动或测量。
- 视频播放器动作类型提升至 `lib/video/player-actions.ts`，播放器原导出保持兼容；没有修改播放器执行行为。

## 真正删除了什么

Canvas 内四个节点/边 renderer、局部数据类型、geometry、layout/lineage/display 投影与手工 `nodesSig/edgesSig` 字符串删除。主组件 **11576 → 10300 行**。

不是只把 1200 行移动到另一个大组件：纯投影不拥有业务 store/闭包，renderer 不调用数据库或生成服务，Flow 同步不靠一串手填字段判断更新。回调更新、任务进度和拖动现在分别属于明确接口。

## 行为变化与保持

1. 完整数据比较覆盖旧 signature 漏掉的原图尺寸、引用标题、只读状态、样式尺寸、小数坐标、视频结果地址、重试函数，避免“数据更新但节点还显示旧值”。
2. 400 节点只修改一个 label 时，旧同步替换 400 个对象；新同步只替换 1 个，其他节点/数组在等价投影时复用。这是对象 identity 验证，不是线上帧率或容量承诺。
3. Flow 的当前选择、拖动坐标和已有测量保留；缩放进行中保留 live box。scope 切换清除旧 view 的交互状态，避免同 ID 带入别的文档。
4. 不可见的详情任务不再把当前图片的“去背景”按钮误标为 busy。可见任务仍沿原 generationOperation 锁执行。
5. 工作流分组成员、补图 ID 从隐式闭包改为显式命令参数，分组选择和补图仍调用现有业务函数。
6. 已保存位置不因刷新重排；普通生图/详情/编辑的结果落地与原价/回执保持。183 个保留函数的去注释 AST 正文对照未变，含生成、报价、任务与编辑入口。
7. 界面继续浅色；32 种实际 renderer 的 SSR HTML 与基线逐字节一致（Flow measurement/media ports 为相同 fixture），真实页面另做浏览器验证。

## 集中验收

证据目录 `output/refactor-r3c1-20261024/`，完整命令、literal、exit、四产物与副本回滚见 `VERIFICATION.txt`。

- 完整源码基线 **27 场景/74 检查**，新版 **30 场景/98 检查**，exit 0。
- 18 组混合场景：17 组投影数据保持，1 组明确修正不可见任务 busy；workflow group 的成员显式传参已独立验证。
- renderer：**32 组 baseline/new React SSR HTML 完全一致**。没有把 SSR 当浏览器交付。
- 真实 Next/Edge 场景 **6 项**：原图重命名与文字引用同步、撤销、等比缩放、任务刷新期间拖动不跳、原结果定位、占位上传入口。
- 真实 Next 文字/历史 **12 项**；原详情/编辑 **5 项**；普通图片 **5 项**通过。
- 相邻 owner：任务 **74/369**、图片 **46/176**、历史 **67/184**、文字 **21/58**、作品 **26/49**。
- 文字 blur/undo、节点属性 UI、混合 smart layout、render-layer 顺序回归通过。smart layout 的 400 样本是现有纯算法 fixture，不代表产品容量已达标。
- 全项目 TypeScript exit 0；lint exit 0。原 Canvas hooks warnings 从 10 降至 8，删除了渲染闭包及不再需要的依赖问题，未禁用规则。
- 本模块未改服务端 SQL、供应商或账务实现；无额外 PG、外部供应商或生产调用。已有服务端证据保持其原范围，不冒充本轮重跑。

## 原始记录和后续

- 第一轮 TypeScript 发现展示合同缺 `nodeKind/width/height`，补完整字段而非放宽为 any。
- 第一次 renderer 对照发现无可执行回调的直接 PendNode 会多显示空“重试”按钮，已按实际 callback 存在与否修正；实际投影仍提供当前 pending command。
- 浏览器第一次 fixture 没有 sourceIds，引用标题断言失败；只给隔离 fixture 补真实引用后通过，未改产品迎合断言。
- 协作浏览器两次 snapshot 返回 `Preview automation snapshot timed out after 15000ms.`，按仓库独立 Edge 流程验证；仅关闭本轮自有 tab。
- 两个历史源码定位脚本在完整基线已失败：manual-layout 仍要求 runGen 内直接检查 position（该职责已在 R3A/B4迁走）；media-controls 仍在薄 VideoNodeSurface 查已迁至 VideoPlayer 的原生控件。这些原始 exit 1 留存，不算本轮通过。后续 R6 脚本整理继续归并。
- R2 IMAGEGEN_NO_CHANNEL、R3B2 text-image 缺 pinned snapshot、R3B4旧billing-client stub缺导出仍在台账。没有声明全 suite/build/生产/容量通过。
- 下一阶段 **R3C2 选择、连线与拖动命令**；随后 R4 数据与事务/配置控制面、R5 Worker/codec、R6 外围与完整候选验收。

本模块为上次三模块同步归零后的第 **1** 次功能迭代。独立候选持续推进，不合入 main、不接管发布。
