# Restore 草稿上下文修复：同步目标基线与原生验收路径

## 输入与职责

PR #9 的原头为 `d1ccccce05b81d952b98b4f9407aade96c642536`。原 Core、注册模型组与 billing-ui 实际成功；Verify 第 18 步在隔离源码副本中报 `Fixture Router build failed`。

本轮只在独立 `codex/model-restore-draft-context-20261101` 工作树同步已提交的目标分支 `08731a4a2f7ee8d68fe59e8086caec7a6479f0e3`。共享重构工作树不切分支、不改文件。原 `d1ccccce` 的 repository/runtime/types 三文件在合并后保持 Git 内容完全相同，publish 来源草稿与 restore 无来源草稿的合同不回退。

## 复现与修正

- 原 runner 原样接收调用方的相对 Router 路径，却让 fixture 在隔离源码副本内执行。受控反例调用实际 runner 与真实 `spawnSync(go build)`：Go 本身可用，原启动因 cwd 不存在返回 `status=null/error=ENOENT`、exit 1。
- 目标分支已经在组装 child env 时按调用方根目录解析该路径。同步后同一反例实际离线编译最小 Go 模块，exit 0，fixture/checker/IPC 均正常结束。没有复制 Router 到每一个源码副本，没有取消源码隔离。
- 同步后先实际运行旧模型执行夹具，复现另一项接线不一致：夹具模拟 publish 时仍用两参 `markApplied`，没有来源草稿身份，随后严格的旧 revision 检查收到了旧 base 拒绝。
- 四处已明确 stage 的 publish 夹具现在传入各自保存的 draft ID。新增断言核对本人草稿 base 和 revision 仅续接一次；原旧页面 `DRAFT_CONFLICT` 与另一管理员旧 base `PUBLISH_STALE_DRAFT_BASE` 两项严格断言保持。两参兼容路径及 restore 无上下文路径不改。

## 验证边界与剩余

本次单次集中模块验证已经实际完成：

- 真实隔离 PG 上下文回归 36 项通过，历史匹配草稿恢复保持 `base=4→4/revision=1→1`；原 UNKNOWN 同 ID 核对、单次 activation、旧回执幂等和在途编辑均保留。
- 原顺序 11 个模型命令全部 exit 0，包含真实 Node→Go wire、共享 PG 账号 slot、原始 admin/publication 与完整 execution；loopback 供应商不是外部付费供应商。
- 原生 runner 归属模块 122 检查通过；原统一 runner 合同 20 场景/369 检查通过；原免重复确认静态合同 37 检查通过。
- 同步后但夹具未接来源 ID 的中间失败原样保留，不混写为 restore 实现失败或最终通过。

- 本次 AST 对照实际确认目标分支 118 条原断言全部精确保留，当前 120 条，仅增加两条发布者草稿 base/revision 续接断言。
- 本机实际 `next typegen`、全项目非增量 TypeScript、五个受影响 TS 文件 lint、runner Node 语法与 diff-check 均 exit 0；5,069 个编译输入和 4 个配置在检查前后原始哈希一致。
- 审计 AST 辅助脚本首次根目录计算错误的 exit 1 已单独保留，只修辅助脚本路径后继续；没有把未执行的类型检查算通过，也没有重跑已通过的 PG/模型模块。
- package-lock 未改变，现有 node_modules 为共享依赖 junction，本次保持只读，没有执行依赖重装。

精确命令、结果、源码绑定、原始失败、四产物、副本回滚和自有夹具清理，以本轮 `output/pr9-ci-router-base-sync-20261102/VERIFICATION.txt` 的实际记录为准。

最小 Go 模块用于验证目录归属与真实编译，不冒充完整 Next/PG/Go/浏览器验收。完整原生流程由新提交 CI 独立验证；本地局部通过不代替新头完整 Core/Verify、目标候选整合、main 或部署。
