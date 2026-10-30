# R8F：Canvas 下载意图与浏览器取字节归属

## 基线与调查

基线 `302e5772df30b46c3aa45f9fce88b5f5eb0a20a6`，完整5249原文件哈希、源码tar和原树保存在 `output/refactor-r8f-20261031`。本轮不重复R8E渲染开发。

原Canvas页面同时拥有ZIP状态、过滤/截断、缓存读取、下载回退、DOM链接与URL释放；项目/多选ZIP先`.slice(0,30)`，服务端套图接口也按既有协议只收30项。单图/ZIP的异步结束没有原Canvas scope检查；原项目明确点击的下载应继续并保持原文件名，但迟到提示不能落到新项目，账号/workspace退出后不能继续触发旧下载；同tick双击仅靠React旧zipping闭包也可能重入。这些先由原函数运行反例验证，不从静态推断扩张成历史线上事故。

## 职责、接口与状态归属

- `canvas/downloads.ts`：拥有当前view下载意图、同步ZIP准入、busy和取消。只通过image/archive/save/video窄端口协作；不依赖React/DOM/缓存实现，不保存付费operation、不写文档/账务。
- `canvas/download-browser.ts`：复用原缓存授权和原`/api/download`、`/api/suite/download`；负责实际字节、DOM点击与object URL成对释放。缓存明确拒绝不落到未经授权回退；回退使用原document headers，冻结workspace/project。
- `use-canvas-downloads.ts`：只组装端口并观察owner状态；原项目下载在项目导航后仍按冻结输入完成；账号/workspace变化或卸载取消读取，迟到提示不写新view。只读画布仍可下载，未新增writable门槛。
- `media/download-href.ts`：纯下载URL/名称规则脱离VideoPlayer；原player导出保留真实兼容caller，Canvas无需为视频下载导入播放器实现。
- `browser-image-archive`：复用现有JSZip/服务器协议。保留原本地3路读取/128MiB界限与原授权，增加可选signal/header端口；大项目按既有30项接口分段，合并同一次下载，避免静默漏图，不另建服务/队列。
- `cachedImageBlob`只增加可选signal并传入原读取owner，不改变原默认调用语义。

页面保留项目/选中集合和翻译文案的组装；不再直接拥有ZIP/Blob/fetch/object URL和下载状态。输入图片URL、标题、顺序、当前显示版本均使用点击时原投影，不自行重算版本或替换原图。

## 集中验收（实施记录）

1. 原/新页面行为：同tick重复ZIP、项目导航仍交付原文件且不串提示；账号/workspace ABA/卸载后的迟到成功及失败、只读下载、空集合、失败重试和取消。
2. 真实浏览器下载：原PNG字节、同版本下载、zip命名/顺序/全部31张与前30反例、取消不触发新下载、object URL释放；缓存拒绝零原始回退。
3. 原共享缓存/图片稳定、原生scope、播放器与命名回归；完整类型/lint/架构。
4. 固定同镜像完整产品下载入口；四产物/字节patch回放/独立副本原行为回滚/普通push。

整体ACTIVE；本轮未合main、未部署，47 HOLD。R8E远端CI已重新读取为failure/steps0，不把旧queued或本地PASS写成绿CI。

原函数/新owner首轮集中验证已执行：原14→新15检查；31项进入archive原30→新31，同tick原2次→新1次，跨账号迟到下载原1→新0。项目导航后原文件继续交付，迟到提示隔离；取消/替换busy/只读默认不加新门槛。真实Edge下载及JSZip原/新各7检查通过，逐PNG SHA一致，31文件原30→新31，服务端分段30+1、实际文档headers冻结、缓存明确拒绝零回退、URL全部释放。

一次浏览器夹具断言在原下载事件尚未送达时提前检查计数失败；已等待实际download事件后重验，原日志保留，非产品修复。完整镜像验收将沿已有双browser54流程增加原生图片/原始版本/ZIP与真实31行PG项目，不mock页面API，不新增付费调用；31行仅隔离fixture seed。
