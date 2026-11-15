# 视频域验收契约迁移：验证当前所有者，不恢复旧门禁

## 模块与职责

基线 main `6037a815db7b8e000bb9c4604380f0e7e281a86f`。本片只改验证脚本、CI用例目录与文档；`src/`、应用配置、数据库和供应商实现不变，不触发业务发布。

旧 `verify-video-domain.mjs` 在当前 main 真实失败于 `capabilities.ts missing getVideoModelCapability`。它还要求 `fallbackCapability` / `validateAgainstCapability` 存在、业务函数物理写在兼容 facade、恢复代码保留特定中文注释和旧变量名、媒体 Route 自己写作品。这些位置约束与 RFC 的统一编译和模块所有权冲突。修复验证器，而不是恢复旧产品规则。

## 公共接口、依赖与状态归属

- 同一 `node scripts/verify-video-domain.mjs` 命令继续作为离线源码契约入口，新增可选 `--source-root` 用于独立归档核对。
- 脚本导出只读 `verifyVideoDomain({read,exists})` 和明确的37文件清单，供同目录回归反控使用；不引入业务运行框架、全局注册表或产品门禁。
- TypeScript AST核对实际调用、导出/reexport及导入别名；有限的原数值/SQL/血缘规则保留源码模式检查。注释/证据字符串不当成可调用门禁。类型导出与运行导出分开。
- 40项源码检查只证明当前所有者接线；不将源码或mutation结果写成运行时、PG、付费上游或生产发布成功。
- `verify-video-domain-regressions.mjs` 在内存副本注入42种退化并要求对应检查准确失败，真实 `src/` 写入0、网络0；正控和注释/字符串/type-only证据对照保持通过。

## 原断言迁移表

| 原语义 | 当前责任位置与验收 |
|---|---|
| 目录/模型识别 | catalog Route从已发布Binding投影；缺映射保留身份；历史元数据仅documented查询；旧执法导出不得恢复 |
| 特定Seedance静态15秒条目 | 历史资料保留，但“某型号资料常量必须存在”不再是执行许可；真实时长约束仍由Profile fixture验证，不恢复按名裁决 |
| 新任务创建/公开兼容API | service仅reexport creation/runtime/queries；submission统一compiled；prepare统一Resolver/Compiler；Canvas无旧输入回退 |
| 租约、预扣续约和瞬时错误 | runtime实际touchReservation/claimVideoTaskPoll、TransientPollError和原退避重试；不要求函数仍放在facade |
| Worker后台恢复 | worker调用task/Workflow恢复，保留执行模式/幂等启动与layout接线；独立Worker不被改成强制嵌入 |
| 生成鉴权/imageUrl/回执 | generate Route调用认证、same-site、creation；现有应用用例保持taskId/cost，不要求Route自行创建任务 |
| 列表、只读详情、删除与显式retry | 实际Route owner；sourceIds最大500、分页/pending恢复；详情不得poll或create，retry读取冻结输入并保留retryOf |
| Workbench历史/批量/删除/发送 | session与use-video-history/use-video-generation；保留有界批量与操作回执，不再钉死旧taskCount变量或1–6文案 |
| Canvas恢复80分块、500查询、失败后重试 | video-task-follow及React绑定；原taskId/attention/result身份保持，展示恢复不得生成新视频；不要求旧Canvas单体注释区块 |
| 视频/音频显示、首帧/音轨/播放时刻 | scene projection、Artwork surface、VideoPlayer和ResultDock接线/类型正确；不要求播放器实现回塞Canvas单体 |
| 抽取任务和父子血缘 | extract Route调用持久media owner；media publisher保留primary parent与secondary slice(1)、音频/图片类别；send-to-canvas由原asset/node事务所有者执行 |
| 新冻结计划/历史兼容 | reader保留v3与v2，原Workflow兼容入口必须读实际归属和加密快照、execution_version=0；不要求删除真实历史reader |

## 集中验证与实现记录

迁移后源码契约40项/37文件通过；42种退化反控包含旧门禁导出/重导出/star/namespace、别名及属性调用、预览创建/网络、Canvas重复输入编排、历史格式限制、报价确认、预扣续约、Worker扫描/模式/启动、鉴权、只读详情poll、sourceIds限额、冻结retry及终态限制、asset发送与持久化、共享preview、批量整数及范围、分块/HTTP重试、展示层生成、无图片的视频/音频过滤、原生播放时间、持久抽取/父素材身份和父子血缘/音频类别。删源文件或复活模拟组件也准确拒绝。

原main基线失败原样保留。首轮验证器误将type-only reexport当成运行导出，另一次仍使用已迁移的addArtworksTx位置假设；修正为实际运行导出/原asset事务接口及SQL，未修改产品。原失败日志、集中回归、独立复制与回滚命令/输入/逐字输出/exit以 `E:/Workspace/naumi/output/video-domain-contract-20261115/VERIFICATION.txt` 为准。

两入口已登记到原refactor用例目录，沿用既有source-bound runner，不新增工作流。实际App/PG/Worker的152项证据仍绑定其6037产品源码；本片的`src/`无差异不等于重新运行了生产镜像或真实上游。

## 未完成项与下一步

实际启用Binding/env-only清单审查和显式迁移、授权上游、当前固定完整包、目标站网关/全业务活动所有权与蓝绿验收继续开放。总目标ACTIVE；47 HOLD、103实验线隔离、共享checkout保持；本片生产配置写入/付费/部署0，纯测试/文档整合不增加发布计数。

## 最终本地结果

源与独立解包副本均通过40项当前源码契约、42种退化反控；显式外部source-root指向原工作树也通过。副本基线与回滚后均原样复现旧验收器失败exit1，三阶段原核心137项均exit0，五路径原哈希/原不存在状态恢复，修改版源码/ZIP保留。源码未变不把静态检查冒充PG或真实Web验收。

集中原回归：核心137、Workflow30、native32、runtime formats25、恢复13case/26check、Canvas提交30case/121check、Canvas跟随21check/14公共轨迹、入口ports13、管理员升级器退出4根通过。source-bound runner33case/473check通过；其自身故障/源码漂移/错误SHA等反控仍保留。首轮跟随测试误传未识别的--output，仅影响夹具输出目录；最终使用原--out写入本任务目录，未删原日志。实际业务源码、Next config和Dockerfile相对6037均无改动，未重跑全量生产构建或新增付费验收。
