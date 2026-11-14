# 视频执行绑定显式迁移与旧能力升级入口退出

## 模块与职责

本切片属于 model-config，提供已发布视频通道的执行绑定审查/原子发布，不把能力描述升级为运行许可。video 编译器继续负责协议编译，媒体模块继续负责可信字节与实际解码。

- 新模块 `video-execution-migration.ts` 暴露 proposed/plan/review/applyReviewed/rollback 五个窄接口。迁移仅写 `parameterMap.videoExecution` 和必要的 `parameterMap.videoProfile`；现有明确执行绑定不覆盖。
- `video-execution-presets.json` 提供32个明确协议/型号的候选配方（APIB21、Geek10、GeekH3一项）。这是离线审查的起点，不是运行时型号白名单，也不是供应商成功证据。未知组合可由执行编辑器明确填写，未映射则返回 mapping_required。
- 旧 modes/limits/verified、原始能力证据、价格/成本、路由和身份均原样保留，不自动迁移为 ExecutionPolicy。独立 quality/resolutionPolicy/videoWorkflow 等尚无法自动合并的人工契约准确标注待映射，不静默抛弃。
- 既有 requested→effective 分辨率映射复制到新recipe且仅执行一次，原字段保留；人工默认值和明确send=omit应用到基础规则及操作覆盖，false/0保留，自定义createPath保留。未映射的人工参数不猜字段。
- 审查digest绑定完整原配置、版本和写入清单；管理员在审查后修改其他字段也触发CAS冲突。共享upstream只修改一次。回退核对原身份与实际写入字段，保留后续无关编辑，对后续绑定修改返回冲突。

## 公共接口、依赖方向和事务归属

Admin UI→management handler/action→model-config迁移/既有版本化发布事务→冻结执行绑定→video公共编译服务。纯迁移函数无DB/网络/React依赖。操作draft、router激活、UNKNOWN恢复和catalogue刷新沿用既有管理会话，不另建事务或内部HTTP。

## 管理入口与历史兼容

- 新view/action `video-execution-migration` 返回审查清单并按原操作身份发布。实际React编辑器显示执行JSON和查询协议，格式错误保留草稿，用户取消不发布；executionOnly写入不会删除旧能力记录。
- 新的旧 `video-capability-upgrade` GET/POST返回410；POST在创建草稿之前退出。新管理调用图不再可达旧whole-capability升级模块。
- 已经staged/unknown/applied的旧操作不冒充新操作，沿原请求、actor与reason恢复。特别保留历史reason `MVP 更新已核对的视频能力`，避免原receipt身份失配。
- 保留旧库函数及其兼容测试，不通过删文件伪造全局旧门禁退出。全局submission/workflow/frontend未绑定旧分支仍待下一切片，`GLOBAL_NEW_TASK_GATE_EXIT=NOT_YET`。

## 验证与证据层级

证据目录：`E:/Workspace/naumi/output/video-compiler-binding-20261114`。

- 基线b4bd0807真实管理action对32模型写 capabilities.video/maxReferenceImages/videoProfile；修改版同输入仅写videoExecution/videoProfile，能力记录保持不变。
- 纯迁移79项，32候选schema、完整写集/价格/映射/omit/默认值/CAS/回退冲突及executionOnly编辑。
- 真实隔离PG/管理handler/runtime/router边界19项；新操作断连→unknown→原身份恢复，旧staged unknown原身份恢复，两次分别单次激活。旧版本/账务/管理员未保存草稿不变。
- 实际管理React/无头Edge七项、执行编辑器四项；无真实供应商。AST导入图4个根/364文件，旧两升级模块可达0（仅管理员图，不冒充全局清零）。
- 新迁移App五项：旧未绑定preview准确诊断；审查发布后旧text-only/images0不阻止图片；预览/提交同计划、4K→720p一次；再次发布旧配置后原任务沿冻结新recipe执行，资产/历史/单账本保持。
- 核心、各协议、Workflow、UI/Canvas/媒体、冻结来源和账务集中回归及全量tsc见原始日志与VERIFICATION.txt。完整App结果以该证据最终记录为准，不将早期失败抹掉。

## 已发现而未归为本次修复的媒体故障

首轮完整组合App在family Agnes-v25真实音频/视频输入解析处失败，VIDEO_INPUT_RESOLUTION_FAILED；媒体Worker日志有实际rename EPERM，结果路径亦出现MEDIA_STATE_WRITE_FAILED。b4bd0807原始基线家族183项虽通过，但同样出现MEDIA_STATE_WRITE_FAILED。故这是既有、仍开放的媒体状态持久化故障，不是通过放松输入验证或重跑即可宣称修复。原始失败日志完整保留；必须单独以可控原生文件故障与Worker生命周期验证处理。

## 未完成项与下一步

生产绑定迁移0、付费供应商调用0、部署0。32个候选不代表生产目录已经迁移。全部57注册Profile本地覆盖继承前切片，但其他实际无profile组合、全局新任务旧门禁/fallback退出、完整Next/独立应用Worker进程重启、RFC A01-A19/真实上游及蓝绿版本兼容验收仍在ACTIVE总目标内。47 HOLD、103隔离模型映射实验线、共享checkout保持。

下一切片先解决实际媒体状态持久化故障，再按已审查绑定迁移的前置条件退出全局旧裁决，保留历史任务和未迁移通道行为；不把迁移前一刀禁用通道当作清场。
