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

## 固定候选最终记录

固定应用源码 `c5eba60c2757310161d1c189db3f2979a8264a1e`，完整生产Dockerfile同Web/Worker镜像 `sha256:ff9698636e425e65b36a36530b1eec675cf65106127bf28e2bd83fe65780bdf3`。原页面的下载状态、ZIP准入、异步反馈和DOM取字节拆为canvas/downloads应用owner、download-browser浏览器适配和use-canvas-downloads订阅；媒体URL/名称归纯media/download-href，不再反向依赖播放器。页面只组装原项目/选中集合、翻译和事件，4564→4501行不是验收目标，真实写入/状态责任迁移才是。4个原产品文件改变、4个新职责文件，其他2110原src/services哈希不变；钱包/报价/任务/UNKNOWN/原媒体授权未改。

原实际页面函数14项→新owner15项，真实Edge原/新各7项：31张原30→新31，同tickZIP原2→新1，账号切换迟到下载原1→新0；原项目明确发起的下载导航后继续，文件名/输入原图冻结，迟到提示不污染新页面。账号/workspace ABA或卸载取消原读，取消的旧finally不清空替代busy。只读下载保留，没有新增积分/确认/业务限额。原缓存明确拒绝零下载回退，实际浏览器逐PNG字节哈希、命名、顺序和objectURL释放通过。

原30项server协议保留，完整31张项目分段30+1合一ZIP；共享本地3路读/128MiB边界不改，不以静默漏图规避资源。类型0、lint0/既有38warning、四类SCC0；13个受影响入口同SHA/digest全部新执行通过，subset PARTIAL/exit2，不当完整175绿。R8E五轮性能只归原2c6a源码，本轮未重复性能压测或把旧测量当当前候选结果。

完整固定镜像真实双browser 60 项通过，原54流程保留；新增实际选中图片、初始版本与原项目ZIP下载，PNG/ZIP经原缓存和媒体HTTP/PG；实际31行隔离项目用原服务器suite/download打包成31个逐字节相同PNG。新增下载供应商0、consume0；原创作链保持7笔/42积分fixture账本。初始版本选择/undo仅增加合法revision2，不要求CAS版本回退。原生下载事件无mock、无浏览器路由替换，缓存授权使用实际产品路径（本地public fixture，不冒充私有R2/真实上游验收），POSIX排空及自有容器/网络清理通过。

基线5249原文件与完整5257源码、字节patch、副本原14+7行为回滚及later-edit零写入按本轮DELIVERY/VERIFICATION为准。规则/浏览器原始夹具失败保留：计数必须等待真实download事件，不把事件尚未送达误作产品行为。首轮完整浏览器58项含原图/版本/ZIP均通过；31行从PG观察器直接seed没有触发浏览器元数据失效，旧缓存暂不展示新项目。夹具改走真实browser /api/projects发布项目名触发现有失效，而非注入store/flush缓存或修改产品。未把正常项目导航变成取消护栏；没有新下载服务、表、队列或付费operation。

整体ACTIVE，候选仍未合main、未部署，47 HOLD；主线同步后第1/3模块。**分支超过48h原因仍为最终整版退出未达成：剩余Canvas Shell/组合、持续混合生成/入队容量、有效CI、最终普通main整合与生产验收。**本片的真实字节与集中回归不替代整版要求。
