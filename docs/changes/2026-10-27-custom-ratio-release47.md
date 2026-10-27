# 自定义跟随比例修复：47 已上线

- 发布源码 `187559d2f6830a2ab34fc232b9ecdaa1ad6f036b`，版本 `1793075393`。
- 本轮完成时间（UTC）：2026-10-27T04:38:32.447903+00:00；canonical revision 975，`COMPLETE`。
- 合入用户分支 `564c6bc6`，包含最新main后台失败原因展示 `27e5f0a4`，不合重构。
- 另补两个确定边界：不可换算比例返回受控拒绝而不是抛到500；管理员排除的命名比例不会被自定义像素兜底重新开放。
- 跟随图比例源代码：`src/lib/imagegen/frame-ratio.ts:7-11`计算宽高最大公约数比例，`:16-20`按frameSourceId选参考图，`:52-59`进入计划/报价前解析。
- 277:360换算960×1248像素；命名比例原路径、非支持模型的白名单继续保持。

## 真实发布验收

- Web/Worker 同源码、同镜像；Worker显式resume，unresolvedTicks=0，已有真实completed tick。
- 原creations Web/Worker与失败诊断候选均已正常退出，ExitCode0，restart=no。
- 本轮原始任务比较直接PASS：noMissingJobs=true、noOriginalSupplierMutation=true、unknownTables=[]、violations=[]。独立生命周期核销0条，没有把旧诊断发布的FAIL改写成PASS。
- 旧诊断发布原失败、回切和清理记录保留；本轮用新的当前基线独立验收。
- 公网版本/health/canvas200；生产277:360计划请求HTTP200，modelVersion150、billingVersion8，生成任务新增0，没有调用供应商生成。
- 本轮规划验证会按现有API保存报价，不代表真实付费出图验证；没有重复用户历史供应请求。
- 集中回归：比例139、分辨率46、后台诊断真实PG24、真实UI14场景、交付重试4故障通过；生产构建通过。
- 连续观察：176个切后抽样，状态{'200': 176}；只证明记录窗口内的采样，不外推所有请求。

## 2K RangeError 与本次功能修复分开

本次没有证明原RangeError根因已修。原图在独立helpers、同镜像Node、实际编译helpers及真实隔离HTTP链路均通过；现场恢复路径本就选择error，16笔当时都已重试5次。一个固定原任务已用原checkpoint成功交付并唯一结算12积分，其余历史卡单及原四项30分钟验收未核销。诊断栈帧和后台结构化原因已随本版上线，不能把本次比例修复等同于原故障闭环。

## 产物

`ratio-artifacts/MODIFIED_FILE/`、`DIFF_FILE.patch`、`VERIFICATION.txt`、`ROLLBACK.sh` 均已读取验证。回滚仅对标记过的独立副本实测，原代码恢复后277:360重新得到ADAPTER_RATIO_UNSUPPORTED；交付副本和线上保持修改态。

生产证据：`/opt/naumi-staging/evidence/release47-custom-ratio-20261027-r1/`。
本地证据：`E:/Workspace/naumi-2k-delivery-fix-20261027/output/2k-delivery-fix-20261027/release-ratio/`。
