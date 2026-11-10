# 画布清晰度最小修复

## 模块与职责
CanvasImage 负责展示质量/可见加载；CachedImage 负责授权及已解码帧；CanvasRenderLayerGuard 只决定边线合成的层级适用性。

## 公共接口、依赖方向、状态归属
接口不变。CanvasClient -> CanvasImage -> CachedImage -> 授权/缓存/字节队列。节点/连线/任务/账务数据归属不变。

## 本次实现与迁移状态
从 main 41a59ff0260ef5550b6ee8ada7ba01c05b201df8 建立独立 codex/canvas-raster-clarity-20261110 工作树。收窄本线程此前 daca5273 的宽泛回退：恢复 512/1600/原图分级、DPR、已解码高清不降级、100%与选中强制原图、共享观察器、边线合成与层级守卫、卡片 contain:paint。图片/文字节点整层显式 will-change:auto，避免继续放大低比例缓存栅格。相对 r9 的业务净变更仅在 globals.css 的节点层合成声明及解释注释。

历史归因：最早规则 4a47cd2d；7号 d0a0303a 曾取消，df9fe311 又恢复。旧、新历史组件可在相同路径复现，不把11月7日写成首次用户感知日期。

## 验证命令、结果及证据层级
集中验证已完成：实际 React19/ReactFlow/CanvasImage/CachedImage/TextCanvasNode，合成媒体与本地授权fixture，缩放重绘像素对照、42项DPR规格、234节点与150边交互，媒体队列、草稿、悬停/层级、缓存稳定性、类型检查、副本回滚。精确结果如下。

## 未完成项与下一步
普通合入推送main后记录最终Git回执；47暂缓发布保持，本轮不部署103或其他站。此前2026-11-09全原图记录是被本记录取代的历史方案。

## 集中验证回执

- 基线 main 41a59ff0：全原图/原生绘制，42策略与10行为检查通过；这是上一轮宽泛回退，不作为线上问题基线。
- 线上等价源 9d1f578a（r9产品源码）：使用真实生产CSS/CanvasImage/CometEdge/guard，重现先5.98%后23.48%整层位图放大；重绘前后图源不变，局部MAE=12.540730994152046。
- 本次：DPR1/2/3的42规格与10行为检查全部通过，图源不变时与新栅格参考局部MAE均为0；未预取不可见原图、升级后不降级、选中/回访无额外取图、替换重新授权、节点几何保持。
- 234节点（166图片/68真实文字组件）+150真实CometEdge，90帧视口连续移动缩放，节点坐标保持；节点auto、边线transform。DPR1/2/3本地p95帧间隔分别为 17.8/29/28.6 ms。该数字是本机合成素材fixture交互烟测，不是用户GPU性能或线上容量验收。
- 缓存稳定性14组：缩放白帧0、回访额外取图0、权限撤销与换账号清除通过。媒体队列、草稿62项、层级与悬停通过。类型检查exit0；lint exit0、0 errors、保留原6条hook依赖warnings。
- 首轮fixture采用默认边导致guard取消合成，已换成真实CometEdge以准确复现；未修改产品规则掩盖失败。
- 复现入口：`node scripts/verify-canvas-raster-clarity.mjs --mode MODIFIED`。旧`verify-canvas-original-display.mjs`保留兼容转发，不再断言过时全原图契约。
- 回滚只恢复本任务13个路径；副本验证与哈希见 `output/canvas-raster-clarity-20261110/delivery/VERIFICATION.txt`。最终Git主线回执见同目录integration.json。
