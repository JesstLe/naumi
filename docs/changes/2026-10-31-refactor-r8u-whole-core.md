# R8U：完整候选验收与原生夹具内存预算

## 目标、基线和当前事实

持续整体重构不缩减为局部通过。本轮从 `b23aa32a6a54c6770c110343d3819d51888c55f1` 开始，完整5319个原始raw hashes和副本保存在 `output/refactor-r8u-20261031`。前一轮结构债务已关闭，本轮推进完整core，而不是继续机械提取文件。

历史R8P core-final为135PASS/1FAIL/57NOT_RUN；timeline-native-canvas先有ECONNRESET，后一次同source续跑期间明确发生主机commit耗尽和ERR_MEMORY_ALLOCATION_FAILED。历史结果不冒充当前结果，也不把内存发现当所有失败的唯一根因。

## 本轮具体修正

实际安装Next的dev启动代码在没有显式max-old-space-size时，以物理RAM一半覆盖子进程上限；本机64GB配置对应约32651MiB，不参考主机剩余commit。现有video-fusion隔离夹具的cleanEnv故意排除父NODE_OPTIONS，而dev分支原来未指定自己的预算。

只在现有harness的dev App环境指定3072MiB oldspace，避免测试工具按整机容量配置自己。固定Linux生产fixture分支的环境保持，不修改生产Next配置、系统分页文件、钱包/任务/UNKNOWN或用户业务限制，不继承外部NODE_OPTIONS，不增长重试或超时。

验证使用实际harness表达式、实际安装Next内存覆盖代码和真实自有Node的v8堆上限回执；随后执行原生timeline及当前完整core。该配置不是生产容量证明，实际是否足够由完整链路结果说明，不能仅凭静态flag称通过。

## 验证与退出

实际命令、baseline/modified/rollback、完整core结果和自有资源清理完成后补录；任何FAIL/NOT_RUN保持原样。完整固定Web/Worker镜像、runtime177/产品browser92、同机性能/持续容量、有效CI和最终main验收仍OPEN；47 HOLD。夹具基础设施修正不增加产品功能模块计数。
