# 画布视频完整融合进度

日期：2026-10-13。当前阶段：用户已确认实施计划，选择当前会话Native顺序实施。后台大模块开发中：素材和隔离测试入口、规范能力/引用代码已写入；功能测试留到检查点A。应用E2E/固定镜像/发布均未完成，目标active。

设计：[完整范围及34项矩阵](../superpowers/specs/2026-10-13-canvas-video-fusion-design.md)。计划：[18项实施任务与A/B/C/D验收](../superpowers/plans/2026-10-13-canvas-video-fusion.md)。源审计：[当前缺口与签名事实修订](2026-10-13-canvas-video-source-audit.md)。独立分支codex/canvas-video-fusion-20261013，开工main3f1aa4a；设计记录6048ae7/8684d1f，旧阻塞记录908d687。当前main仍3f1aa4a，新增folio-preview远端分支只已刷新，尚未作为本轮业务改动整合。

用户最新追加：在线演示站实操对比；UI不加无用口号/冗余描述；测试大模块完成后集中进行，频率不宜高；每模块更新本文，记实现/未完成/调研/证据，不靠会话记忆。这些已纳入计划，覆盖34项范围保持。

调研纠正：submitQueuedVideoTask已有普通references权限、镜像与900秒R2签名，不再将签名整体误判为缺失；需要扩展到高级元素/嵌套素材并验收真实访问。视频结果真实性、完整引用角色/排序、节点项目归属和Agent持久关联仍是待实现重点。

演示入口调查：IC固定README列有infinite-canvas-cpco.onrender.com的New API配置跳转例；web读取返回Internal Error，还不能确认其当前在线版本。TF当前官方README列有教程/插件市场/官方模型平台api.toonflow.net，未确认可操作公开画布demo。后续必须实际浏览器访问并保存操作证据，不把同名网站/模型平台视为画布演示；无法进入时使用明确标记的本地固定上游实操对照。

| 模块 | 实现状态 | 验收状态 | 未完成/下一步 |
|---|---|---|---|
| 素材/隔离fixture | 初版已写入，尚未验收 | 素材生成完成；功能未执行 | Task1；19份原始素材与SHA/FFprobe清单，真实App/独立Worker/two users/私有签名校验store及HTTP供应商；已补管理配置seed；尚需准备独立PG与真实隔离Router |
| 规范能力/引用 | 初版已写入，尚未验收 | 测试脚本已写；未执行 | Task2；10模式、nullable未知/false/0/omit、组合规格、数量/角色/大小时长/分镜元素校验及双编号；接线到真实提交尚未完成 |
| 后台/资料/公开目录 | 初版已写入，尚未验收 | 配置脚本已写；未执行 | Task3；独立供应商修订、管理员优先、目录/执行共享定义、发布事务内绑定默认能力；完整配置中心与常用模型管理均可编辑。协议和真实提交仍待Task4—9 |
| wire/素材提交 | 共享层初版已写入 | 测试脚本已写；未执行 | Task4；统一普通/元素素材身份权限与临时签名、typed wire接口和严格响应工具；协议绑定在Task5—7、预扣前接线在Task9 |
| IC协议分支 | 初版已写入，尚未验收 | 24个HTTP分支用例已写；未执行 | Task5；OpenAI/Grok/Cog/Agnes两版/Ark/Kling2.6及3/Omni四分支/运动/Gemini/MiniMax；共享适配器已接线，边界和Task9/10完整恢复仍待A/B |
| TokenDance/TF/Compshare | 未实现 | 未执行 | Task6；实际源码全部路由分支与元数据 |
| 视频工作流 | 未实现 | 未执行 | Task7；ComfyUI/AutoDL/RunningHub、串并行真实产物依赖 |
| 节点/项目 | 未实现 | 未执行 | Task8；无图节点、revision、事务和稳定归属 |
| 持久任务/取消/计费 | 未实现 | 未执行 | Task9；完成后检查点A集中测试 |
| 真实媒体与工具 | 未实现 | 未执行 | Task10；隔离处理worker、原生多输出与检查点B |
| 参数/高级画布UI | 未实现 | 未执行 | Task11；沿Naumi交互体系，不加入无用文字 |
| 恢复/播放器/工作台 | 未实现 | 未执行 | Task12；真实状态/播放/Range/历史/发送 |
| Agent/制作规则 | 未实现 | 未执行 | Task13；沿用生图、视频配置/任务/串行及检查点C |
| 上游演示实操 | 入口调查 | 未实操 | Task14；确认归属/实际版本，操作+截图比对 |
| 完整矩阵E2E | 未执行 | 未执行 | Task15；检查点D，供应商模拟与真实应用分开 |
| 固定镜像/回滚 | 未执行 | 未执行 | Task16；上线前完整review、一次固定Linux构建与隔离回滚 |
| 103发布/保护验收 | 未执行 | 未执行 | Task17；用户授权保持，最新持锁基线重新获取 |
| 完成审计/交接 | 未执行 | 未执行 | Task18；逐项证据真实且线上版本一致后才完成 |

阶段记录规则：每完成一个功能任务选择性提交并更新对应行/源码SHA；测试脚本编写与运行分开记录。A完成Task1—9后集中后台验收，B完成媒体，C完成画布Agent，D完整端到端/构建/交付。失败只重跑受影响项，必要环境保护及上线/回滚核验不能省。每3个功能任务刷新整合main与测试频率无关。

