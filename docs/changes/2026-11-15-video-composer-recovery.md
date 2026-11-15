# 视频 Dock 未保存草稿：文档升级与刷新恢复

## 模块与职责

基线 main `0331a9023ffc09c6b85a49c689472dd0fba3c37f`，任务分支 codex/video-composer-recovery-20261115。属于Canvas视频草稿生命周期，不改变Profile、输入编译、报价、任务受理或发布路由。上一轮证明跨build主动导航触发Next原生文档升级；本片解决随之暴露的未保存草稿丢失，不声称零刷新已通过。

## 调研与决策

原VideoSettingsDialog只在卸载时将草稿放入module Map，文档刷新后Map消失。真实React原组件在基线刷新后从未发送的描述回退为服务端值。原Canvas草稿scope/key没有工作空间；现明确纳入账号、观察对象、工作空间、项目、节点。

不引入另一个模型执行层，不改写Next BUILD_ID，不让旧Web无限常驻。使用tab-local sessionStorage恢复编辑状态；原显式保存和服务端revision CAS继续是唯一节点写入入口。草稿不包含报价、计划、幂等回执，不触发网络或任务。

## 公共接口、依赖与状态归属

video/composer-drafts拥有VideoComposerDraftStore、version1结构校验、最多64项恢复日志、完整内容/原baseline/原revision。UI只调用read/write；读取深拷贝，不把恢复内容当作可信素材或可执行计划。损坏记录忽略，存储不可用/满额保留内存，不截断草稿。跨tab不共享恢复日志。

VideoSettingsDialog保留原参数/引用/意图、位置修订rebase与其他编辑器冲突语义；主动保存后清除相同内容的恢复记录。pagehide和卸载保存最新状态；readonly不读取可写草稿，不写恢复日志，锁定/初始化后恢复可写时不擦掉原记录。Canvas以workspace纳入组件key和draftScope，防止不同工作空间复用同实例状态。

## 本次实现与迁移状态

新恢复日志替换旧Map；没有数据库迁移或旧历史任务改写。未发布到站点。原草稿只在内存，无法凭空恢复此前已丢失的内容。dialog无完整owner scope时不持久化，功能不依赖恢复存储成功。

## 验证与未完成项

集中源/独立副本、真实React原Dialog（仅billing/preview I/O为测试边界）、真实Next/ReactFlow/PG/独立Worker及核心/tsc/原UI回归结果记录于 E:/Workspace/naumi/output/video-composer-recovery-20261115/VERIFICATION.txt；以最终命令和exit为准。初始driver将readonly contenteditable=false当input读取而得到undefined，属于断言修正，不改产品控件。真实HTTP/Next测试明确warmup，不称冷启动或固定生产包验收。

本片不解决跨build零刷新，不代替新的固定生产构建、目标站配置/绑定迁移、真实供应商授权验收、全业务collector及站点蓝绿。总目标ACTIVE，47 HOLD，生产配置/付费/部署0。

## 最终集中验证结果

- 原Dialog基线/独立副本回滚均确证UNSAVED_RELOAD=LOST，modified实际React/sessionStorage最终8项通过：整页刷新、位置修订rebase、重选、初始锁定后解锁恢复、账号/工作空间/readonly隔离、完整参数保存、真实HTTP409保留原revision、不成功保存后二次刷新恢复。该独立Dialog夹具只替代billing/preview I/O，不冒称完整应用。
- 恢复日志纯规则10项通过，涵盖完整结构/参数/输入顺序及角色、损坏/版本/单坏记录隔离、64项边界和存储拒绝/满额内存回退。
- 真实Next development＋ReactFlow＋隔离PG＋独立应用Worker/媒体进程：14项底座＋11项Canvas检查exit0；新增未保存描述/模型在刷新后准确恢复，服务端原配置/输入无写入、供应商无增量。原生成前后Dock、选历史→拖线→下游生成、锁定/多选/390px和UNKNOWN保持；完整fixture5笔账本75积分。5子进程、随机schema、pool和浏览器全部清理。路由明确warmup，不作为冷启动或生产镜像证据。
- 核心137项在baseline/modified/restored通过；源码/副本tsc通过，原编译UI20项及runner33case/469检查通过。verify-canvas-node-drafts旧静态断言imageDraft.seed(pend.id,{prompt:""})在源码和独立基线均exit1，原日志保留，本片不改图片业务或降低断言。
- 最终包9路径；独立副本原哈希/原不存在状态恢复，修改源码和ZIP保留。Next dev为自定义dist目录自动改写的tsconfig经JSON字段核对只含预期格式/include变化后恢复开工原字节，不提交生成配置。

最终命令、字节哈希、完整输出/exit和文档刷新后的包回退以VERIFICATION.txt为准；固定生产包重建/真实站点/上游仍待验。
