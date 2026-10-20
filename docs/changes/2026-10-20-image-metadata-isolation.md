# 生图执行与供应商元数据隔离

## 用户关注与边界

用户提醒：维护的供应商模型元数据可能在生图调用过程中参与校验，资料缺失、过期、错误或自动刷新不能误伤正常生成。本轮检查基线25684f5c，只核查、补回归证据并提交，不发布、不操作真实供应商或生产元数据。

## 当前调用关系

供应商资料持久保存在app_supplier_model_metadata及来源快照/修订表中，不是每次生图都要读取的外部资料文件。readQualityDefaults/readResolutionDefaults/readImagegenDefaults用于管理员打开参数设置、恢复默认和带修订校验的保存。默认资料经管理员确认，保存为模型配置版本后才进入执行。供应商自动采集写独立资料/来源修订，不直接覆盖app_model_config_versions或客户售价。

planImagegen/withModelRequest从当前或已受理版本的模型配置和计费快照校验；createModelExecutor.describe按冻结modelVersion、digest、facts、参数映射和候选集合执行。图片执行路径不调用上述三类实时资料读取器。管理员显式omit、禁用、false及已发布限制仍有效；“资料未知”不能在实时请求中被擅自解释为禁用，也不能解释为支持。

模型配置版本本身损坏/丢失、凭据不匹配、管理员已发布限制、已受理状态未知，仍必须按原有边界拒绝或核查，不能借资料兜底绕过。视频另有supplierVideoDefinition→发布/版本冻结流程，此结论仅适用于本轮生图资料与参数链路，不扩张为所有模态完全无元数据依赖。配置仓库冷启动仍会准备独立视频schema，但不读取供应商图片资料内容。

## 集中核验（完成）

新增verify-image-metadata-isolation.ts：在本机隔离PG，将资料建议设置为与已发布映射冲突、明确false/unknown，再刷新目录、注入无效JSON、将资料表临时改名。确认资料读取器确实报错，同时当前配置、冷仓库读取、生成规划及冻结调用保持；最后仅经显式发布改变新调用，旧调用保持原参数。该测试只核验规划及HTTP发送，不伪称真实用户收费任务或供应商生图验收。没有为尚未发现的生产缺陷改写运行规则。

Linux Node24及隔离PostgreSQL完成3组检查，全部exit0：

- verify-image-metadata-isolation：元数据建议medium=metadata-tier、resolution=metadata-2k，实际仍发送已发布quality=published-tier、size=2048x2048；明确false/unknown、目录刷新、无效JSON与资料表不可读，均未改变规划和计费版本。新建配置仓库仍可读取当前/固定版本。管理员显式发布后，新调用发送quality=published-new、resolution=2k、aspect_ratio=1:1；旧调用仍发送原质量和size。合成供应商POST总数5，外部真实模型调用0。
- verify-supplier-source-import：来源刷新幂等、公开目录与密钥可访问范围分开记录、币种单位明确，保留人工价格/映射，不自动创建执行模型通过。
- verify-supplier-imagegen-observations：具体编辑参考/输出证据、修订冲突/重放、来源刷新保留、人工false/unknown优先及回滚通过。

完整TypeScript与git diff --check通过。日志保留在本机Linux `/opt/naumi-image-chain-audit47-20261020/evidence/metadata-*`。临时PG与保持会话辅助进程完成后释放；本轮没有连接生产服务器，没有持生产锁、刷新生产资料、发布或真实供应商消费，仅新增回归脚本和交接记录。

## 仍需区分的风险

资料库缺失与“已发布配置本身有误”不是同一情况。若管理员将错误的质量、尺寸或能力映射保存发布，后续新请求仍会受到该已发布规则影响，必须通过明确修订与真实供应商验收修正，不能在调用失败时静默使用最新采集资料或取消必要校验。未来如增加元数据兜底，只允许在配置准备/发布阶段生成固定快照，不能把上游发现请求、资料修订变化或实时资料可用性放进每笔付费调用的必经路径。
