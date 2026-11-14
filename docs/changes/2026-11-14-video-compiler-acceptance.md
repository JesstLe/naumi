# 视频编译架构验收账本

本账本对照 [RFC §14](../architecture/2026-11-14-video-compiler-rfc.md) 的原始 A01–A19；不改变完成范围。代码在 main、函数测试、本地真实 Web/Worker、真实供应商、生产发布是不同证据层级。历史日志只证明其固定版本，不自动升级为当前源码或线上通过。

## 当前完整应用切片

`scripts/verify-video-compiler-process.ts --projected-worker-env` 启动本工作树的真实 Next dev、独立应用 Worker 生产 bundle、独立媒体 Worker，使用随机隔离 PG schema 和本地供应商 HTTP。不是 Route 函数直调，不模拟应用 Worker，也不是生产构建/公网蓝绿。

14 个检查覆盖：真实中间件/用户 Cookie/API，预览五类表零副作用、旧错误元数据不否决、预览和任务 planDigest 一致、同操作并发重试、跨用户读取拒绝、受理后型号/凭据/售价变更不漂移、生产白名单投影、真实签名媒体读取与篡改拒绝、Worker drain/两次重启、原回执查询落片、父子资产、取消前零发送、显式 retryOf 单次新执行、LIVE lease 不抢占、原 sending/UNKNOWN 不重放，以及三个已完成任务三笔账本（7+17+17=41）。

证据目录 `E:/Workspace/naumi/output/video-compiler-process-20261114`，最终包日志及退出状态以 `VERIFICATION.txt` 为准。`--browser` 增量是实际 `/video` 页面，不替换组件/HTTP；4项真实Edge/React检查已独立通过，pageerror0、额外生成0，不由上述 API 检查代替。

## A01–A19 逐项状态

| ID | 当前证据 | 仍需完成或证据边界 |
|---|---|---|
| A01 | 核心/发布执行/1,741 App 的 poison modes/limits/verified 正控与显式政策反控；本轮真实 HTTP+Worker 普通图片成功 | 每个生产通道显式发布绑定和真实上游不由本地正控代替 |
| A02 | 绑定迁移79项、实际管理19项，原能力/价格/映射/旧版本不变，send=omit 与独立政策保持 | 线上资料同步和人工维护数据继续由目标站实际版本验收 |
| A03 | 任意新 wire 型号的显式 JSON recipe、本轮 future-process-video 实际发送；缺 Binding/字段准确诊断 | 未知协议不得猜映射；实际环境专用路线仍需列出/迁移 |
| A04 | describe/compile 共用 Profile；实际 Next 预览摘要与受理 planDigest 相等，冻结后配置变更不漂移 | 全部入口和所有 Profile 的等价证据仍分层记录，不从一个输入泛化 |
| A05 | 实际 Next 预览前后 tasks/creations/billing operations/reservations/ledger 数量相等、供应商0；现有 React 测试覆盖陈旧响应/账号和修订 | 陈旧响应的受控 React 测试不冒充所有真实 Web 交互 |
| A06 | 可信输入/顺序/角色核心测试及 Canvas/上传/Agent App 输入路径 | 连线、上传、提及三种同素材方式的完整真实浏览器等价验收仍待补齐 |
| A07 | 原 text+image 自动意图、两普通图保留reference、明确偏好报缺素材；实际 Next 的 text+普通图进入 single_image | 全部历史画布和真实浏览器拖线仍待补齐 |
| A08 | 原 UI/图谱18项、实际 React/Edge10项、Dock连续性受控检查；本轮真实Next工作台历史参数展示/复用/390px/当前报价4项通过 | 完整 Canvas 生成前后、刷新、多选/锁定和模型切换不由 API 返回值代替 |
| A09 | PG/HTTP 跨用户拒绝、媒体身份/hash/真实解码、结构/角色/数量约束；本轮实际签名输入字节及篡改404 | 完整权限/物理边界以各输入维度检查，不能把“已授权URL”当真实解码 |
| A10 | Canvas/Workbench/Workflow批次/Agent/Storyboard/BYOC/重试在已合主线 App fixture 中共享编译底座 | 本轮真实 Next 仅直接覆盖 Workbench、Canvas提交和重试；全入口真实页面矩阵仍待验 |
| A11 | 注册57个 wire Profile 的分族本地序列化、上传/JSON/multipart/DAG；direct/native openai-legacy 等已有明确 recipe | 注册覆盖≠所有在用配置已迁移；env-only 不自动转托管/猜字段，需明确迁移 |
| A12 | 真实PG Workflow22项：future slots、真实前序时长、静态hash、冻结报价确认、批次/不重放 | 全工作流/Storyboard在独立应用Worker和真实Next的组合验收仍需补齐 |
| A13 | 本轮实际 requested4K→effective2K→wire2k 恰好一次，历史恢复4K；冻结原价7、后续新任务17，账本三笔41 | 更多映射组合由各Profile固定输入测试；不把wire值回填用户选择 |
| A14 | 本轮独立应用Worker、持久tick原身份、原任务重启/UNKNOWN/LIVE lease/取消/显式重试，生产环境投影实际运行；Worker runtime34项 | 当前进程测试为Windows、停机前已drain；Linux进程内活动发送中断/真正多槽回滚仍需新固定版本验收 |
| A15 | 服务端专项实际持久化加密v2 stage及新发布后恢复；原文本/模型/价格/回执不变，伪造阶段拒绝；本轮v3显式retryOf | 历史v2与新v3混合独立Worker/新旧Web发布组合仍待实际验收 |
| A16 | 原媒体token/版本/过期测试；本轮Worker物化真实签名URL，供应商fixture经真实Next媒体路由读取原字节，篡改404 | 时间推进的过期测试与实际公网CDN/存储恢复分别验收，不把本地域名别名当公网可达 |
| A17 | 本轮真实Next受理→独立Worker落片→结果作为下一Canvas节点source_video→再次落片，父子资产/单账本通过 | 浏览器选择历史结果、拖线下一节点的完整交互仍待验，不由服务端创建输入替代 |
| A18 | 编译、供应商fixture受理、成片真实解码保存、账务分别核对，结果含真实输入字节hash | 真实付费供应商质量/成功率和用户采用仍未验，不能标Production-confirmed |
| A19 | 已有源码副本回退/扩展字段兼容、真实发布控制回执与版本准备门禁；本轮独立Worker重启 | 固定生产构建、新旧Web/Worker双槽、排空/切回/旧资产、目标站蓝绿和实际发布仍未验 |

## 发布与总目标

总目标继续 ACTIVE。47 HOLD 保持；生产配置迁移0、付费0、部署0。下一步按上述缺口推进，不以 main 合并、14个检查、任意一份绿色报告取代完整 RFC 退出。后续通过项追加实际固定版本、命令、输入范围与回执；失败不擦除、不降格为无关项。
