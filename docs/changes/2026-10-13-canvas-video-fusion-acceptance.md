# 画布视频融合验收状态

完整范围仍为批准设计中的 V01—V24、P01—P08、S01/S02 共 34 项，以及固定上游对照、分支复核、Linux 固定候选与兼容回滚、103 发布、最终交接。当前尚未完成全目标。

## 2026-10-17当前核对

重新运行现有verify-video-fusion-e2e.mjs默认命令，实际读取55份注册材料并逐条件断言，34/34通过；本次是既有应用回执的完整性核对，不是重新调用全部应用场景，也不证明bb镜像已经上线。脚本日志及前后coverage-audit快照位于checkpoint-d/main-sync-20261017/bb-coverage-artifact-audit.log与coverage-audit-bb-final-audit.json。供应商模式仍为合法原创媒体的隔离模拟，realVideoQualityValidated=false。

随后完成bb实际旧→新→旧→新与隔离备份恢复验收，将S01的linuxRollback注册指向逐字节复制的本次原始result.json（checkpoint-d/linux-bb98187/rollback-c05.json，SHA52b5685735990a9d1a4417c0a1f0b0d6ff2f741a5ae5c478e25a8ef56a281db3），并增加versions.1.commit、versions.3.commit都必须等于bb98187完整SHA的断言；旧e997原回执仍保留。更新后34/34、55份材料再次核对通过，日志bb-coverage-after-rollback-bind.log。此为验收清单绑定更新，不改变固定候选内嵌产品运行代码或触发重建。

固定最终业务源已由原e997、63df替换为bb98187 / 1792224867，原因是实际最大IO并发揭示旧媒体代码OOM；旧包明确禁止部署。bb三镜像构建、实际编译App媒体/持久任务、固定镜像两并发大文件和真实原生沙箱已通过，详见[新固定运行候选](2026-10-17-canvas-video-corrected-runtime.md)。旧版本的协议/界面/恢复证据明确保留其原来源，不将原记录改成bb重新执行。最终网关/回滚封存仍进行中，coverage的fixedLinuxRuntimeAndRollback、release103、finalAudit继续pending；comparison与wholeBranchReview保留已完成记录，后续改动的专项复核见各模块文档。

103扩容至少1GiB已获用户明确选择；当前缺服务商控制台入口，尚未实际扩容或发布，部署锁保持空闲。最终交付必须刷新现场基线、备份、完成切换和线上受影响功能验收及18项审计，不因34项能力通过而提前标完整目标完成。下列30/34等为当时历史阶段记录。

`scripts/video-fusion/coverage.json` 是逐项审核清单；运行 `node scripts/verify-video-fusion-e2e.mjs --inventory` 仅验证清单、实现路径及证据注册。默认命令仍会因未闭合的能力退出非零，不能把 inventory 的 PASS 当作完整应用验收通过。

当前逐条件应用审核为30/34，登记43份证据。V12/V13已有真实拼图与连续链应用测试，仍待上游对比条件闭合；S01/S02等待最终候选兼容/账户保护及最终保护审核。固定上游制作规则、媒体工具与供应商原生执行、真实再引用、IC工作台恢复差异见 [原生上游补证](2026-10-14-canvas-video-native-upstream-comparison.md)。V02/V03 的具体源码与真实界面、原生请求、冻结、Worker、费用证据见 [引用与回执记录](2026-10-14-canvas-video-reference-retry.md)；V04 见 [连线与文字映射](2026-10-14-canvas-video-reference-edges.md)，协议分组见 [原生错误及字段审计](2026-10-14-canvas-video-protocol-errors.md)。

2026-10-14最终保护补证：四尺寸生图实际全流程、桌面三工作台及作用域API/共享链接、Agent三尺寸恢复后控件/边界/不新增提交已PASS。全分支新上下文review发现的四项及后续Gemini旧清单/原生默认配置/重复URI问题均修复，最后补审无可执行问题；详见[复核记录](2026-10-14-canvas-video-whole-branch-review.md)。此前导出的5bae420源码包已过期，不能当最终候选；固定Linux构建、回滚、103发布仍未执行，不占部署锁。

51 个协议组合、41 个原生 profile 的实际 App/PG/Router/Worker/私有媒体应用模拟链已通过，详见 [协议应用审计](2026-10-14-canvas-video-coverage-audit.md)。这项证据不替代全部 34 项界面/业务验收，也不替代正式 Linux 候选运行或上线验收。

合法原创 PNG/MP4/WAV 及隔离模拟供应商用于视频生成验收，真实视频 API 消费为 0，真实供应商质量未测。Agent 脚本供应商证明接口及流程，不证明真实模型决策质量。实体 macOS/Safari 未测。本目标尚未发布到 103，也未持有发布锁。
