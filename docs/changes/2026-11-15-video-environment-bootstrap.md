# 视频环境接入：保留显式查询协议与连接设置

## 模块与职责

本片属于 model-config 的现有 bootstrap 导入边界。环境来源继续由 `video/providers/config.ts` 解析，模型配置模块继续拥有凭据导入、版本/CAS发布和绑定审查；video Profile 编译器不增加型号规则或额外能力许可。

## 已确认缺陷

`VIDEO_PROVIDERS_JSON` 明确提供的 `videoProfile`、`timeoutMs`、`appUrl` 已经被环境解析器正确读取，但 `bootstrapModelConfig` 构造托管供应商时遗漏这三项。固定基线8b50d356的实际隔离PG复现：源profile为apib-video-v2，导入后null；213000ms变为120000ms；应用地址丢失；既有32候选对应的一条明确通道返回mapping_required。

因此即使部署环境已经知道查询传输，导入后仍丢失这项事实；这不是上游不支持，也不是应当凭型号重新猜协议。

## 公共接口、依赖方向、状态与事务归属

- `bootstrapModelConfig` 原公共接口不变，内部addProvider接受可选显式timeout，仍使用原协议默认值兜底；使用`??`保留0并交原schema拒绝无效值，不以`||`吞掉。
- 视频导入逐字段携带原videoProfile/appUrl。路径、原始授权、工作流ID和幂等策略原样继续；图片/文字调用方不传新参数，旧默认值不变。
- 配置仍经原validateModelConfig、凭据库、事务/锁和发布模块。没有直接写active版本、改历史defaults或创建新的配置源。
- 环境query profile不是execution recipe，更不是ExecutionPolicy。缺少明确执行映射的通道继续进入原审查/编辑器，不自动采用能力描述或虚构输入数量。
- 已发布数据库配置没有回填；当前修复只影响显式执行bootstrap的导入，不在读取既有版本时重导入或覆盖人工维护内容。

## 本次实现、集中验证与证据层级

新增 `verify-video-environment-bootstrap.ts`，实际环境解析→bootstrap→隔离PG原版本库/凭据库→原迁移审查/显式发布→冻结reader，供应商调用0。

- 41条夹具来源覆盖当前8条无profile环境入口（VIDEO_API与7个built-in prefix）、32条显式JSON协议配方候选和1条相同协议未知型号。
- 32条明确候选导入后可进入原审查；8条无profile和1条未知型号保留mapping_required。41/32/9是测试构造数量，不是生产启用目录统计。
- 连接路径、超时、应用地址、授权方式、workflow/幂等字段逐项保留；JSON覆盖同名built-in的原优先级保持。
- 来源对象不变、明文不进snapshot；原能力/价格/绑定/政策保持，迁移字段级回退与原配置一致。
- 真正发布后32条冻结reader引用新版本/摘要；旧版本、旧defaults、原凭据保持。9条待映射仍使readiness未就绪；只在测试副本显式禁用后变ready，未关闭真实通道。
- 非法timeout、profile/protocol不匹配和带query的appUrl仍由既有schema拒绝，不绕过验证。
- 完整本片56项；既有注册配置/Flow、迁移79、发布readiness15、真实管理19、编译核心137与完整tsc集中回归，精确命令、输出、退出码和独立副本结果见VERIFICATION。

## 未完成项与下一步

本片修复环境导入信息丢失，不代表环境通道或生产通道已迁移。全部目标站实际启用配置审计/管理员审查发布、无profile输入字段配置、真实授权上游、浏览器连续性、整站lifecycle/controller和蓝绿验收仍继续；不把query profile当成可执行配方，也不将9条夹具待配置改成supported来通过readiness。

总目标ACTIVE、47 HOLD；站点操作/生产写入/付费/部署0。证据目录 `E:/Workspace/naumi/output/video-environment-bootstrap-20261115`；四产物保存8b50d356基线与四路径哈希，独立副本实际回退，主线整合另有回执。
