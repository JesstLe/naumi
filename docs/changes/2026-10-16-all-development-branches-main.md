# 全部开发分支整合到main（2026-10-16）

## 指令与范围
用户明确要求直接合入main，随后确认：全部开发分支，包括已提交但未推送的本地工作；历史备份/回滚专用分支保留不合。本任务仅Git整合，不是服务器发布授权，不SSH/部署/改在线数据/停止线上实例。共享checkout的后台和通用菜单未提交内容保留原处。

独立codex/all-branches-main-20261016，从origin/main c2634fba41fd50a117f9af93e63d865e446f7394开始。刷新全部远端并冻结引用；初始121个开发本地/远端引用全部已成为整合祖先，部分本地/远端同名或旧SHA重叠，不能当作121项独立功能。最终逐引用矩阵见output/all-branches-main-20261016/final-branch-matrix.json。

保留：codex/backup-4087-before-dock-split、codex/canvas-parameter-baseline、远端canvas/channel/model-management/resolution四个rollback-compat。没有删除/重置这些分支或清理他人worktree。

## 合并方法与关键冲突
- 先普通合入release47-integrated，再合最新视频/选择/底栏去重、上传0457bd8、独立企业工作流、吉祥物设计、画布性能及其他运维/历史验收增量。
- 11个仅有已等价cherry-pick的开发历史，经git log --right-only --cherry-pick核对无独有非merge补丁后仅对齐历史；日志记录等价判据，不将该动作当新功能开发。
- 视频设置和i18n保留最新compact composer；上传合并保留isCurrent账号epoch守卫、live位置及单节点setViewport，未整文件覆盖。
- 图片cache同时保留显示像素/重新鉴权和VerifiedImageContentPool；退出/跨账号clear同步清理共享字节。冷模块读取同一损坏IDB测试，避免把仍有效的内存副本误当磁盘未校验。
- Agent旧Map会话发现只在durable release runtime关闭时启用；启用时交由固定所有权路由，新增验证确认不同时探测/转发，未知状态不重试。鉴权/项目约束保留。
- Worker默认继续新WorkerRuntime；旧VIDEO_WORKER_CONTROL_PORT/START_PAUSED选项走隔离video-worker-legacy入口；durable控制优先。保留间隔校验和两套真实Linux停止/交接/UNKNOWN不重放验收。
- Middleware保留精确GET drain-status及UUID tick receipt读取，均需worker secret；其他路径/方法保持用户鉴权。

## 集中验证
- 完整tsc退出0；Windows Node24 / Next15.5.27 / React19.3.0生产构建退出0（已有lint warnings保持，不称零告警）。构建后仅修改测试夹具/文档，无再改业务产物。
- 初始38套集中回归33通过5失败；保留原始日志。manual-layout/public-notes补fixture目录，manual-layout仅放行已明确集成的epoch字段，其余privateFetch/载荷保持严格对比；Worker信号项改在Linux验证，in-flight单元夹具等实际fetch边界，不依赖10ms休眠；middleware补隔离mock与UUID正反例；cache冷模块IDB校验。
- 实际Next CanvasClient/Edge：工具模式12项、视频参考布局15项、原Dock21项、105节点上传/定位7项通过；包含390px、pageerror0、供应商0。原视频第一次解码失败因未复制fixture MP4，补齐真实媒体后重跑通过。
- Browser focus实测、17项模式原生回归通过；独立PG仅本任务新建、192MiB/0.5CPU、loopback随机端口，不访问生产DB。
- Linux Worker23项unit及真实进程handoff/旧drain通过；Python运维离线10套覆盖，7项真实历史网关capture验证、Node inspector10次真实隔离观察通过。早期capture路径/参数缺项失败保留。
- 本地生产构建不是Linux镜像/双槽/上线验收。公开更新记录维持原候选数据，没有把本任务新更改伪称生产发布。扩图502只读诊断无定位结果，不列为已修复。

## 交付与回退
四件产物MODIFIED_FILE.tar、DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh保存在E:/Workspace/naumi/output/all-branches-main-20261016。
副本回退恢复c2634fb全部变更路径原字节SHA，并复现旧鼠标左拖平移；当前候选保持新选择/抓手与所有开发增量。回退只针对独立源码副本，不回灌DB或回放付费任务。合并main后如需撤回使用新revert提交，不强推历史。
最终普通push前再fetch main/开发引用；推送main成功与模型配置发布/服务器切流严格分开。本轮发布次数0，功能整合同步计数归零。
