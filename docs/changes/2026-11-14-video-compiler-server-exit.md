# 视频新任务服务端切换与发布准备

## 模块与职责

本切片与前端退出切片一并整合。新任务只接受已发布的可执行 Binding，由 Input Resolver/Profile 编译；旧能力描述不再作为新提交、工作流冻结、目录的裁判。缺少映射返回 `VIDEO_EXECUTION_NOT_CONFIGURED`，不是上游不支持，不重新进入旧 normalizer。

## 公共接口、依赖与状态归属

- `createValidatedVideo` 只有编译入口和受控的历史工作流兼容入口。`submission-identity` 拥有原请求摘要，`owned-text` 拥有既有文本读取；抽出二者避免历史兼容模块反向导入新提交编排形成循环。
- `runOwnedLegacyWorkflowStage` 读取实际归属的工作流行、节点身份及加密冻结阶段，精确比对后才授予局部 AsyncLocalStorage 作用域。HTTP 标志、伪造对象、跨用户和已修改对象均不能开启旧路径。历史 v2 请求、账务、poll/cancel、UNKNOWN 不迁写。
- 工作流表扩展 `execution_version integer NOT NULL DEFAULT 0`；新受理显式写 1。旧行保持 0。新行缺冻结记录不能降级成“旧的未冻结工作流”。真正旧版未冻结行仍沿当时的解析语义恢复；其读取旧元数据的分支只存在于数据库核验后的兼容作用域。
- 任务、节点、Creation、预占和账本仍沿既有同一事务写入；未引入第二个事务或 HTTP 自调用。
- `videoExecutionReadiness(snapshot)` 为纯配置准备报告，只检查显式开放路线、实际 recipe/Profile 及查询传输对应关系。业务开关、工具范围、模型/通道显式停用保持独立语义；旧 modes/limits/verified 不参与。不是运行时能力白名单，不改配置，不读凭据，不调用供应商。
- `videoReleaseReadiness` 只读已发布版本。`/api/health` 返回脱敏数量/ready，缺迁移时 503；管理员 `GET /api/admin/model-management?view=video-execution-readiness` 返回详细诊断。控制恢复的检查通过 Route 注入基础设施 store，在原回执和 CAS 核验后、状态变化前执行，基础设施不反向导入视频业务。
- 目录不再虚构 fallback；未绑定条目保留身份并标记 mapping_required。新 executor resolve 不读取旧能力元数据，历史 describe 仍解释原快照。移除 bootstrap 按型号推断参考图数量的分支。
- 新提交/Canvas 草稿/Workflow 的顶层时长只作有限数值形状解析；小数等真实允许值交给已发布参数合同。实际类型/范围限制仍由编译器执行，历史 normalizer 的规则保持。

## 实现与迁移状态

1. 前端创建/连线/模型切换不再修改角色、丢参数；服务端新受理不再二次解释旧能力。
2. 32 条已审查迁移候选继续复用管理员版本/CAS/绑定字段回退机制；没有自动应用到任何站点。旧能力、价格和映射不自动变成 ExecutionPolicy。
3. 环境变量专用视频接入未伪造 recipe：缺托管 Binding 时准备报告为 `VIDEO_MANAGED_BINDING_REQUIRED`，保留旧发布服务直到显式准备完成。此状态不是已迁移，不能直接发布候选。
4. 原视频来源优先级验证已在固定基线 f1fe8f83 实跑保留；当前验证断言“新任务不再走旧门禁”，并保留历史 normalizer 来源丢失负控，不以改预期掩盖旧任务恢复。实际持久化旧阶段另有 App 测试。

## 集中验证与证据层级

证据目录：`E:/Workspace/naumi/output/video-compiler-server-exit-20261114`。

- 完整实际应用函数/PG/本地供应商 HTTP/独立媒体 Worker/FFmpeg/资产/账务：1,741 项通过，727 本地创建、521 查询、516 下载。独立补测最终服务端 19 项，合计基础 App 57 项通过。
- V8 precise coverage 先用真实旧函数作正控并重置计数，再观测新 create/freeze：旧 normalize/resolve/adapter/create codec 调用为 0；源 AST 同时核对新入口无直接旧裁决调用。此结论只覆盖新受理，历史恢复仍保留旧函数。
- 配置准备 15 项，32 候选显式迁移后 ready；错误查询协议、实际政策停用、business 开关/范围、未知型号均覆盖。真实 health/control/admin Route 的准入、鉴权、原回执与配置变更覆盖。
- model-execution/review：图片/文字/视频凭据轮换、冻结 wire/公共身份、原回执重试、UNKNOWN 不重放、后台回执及精确回退 SQL 通过。
- 核心 137、native 32、workflow 30、structured 32、迁移 79/真实管理 19、合同投影预览 61、React/Edge 10、历史选项 1,254（8,251 断言）、mode 42、v3 379 及计费/Canvas/媒体等集中回归通过。完整 TypeScript 和解压副本检查以 VERIFICATION.txt 为准。
- 失败日志保留：旧未冻结工作流误读空定义、测试配方错带到不同查询协议、测试业务字段缺项、V8 对完全未执行脚本可省略的观测驱动问题。对应修复后重验；未跳过业务断言。

## 发布前置与未完成项

没有生产配置写入、付费调用或站点发布。发布前需读取目标站实际启用路线，人工审查/发布缺少的 Binding，确认准备报告 ready，再按蓝绿流程验收；本切片不自动解除 47 HOLD。环境专用/实际未覆盖的无 Profile 组合、完整 Next/独立应用 Worker 重启/浏览器跨层链路、RFC A01–A19 完整退出表、授权上游与蓝绿验收仍继续。媒体 Worker 与应用 Worker 证据分开，不把 1,741 函数检查写成完整 Next 或真实供应商验收。总目标 ACTIVE。

## 可回退交付

本轮四件套覆盖 UI 与服务端相对 main fd505379 的组合增量，原始 SHA256 保留。解压到独立副本后集中测试，再运行 hash-guarded ROLLBACK.sh 恢复原源码并重跑基线行为；工作实现保持修改状态。回退不修改数据库/媒体/已受理任务，扩展列不回删。具体命令、输入、字面输出、exit 和四路径以 VERIFICATION.txt 为准；Git 整合回执另记，不等同上线。
