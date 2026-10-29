# 47 容量修复批次发布 r2

## 模块与职责
父线程负责 main 固定构建、47 入口与同版 Web/Worker 切换、回退材料及实际验收；不改动数据库/媒体归属，不重放已受理任务。

## 本轮授权与固定范围
用户明确要求“抽空可以更新一版线上，然后继续完成推进”，随后确认“现在没人用，允许直接切；”。本轮目标沿用已确认的 47；不扩展其他站点，不复用旧强制终止授权。
业务基线 main `154a7f9fc4a13726fd6b666c0d959edb6ea01c30`。本次公开说明独立追加，实际候选 SHA 随普通合 main 后固定。包含已整合的账务 FIFO / BI、Agent 与工作台生命周期、画布修复、X6 查询边界和上传验证内存优化；未复核运行配置 `7e5ece5f` 与未完成 A15 不纳入。

## 本次实现与迁移状态
公开说明已按真实候选范围复核、双语及版本校验；只描述用户可感知变化。47 实测旧 Web/Worker 为 `e1878018` / `1793247893`，nginx 指向 13125。此时尚未切换；不得据 main 合入写成已上线。
本轮三把部署锁及 lifecycle lock 已持有。canonical `MIGRATED_CLEANUP_PENDING` 和历史 UNKNOWN/journal 保留，新增当前授权的独立发布记录，不将旧债改成 COMPLETE。

## 验证与证据层级
公开说明 check 通过；现有模块的 BASELINE/MODIFIED/独立副本 ROLLBACK 证据沿各模块文档。完整固定 Linux 构建、镜像 smoke、备份、旁路验收、实际切流与最终验收按本文件后续增量记录，不冒用本地 fixture。
证据目录：`output/capacity-audit-wave2-20261029/release47-batch-154a7f9f-20261029-r2/`。

## 未完成项与下一步
完成本轮固定镜像、空间处理、线上切换/验证和恢复绑定后更新台账。用户无用户授权不等于历史 UNKNOWN 已消解，容量剩余项继续推进。


## 2026-10-29 本轮固定构建与发布前实测
- 公开说明提交 `a6dceba8` 普通合入并推 main `b79c8c397a33cfb3b636acbbe2edfa976f534c39`；业务代码仍为已验收 `154a7f9f` 内容。BUILD_VERSION=`1793281629`，同版镜像 `sha256:25fbae1d9999eb461515830323618aa8871842774e44849fc0aa27ff005f8ca8`。
- 本机固定 Linux Docker 构建 exit 0（150.1s，含 Next 类型/编译及 Worker 打包），断网镜像 smoke 检查主页面、画布、37 个静态资源和公开说明版本，通过；自有 smoke 容器已移除。未调用付费供应商。
- 47 持三锁清理 6 份逐一核对 config/env/rootfs 与已加载 Docker 镜像一致的重复传输包，共 1,515,996,027 bytes。Docker 镜像/容器、数据库备份与媒体均未删除；清理后空闲 5,691,609,088 bytes。新一致性 pg_dump 已重开列表验证，不执行恢复。
- 本机仅按三个已盘点、reclaimable、非共享的明确 cache ID 清理旧 Next 构建缓存，约 4.30GB；没有无筛选 prune、volume 或他人容器删除。
- 发布前发现采集器真实规模缺口：60s 总期限正确拒绝，保留 `TASK_SNAPSHOT_READ_UNAVAILABLE` 的 incomplete 证据；诊断同 SQL psql exit 3 / 60.103s。扫描 image_jobs 19115 行、billing 11440 行及部分 supplier 后即耗尽期限。这里是现场只读采集耗时，不是业务吞吐测试。
- 估计约百万行 release activity，当前旧槽自身观察历史实数 118169 行，其中未 finished 仅 2 行；其他实例未 finished 6034 行由原 HistoricalEvidence exact hash 独立保护。原 caller 仅缩 seed，没有把观察叶节点范围下推到原生分页源；正在修复，未抬高60s总期限或scan100000上限。其他业务表、账务、原任务与 UNKNOWN 保留范围不缩。
- 业务 worker watchdog 实测 disabled/inactive；有锁感知的 recovery timer active/enabled；独立 NAS watchdog 保持。没有根据外部“v3已开”的报告重复手术或删除状态。
- 当前阶段尚未切换入口；原版继续服务。最终切流、运行版本、恢复绑定和释放锁另在本节后续增量登记。
