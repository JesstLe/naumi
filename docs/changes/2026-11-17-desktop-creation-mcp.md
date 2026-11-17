# Desktop 创作 MCP：稳定调用与文件交付切片

## 模块与职责

承接Desktop线程明确继续推进，不重做Agent/Gateway/计费。Naumi侧负责人维护本轮客户端、固定分发、宿主薄适配和能力矩阵；Desktop侧负责在原账号/Session scope安装、密钥库与原生present执行器接线。本轮不编辑Desktop共享checkout。

基线`ee9220ea6e61ea333378fbcb10d41f43123f3a25`，分支`codex/desktop-creation-mcp-20261117`；源文件变化范围与真实命令在output/desktop-creation中归档。发布/配置/真实费用均0；前轮47收尾仍是独立未完成目标。

## 根因与实施决策

现有CLI/MCP已经是同一Gateway工具owner，但缺Desktop账号绑定、空间透传和可持久化外层调用信封。MCP原直接调用自动生成UUID；文档要求保留编号，却没有宿主调用前提供编号的正式入口。工具目录进程级缓存且丢available；下载只有路径/字节，没有原生文件交付回执。页面链接不解决这些问题。

本轮沿原单文件客户端增加Desktop模式和兼容辅助工具，不替换领域执行；账号与企业授权继续服务端原路径。目录available与企业执行权益同源，不因账号可用而宣称企业可用。

## 实现/调用方/数据归属

- public/agent/naumi.mjs：1.1.0，NAUMI_TOKEN_FILE/ACCOUNT/WORKSPACE/FILE_ROOT；Desktop无隐式账号profile；稳定naumi_call信封和实时发现；流式独占下载、SHA与防覆盖。
- src/lib/agent-gateway/executor.ts：listGatewayTools的available相交现有enterpriseCreationRead/assertCreationFeature；最终执行权限仍独立核验，不移除任何权限。
- integrations/desktop/naumi-creation.mjs：验证固定bundle、生成原Harness MCP/Skill配置、真实文件回执核验后调用宿主原present；不伪造交付事件。
- scripts/package-naumi-desktop.mjs：固定commit/hash客户端与Skill分发；脏包只允许fixture。
- scripts/agent-desktop-capabilities.ts：从实际工具registry生成完整schema、write/billed/feature/domain矩阵，明确source-only，不编造生产available。
- Skill和契约明确外层operationId/内层领域编号、UNKNOWN、账号切换、显式项目节点revision和未工具化行为。

公共依赖：Desktop账号Session→现有Harness MCP Client→Naumi客户端→原HTTP Gateway→原tool-session/权限/计费/任务/媒体owner。令牌管理表、预算和账务事务不复制；客户端不直接写任何业务表。原生交付仍由Desktop已有present拥有。

## 实际能力覆盖（以生成矩阵和认证目录为准）

| 创作域 | 现有正式工具入口 | 本轮证据边界 |
|---|---|---|
| 生图/修图/换色 | generate_image/retouch_product/recolor_product/replicate_hot | schema盘点；首链待本轮集中测试 |
| 抠图/高清/局部/风格/融合 | cutout_image/cutout_avatar/upscale_image/inpaint_image/transfer_style/fuse_images等 | 不以存在工具推断模型已配置 |
| 套图/A+/服装/印花 | generate_suite；A+原分步审核；try_on/extract_garment等 | 原工具和权限/报价保留，不自动批量收费 |
| 视频节点 | list/create/get/set/generate/extend/edit、任务查询/取消 | 显式project/node/revision，不注入网页selection |
| 正式分镜/审片 | list/get/save/fork/inspect、structure/roughcut、review回执 | 原方案/工程CAS与领域操作编号保留 |
| 制作链/多轨/对白 | run/get/resume_workflow、get/save/render/adopt_timeline、speech/transcribe/review | 原持久任务所有者，不声称所有供应通道可用 |
| 通用图片/文字节点、连线、布局、项目CRUD | 尚无完整远程工具切片 | 明确未完成，禁止网页点击/直写DB冒充 |
| 后台管理 | 不纳入普通创作范围 | 不新增管理员工具/权限 |

## 基线与验证（实施中）

修改前`verify-agent-chain-gateway-pg.ts`在固定基线运行：前8项实际Route/PG检查通过，随后旧fixture的verify_image_output调用没有result事件，解析undefined失败exit1；原日志保留，不改正确断言换通过。本轮完整切片测试另记录原网关smoke与新客户端/宿主适配负例，未执行前不标PASS。

## 未完成与下一步

Desktop共享checkout没有内置注册本轮bundle；账号授权UI、OS密钥库、按Session生命周期以及present执行器的正式接线待Desktop消费。status按tokenId/operationId归属，现有status/media未按原任务tenant做撤权后的receipt授权；恢复记录须绑定原scope，不能声称header已实现服务端workspace隔离历史回执。通用画布操作和视频/音频上传、全工具真实收费验收、生产发布不属于已交付结论。集中测试、最终SHA、主线整合与包hash在完成后更新，不依据历史103或工具数量关闭。

## 集中验收与独立审查回执

- 既有`agent-gateway-smoke.ts`已扩首链，不另写业务执行器；真实Next、隔离PG、实际CLI/MCP、现有模型/计费/任务/作品owner、可控图片供应商，23项通过exit0。
- Desktop链固定外层UUID，供应商收到原任务后断开MCP进程，重连只查原status，再同号同参数回读：供应商fixture请求增量1、作品增量1、账本增量1、实际扣8与quote一致。结果6270B、SHA与供应商PNG完全相同；无生产供应商调用。
- 使用Desktop已安装`@deepseek-ai/dsh-tool-present`真实实现及官方MCP Config，原present工具body在隔离host/session中产生真实形状`deliverables/presented`事件；不是手写替代卡片，不声称正式Desktop UI已接通。
- 账号中心原UI真实Chrome1440/390通过，无溢出/页面错误；没有产品UI变更。原测试第一次已完成19项旧行为+Desktop链，末尾fixture误用官方schemastery Config.parse失败，修正为Config(...)后集中重跑23项通过，原失败现场保留。
- 客户端保护15项真实MCP/HTTP fixture通过：稳定外层/内层编号、断连、只读计费也不走随机编号、实时目录、账号错配/吊销、workspace透传、文件边界/防覆盖/hash、外部manifest pin、固定干净bundle门槛、按账号换号disposer正确释放原Harness Fiber及原present callback。
- 企业权限10项真实PG/实际Route通过：原账号allow、企业deny相交、个人不受污染、禁用企业拒绝、跨账号拒绝、只读token不发现写工具。初版fixture用了计费feature id而不是权限id，原失败保留；后按实际catalog `generate`核验，不改产品断言。
- 独立Reviewer实际复跑14项客户端测试、检查全部diff及真实链证据，指出tools Route未传creation:true导致HTTP目录漏企业约束，已修正并补真实Route负例。既有status/media授权边界明确记入契约，不以header透传掩盖。
- 最终完整SHA、runner命令/退出码、源码摘要、打包hash在忽略目录证据报告中记录。非core runner按既有规则PARTIAL/exit2；所选子命令必须全部exit0。源码类型检查、diff检查与固定提交回归共同验收，不伪称全仓或生产验收。
- 固定SHA首轮发现测试自己假设checkout永远脏，导致干净固定提交未触发“拒绝脏包”断言；已改成显式构造dirty manifest负例。不是放宽干净包门槛。原固定失败报告保留，修正后再集中复跑。
