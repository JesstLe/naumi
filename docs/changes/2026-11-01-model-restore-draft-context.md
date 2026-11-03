# R9V 续修：发布来源草稿与历史恢复的归属

## 复现与工作目录

输入固定为 `b24b1e733710b9dcc9bad875f90b7fe0dc6c4ea4`。该版本新增的 `markApplied` 分支只按 actor 和摘要续接草稿；当管理员持有草稿 A、另一管理员发布 B、原管理员恢复历史 A 时，历史恢复会把工作草稿的 base/revision 从 1/1 推进为 3/2。旧 `59f1fbc3` 保留完整草稿，既有发布验收也明确要求恢复不改工作草稿。

本次在独立 `E:/Workspace/naumi-model-restore-draft-context-20261101`、分支 `codex/model-restore-draft-context-20261101` 和自有隔离 PostgreSQL 工作，不覆盖仍在封装的原 R9V 工作树、索引、源码包或原始失败记录。

## 职责、公开接口与依赖

- `runtime.publish` 在进入异步 staging 前复制全为标量的发布输入；经 `stage` 原操作 fingerprint 校验的同一 `draftId` 传给 `apply` 和 `repo.markApplied`。
- `runtime.restore` 不拥有来源草稿，不携带该上下文。历史内容或当前内容恰好匹配工作草稿，都不触发续接。
- `markApplied(id, digest, publishedDraftId?)` 维持两参数兼容；只对明确传入的来源草稿按 **draft ID + 发布 actor** 加锁，原摘要比较继续保留在途新增编辑。
- active version、applied 回执、草稿基线/revision、容量、视频能力冻结和审计仍在原事务，未新增 schema、状态库、费用确认、供应商重试或价格变更。
- UNKNOWN 仍沿原发布输入和原操作 ID 核对；已经 applied 的原回执重读不再次推进草稿。

## 正式回归与证据层级

现有已注册 `verify-published-draft-continuation.ts` 保留原用例并增加实际 runtime/repository/PG 场景：匹配历史草稿的恢复、匹配当前内容的恢复、publish 来源 ID 传播、丢失 ACK 的原操作核对、单次 activation 与 applied 回执幂等。

- 固定 b24 基线：新增正式反例 exit 1，`base=4→6/revision=1→2`，原失败保留。
- 修复版：36 项检查通过；历史恢复 `base=4→4/revision=1→1`；正常二次发布、其他管理员冲突、在途编辑、旧回执和 UNKNOWN 继续通过。
- 原管理员及原发布完整模块：均 exit 0；104 项原生子进程/IPC 生命周期验证通过。
- 全项目非增量 TypeScript、定向 lint 与 diff-check：均 exit 0；5,063 个实际编译输入和 4 个配置在检查前后逐 hash 一致。新 worktree 通过实际 `next typegen` 生成本地声明，没有借用其他目录的旧构建类型。
- 只有 3 个原产品文件变化，其余 2,146 个原产品文件 raw SHA 一致。

这里的 Router transport 为夹具；PG、runtime、repository、事务和 HTTP 权限回归均实际执行。结果不冒充本修复的真实 Go/整浏览器、新头完整 core、生产镜像或线上验收。

## 封装、回滚与剩余

四件产物、完整命令/输入/字面输出/退出码、独立副本回滚及首写前后续编辑保护，以 `output/model-restore-draft-context-20261101/VERIFICATION.txt` 和 `DELIVERY.json` 为准。回滚目标为 b24 原始源码及其已复现的 restore 回归，不声称回滚后产品正确；正式工作树保留修复版。

本分支尚待整合到 R9V 候选及 main，未部署。整体重构仍 ACTIVE，47 HOLD 不变；原 R9V 和远端 CI 的独立失败不因本片通过而销账。