服务器状态沿用最近已核验基线：103 App/Worker ee351d9、884604db1b01、version1791873866，健康正常；实施初期没有新连接/修改服务器。103维护计数2、已验收功能迭代计数0。120已废弃，香港/101未连接，不使用历史粘贴地址重新操作旧环境。已有本任务产品文件改动，没有付费模型调用或功能测试通过声明。

实施记录：npm ci完成720包，沿用lockfile未升级依赖。FFmpeg生成19份素材（横/竖/方形4/8/12/15/30秒、静音、音频、首尾PNG），资产清单位于忽略output/canvas-video-fusion-20261013/fixtures/assets；生成本身用FFprobe记录真实规格并留SHA，不等于应用E2E通过。新增fixture guard强制loopback、naumi_video_fixture_库名及本任务owner marker；子App使用清理环境，不加载生产dotenv；cookies仅私有管道。基础S3签名模拟验证AWS签名及过期，真实private访问流程待A。当前宿主无Docker/Bash；现有托管worktree保持，计划专属忽略ledger使用Windows原生方式建立。后续A使用独立fixture PG，不以宿主限制连接正式数据库。


Task3实现记录（尚未功能验收）：

- 供应商视频资料使用独立当前表和修订表；采集只读取显式能力定义或TF结构化声明，不凭模型名猜能力，不覆盖管理配置或客户积分价。来源URL去掉认证查询参数，认证参数不能进入能力选项。
- 模型版本发布事务内冻结视频默认定义、每字段来源、wire profile和供应商修订；公开目录和执行解析共享这一绑定。管理员false、0、null继续优先。旧配置不注入视频默认字段，旧digest兼容脚本归入A。升级前已有任务的冻结兼容在Task9落实。
- 完整配置中心和常用模型管理添加视频编辑；常用管理保存沿用原操作ID、draft/发布、版本冲突及待核对流程。通道必须完整且不能重复或越权；图片仍保留32参考上限，视频专属上限128与通用声明须一致。
- fixture seed加入真实加密凭据、公开/禁用视频模型和积分计费开关；每次App/Worker验收使用独立DB schema，避免沿用上次供应商URL。严格要求另外提供loopback的隔离Router管理地址和fixture凭据，不用正式Router，也不模拟Naumi内部API。该测试基础设施尚未启动。
- 修正fixture余额读取为既有余额镜像credits_total、流水表名app_ledger及无效签名日期拒绝。配置、发布冻结、非法通道测试已编写但没有运行；git diff检查仅检查补丁格式，不作为功能通过证据。
- 本模块仍需在A验证实际目录/鉴权/执行冻结与配置保存，在C进行后台浏览器保存、重载和窄屏验收。Task4继续协议wire/私有素材提交，不以初版代码作为本模块验收完成。


Task4共享层记录（尚未功能验收）：引用解析核对artworkId、storageKey、URL的一致性与作品完成状态，真实MIME/大小取服务端媒体记录。普通和嵌套元素在提交副本统一授权、签名900秒，存储身份继续保留；不以不相关作品ID授权外部URL。外部素材先走媒体上传，媒体真实时长核验在Task10补齐。新增typed wire注册/构造/解析接口、有限明确字段、未知状态和无结果完成响应的暂态分类；额外参数只有显式映射才发送，保留false/0，禁止覆盖model/prompt/auth。旧适配器仍保留兼容分支，新profile绑定和实际transport在Task5—7接入，创建前权限/校验在Task9接线。8引用真实读取、跨用户预扣前拒绝、未知响应和脱敏断言已编写，统一A运行。Task3源码提交d1b9116；再次fetch后origin/main仍3f1aa4a，其他同事新分支未作为本轮代码整合。


Task5初版实现记录（尚未运行验收）：

- 新增6个协议模块与统一wire适配器；显式videoProfile才使用新分支，旧无profile任务继续原适配器。Grok2API、CogVideoX3、Agnes帧数与Agnes2.5独立配置，Kling2.6与3.0分开；Omni text/image/reference/transformation使用各自字段与数量限制，超量明确拒绝，未沿用上游slice截断。
- Ark content角色、generate_audio、水印、seed=0/camera_fixed=false保留；Gemini依据固定IC源码使用inlineData原始图片字节和operation路径；MiniMax/METASO使用H3的content和v2创建/查询，不混用Hailuo v1。KIE3/Omni按固定Go翻译器对应multi_shots/kling_elements/elements及定制/智能分镜字段；API Mart分镜index与元素字段、Omni video_list和运动orientation分开。
- 请求沿用域名/DNS固定与凭据保护，只有创建计入供应商费用观察；响应有明确状态/产物字段，缺ID保留创建结果未知，未知轮询/缺视频继续重试。下载当前拒绝重定向且凭据仅给本来源；完整安全重定向和流式媒体核验在Task10落实。停止204空响应已处理。
- API参数格式HTTP用例覆盖24种组合，模拟端校验独立预期endpoint/模型和轮询路径，下载真实可播放fixture；媒体multipart记录收到的字节SHA。错误、无产物和回显URL不当结果已写断言。以上用例未运行，不能视为供应商或应用E2E通过。
- profile加入幂等配置指纹；管理版任务仍按已有规则不自动重提不确定付费创建。Task9将完整请求、元素/分镜、false/省略、预扣前wire校验与恢复接通；Task10将真实时长、安全媒体处理和失败保存恢复接通。共享层提交107ad33。
