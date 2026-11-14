# APIB / Geek 通道字段编译迁移

基线：`9fcacc3878ce178b1f73dfcab5bc3183091ada53`。独立分支：`codex/video-compiler-apib-geek-20261114`。完整 RFC 目标继续进行；本记录不代表生产绑定迁移或发布。

## 模块与职责

- `profiles/channel-contract.ts`：剩余 13 个注册协议的通道字段配方、查询协议配对、结构化 UI 投影及可表达操作核对。配方描述实际字段布局，不维护型号白名单。
- `profiles/channel-layouts.ts`：纯请求编译。APIB flat、多模态、Kling 特征视频、Geek output_config、Wan metadata、H3 content 分别保留真实格式；不调用旧 codec、normalizeVideoInput 或资料能力解析。
- `profiles/channel-media.ts`：只在最终编译时读取可信素材事实，保留真实格式、时长、尺寸、像素、视觉依赖与首尾帧比例约束。未来 Workflow 输入不捏造这些事实。
- 原 native Profile 分派到上述模块。原 JSON 物化器消费冻结请求中的 `mediaUrlProtocol=https`，在真实地址产生时检查 H3 HTTPS 要求，不以假地址提前通过校验。

## 公共接口、依赖与状态归属

所有现有视频入口继续调用相同的 preview / submit 编译底座；Profile 为纯域模块，依赖方向为 native Profile → channel 字段/结构/媒体模块 → 小型纯契约。新编译器不导入 React、Route、DB、网络、旧供应商 create codec 或旧型号资料表。

发布 Binding 负责字段配方及 requested → effective 映射，编译器负责真实请求字段。查询/结果仍使用任务冻结的原协议解码器；旧 create codec 及旧任务行为不改。任务、媒体、账务及 creation 事务仍归原模块，本切片无新增表、无拆分事务。

## 本次实现与迁移状态

1. 接入 APIB 已核验 4、Geek 已核验 2、documented / v2 / v3 / Storyboard 7，共 13 个注册协议。显式配方选择分辨率大小写、mode 映射、图片数组/角色/命名字段、画幅字段、声音字段和结构化镜头；不再从模型名字推断这些选择。
2. 原已核验协议中的型号白名单、expectedMode 和 text-only smoke 组合不进入新编译器。新型号只要有有效 Binding 和实际字段映射即可编译；并未把所有未知能力改为 supported。
3. 请求值、有效值、wire 值分开。显式音频 send=omit 不会被旧默认值重新注入。无字段的操作在发布配方或编译预览中准确报告映射缺口，不静默丢素材。
4. 保留真实通道边界：Seedance 视频时长与像素、Wan 来源加输出总时长、Kling 特征视频与音频冲突、H3 视觉依赖/素材数量/尺寸/帧比例/HTTPS。旧资料缺值、verified、smoke 证据不参与这些判断。
5. Storyboard 使用公共结构化映射，逐镜头保留文本/顺序/时长，引用对应关系只追加、不替换原文。UI 从相同镜头约束投影，不暴露内部 wire 字段作为普通用户参数。
6. 新计划沿用普通 native 版本 4、结构化版本 5；新增地址协议约束为可选冻结字段，旧 1–5 计划无该字段时原摘要保持。未借物化刷新读取最新模型配置或重新编译。

## 集中验证与证据层级

- `verify-video-channel-layouts.ts`：77 份历史配方、198 组实际旧 codec 请求对照，604 项纯域检查；覆盖相同配方换成旧名单以外的新型号、准备/正式参数一致、显式 omit、媒体边界和 HTTPS 负控。
- `video-compiled-channel-checks.ts`：按真实字段变体去重，实际隔离 PG / 本地供应商 HTTP / 拥有的 PNG、三秒 MP4/WAV / 媒体 Worker 解码 / 原查询 / 结果资产 / 历史 / 单次账务。新增显式图片 Binding 可以越过旧 text-only smoke 判断，但继续执行真实输入校验。
- 集中回归包括此前全部 native/job/nested/reference/BYOC/Agent/Workflow、核心、发布预览、Canvas、媒体、旧冻结来源、账务和实际 React/Edge 控件；完整结果、类型检查、交付包副本、原始哈希及回滚命令见：

`E:/Workspace/naumi/output/video-compiler-channels-20261114/VERIFICATION.txt`

集中结果：604 项纯域；新增通道 App 654 项（42 种字段变体、134 组正控输入），全部组合 App 1718 项；解包副本重新执行纯域 604 项和通道 + Workflow App 714 项。完整 TypeScript、旧 codec 48 HTTP / 8 protocol、原核心 137、job 90、嵌套 189、参考 64、原生 32、结构 32、Workflow 30、发布预览 61、Canvas 121、媒体 16、旧冻结 16 个入口、账务 14、React/Edge 20 + 8 + 6 项均通过。副本完整类型检查及最终回滚回执见证据文件，不把局部浏览器控件测试写成完整 Next 应用已验收。

初始验证失败保留：Kling 首尾帧对照用了旧文生默认 720p，按已发布的帧规格配置显式 1080p 映射后再对照；旧 H3 v2 fixture 错放入未声明的混合参考；无图镜头包含引用标记被正确拒绝；App driver 缺 seconds/size 类型字段及 profile 类型未收窄。这些均修正 fixture，不删除产品校验。Windows 媒体状态 rename EPERM 仍为开放问题；已有结果恢复重试不重发供应商 create。

## 未完成项与下一步

注册协议的本地编译/序列化覆盖不等于在用生产模型已发布 Binding。仍需明确的绑定迁移候选（保留人工参数映射、价格、政策及证据）、其余实际无 profile direct 组合、新任务旧门禁/fallback/upgrader 调用退出，以及 RFC A01–A19 的完整 Next / 独立应用 Worker / 重启 / 浏览器资产链验收。

本切片生产配置写入 0、付费上游调用 0、部署 0；47 HOLD 和 103 独立参数映射验证线保持。真实付费上游、正式发布及蓝绿回滚分别验收，不以本地 fixture 代替。
