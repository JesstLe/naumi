# main 紧凑图片 Dock：保持既有 owner 的主线整合

## 模块、输入与职责

- 输入为本地文本 owner 阶段 `4d1eb60ade162613674ef1974df1ebbcf983290f` 和 main `ca00b1f125fff1077277c3a3b0cbf5b7df4b34f3`；远端 PR #8 此时仍为 `936fe80e4057ae76752d656e3880e3b7f25b3428`。采用普通 merge，不恢复 main 的巨型 Canvas 单体。
- `src/lib/canvas/dock-layout.ts` 只拥有无 I/O 的几何：图片 opt-in `compactImage`，普通宽度 620、高度上限 360；展开目标 420、上限 480。`dockNaturalHeight` 表示内容自然高度，不能把裁切或展开后的 border box 当作下一帧内容高度。
- `use-canvas-overlay-layout.ts` 拥有 DOM 观测、选中上下文/ResizeObserver 的陈旧回调 fence，以及 render/live-transform 两条投影；两条入口都传递 compact flag 并应用实际 width。图片锚定不再预留旧 stacked 220px 占位。
- `image-composer.tsx` 与 `image-generation-controls.tsx` 拥有紧凑顶栏、版本/优化器、更多参数；引用、prompt、shell 保持各自现有组件。CanvasClient 仅组装，不重新接管任务、计费或 document/history 状态。
- text/video 没有 compact opt-in，沿用原几何；原 paid operation、冻结输入/报价、已知结果仅保存重试、UNKNOWN 身份、保存 ACK、撤销及 workspace/account fence 保持原 owner。

## 正式回归与可回滚行为

- 将 main 的 `verify-canvas-compact-dock-layout.ts` 纳入原正式目录，期望 marker 为 `COMPACT_IMAGE_DOCK_LAYOUT=PASS`，`pg:false`；本轮目录 244 项不是 244 项已全部执行。
- 新 `verify-main-compact-dock-behavior.cjs --source-root COPY --out EVIDENCE` 加载真实 `dock-layout.ts` 和 `dock-placement.ts`，调用基线已经存在的 `canvasDockLayout`。它不以新 export 缺失制造基线失败。
- 同一输入在完整 4d 基线得到 width 820 / expanded height 734，在候选得到 620 / 420；text/video 的原几何逐值不变。基线与回滚以 exit 1 表示新 compact 合同未实现，修改版 exit 0。该 oracle 是真实纯几何，不是浏览器、PG、供应商或生产验收。
- 所有精确命令、源 raw hash、完整输入、实际输出、失败及副本恢复结果归 `output/pr8-main-compact-dock-sync-20261103`。前一文本阶段 `output/pr8-main-text-sync-20261103` 保持封存，不将其报告重标为本阶段最终源。

## 集中验证状态

当前 freeze 的非增量 tsc exit 0：5605 个实际输入、前后 raw hash 无漂移；本阶段 16 个代码路径 lint exit 0、0 error / 6 个原有 warning。runner 31 场景 / 428 检查 exit 0；四类 SCC 均 0；Worker 2440 输入构建 exit 0（不是固定完整 Web 镜像）。这些证据绑定各自 input hash；后续产品变动需要对应重测或明确 source bridge。

完整 Next 首轮 compact 因开发产物 layout.js 半写的加载失败原样保留；独立完整 4d 基线 6 场景 exit 1 复现 820px Dock，候选 compact 24、原 pixel 18、text 17 已通过且 pageErrors 0、供应商调用 0。额外 240×900 真实 DOM 边界检查发现 Dock/toolbar 左侧溢出 2px，原失败与样本保留。独立完整 4d 基线与候选同根：focus 使 overflow-hidden 的 canvas-stage 原生 scrollLeft=10，局部 left=8 被整体偏成全局 -2；不是 footer 或 pure geometry 算错。stage 仅将 `overflow-hidden` 改成 `overflow-clip`，阻止该层原生横滚，不补坐标、不移动 node/viewport、不放宽断言。修后真实 240 两种引用组合共 4 检查通过：原 bounds、原生 Tab 到 Generate、点击 actionability trial（不 dispatch 付费）与 stage.scrollLeft=0。完整 Next compact24、pixel18、text17重新全部通过；原 zoom-ownership14 通过，覆盖 trusted wheel pan/Ctrl-Meta zoom、内部 editor/Agent 原生滚动与 guard 重绑，供应商 0、pageErrors 0。

240 窄修后已再次执行非增量 tsc：5605 输入、exit 0、前后稳定；完整本阶段16路径 lint 仍 exit 0 / 0 error / 6原 warning。最终四类SCC再次为0。独立实际 owner oracle 96几何 / 384原值 / 7实际hook合同通过；14 paid fence文件raw SHA、10callbacks、2composer paid props、3recovery/submit子树保持。最终独立报告无剩余可复现P1/P2，UI1955输入同当前源，17职责文件全SHA匹配；该窄审不是全R04签字。

正式 selected scope 与最终封装的实际终态，以本阶段 `VERIFICATION.txt` / `DELIVERY.json` 与原始报告为准。任何首次执行失败保留原日志，不用后续 PASS 改写首次结果；Next/HTTP fixture 不当作真实供应商或产品发布证明。

## 未完成项与下一步

- 本轮目标是完整保留 main 新能力并修复 PR #8 的 main 冲突；新 head 推送后的真实 CI 与审阅仍独立核对。
- 整体重构 ACTIVE。当前完整 244、最终固定 Web+Worker/runtime、R04 整体语义复核、M01/M02/M05—M08 同 case 页面证据与配对性能等没有被本轮窄回归替代；mainMerged=false，deployed=false，47 HOLD。
- **PR 分支已超过 48 小时尚未合 main**：持续整合主线增量，同时仍有整版退出门槛；本轮无强推、生产连接或部署，不删除共享旧工作树或历史证据。
