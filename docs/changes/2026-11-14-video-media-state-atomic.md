# 媒体状态原子替换：瞬时原生文件竞争

## 模块与职责

媒体Worker状态持久化属于 `services/media-worker/state-store.mjs`。本切片只处理唯一临时快照替换原状态文件时的瞬时原生文件竞争，不修改视频编译、媒体解码、HTTP路由、引擎执行、供应商提交或账务。

## 根因与边界

完整视频编译App集中运行曾在素材真实解析处遇到VIDEO_INPUT_RESOLUTION_FAILED，媒体日志包含rename EPERM，另有结果重试MEDIA_STATE_WRITE_FAILED。原基线也出现同样故障。原state-store写入唯一临时文件后只尝试一次rename；瞬时deny-delete共享会直接使processing状态提交失败，引擎尚未执行就返回MEDIA_STATE_WRITE_FAILED。

除控制故障测试外，本次用独立Windows PowerShell/.NET FileStream持有真实目标文件，FileShare.ReadWrite但不给Delete，140ms后释放。未mock任何文件操作，原基线实际rename返回EPERM且原状态停在queued；修改版相同原生竞争下多次rename后变processing，原子性保持。该实验证明此类瞬时共享竞争可触发原故障；并不追溯断言既往每一条EPERM都来自同一个持锁进程。

## 实现与接口

`createMediaStateStore`接口和磁盘格式不变。atomicJson仅在rename处重试同一个已写入临时文件：等待10/25/50/100/200ms，最多六次尝试；EBUSY适用于原生竞争，Windows额外处理EPERM/EACCES。其他平台权限错误、写入错误、EIO/ENOENT不重试。持续失败保留原错误、原状态与最小诊断，并清理临时文件；没有unlink原快照、非原子覆写或无限重试。

重试位于原状态归属模块内部，不重跑引擎，不重发付费任务；queued持久化先于受理、terminal提交与GET/PATCH共享原job锁、退休回执与清理顺序沿用原实现。永久存储失败时原有已知结果内存保留行为未改变，不把此切片称为磁盘故障恢复的完整重构。

## 验证命令、结果与证据层级

证据目录 `E:/Workspace/naumi/output/video-compiler-media-state-20261114`，完整命令/输入/literal输出/exit/哈希见VERIFICATION.txt。

- verify-media-native-share.mjs：真实Windows无mock deny-delete140ms，基线一次EPERM/queued，修改版五次尝试/processing。
- verify-media-atomic-replace.mjs：15项实际文件与受控native fault，Windows EPERM/EACCES、EBUSY持续失败保留原错误、Linux权限错误/写入错误/EIO/ENOENT不重试、同临时快照与原状态完整、无残留；独立HTTP Worker每阶段前两次rename故障，最终原结果、引擎一次、重启恢复/原回执/退休不重放。
- 原媒体状态生命周期4案例34检查（基线/修改版）；共享退休9进程51断言、真实60秒collector通过。
- Linux隔离容器内真实C launcher/FFmpeg/HTTP40检查：抽帧/裁剪哈希、幂等、drain、进度后取消、SIGTERM回收、重启回执、退休与原素材保持。固定已有镜像仅提供运行环境，当前源码只读挂载，无DB/供应商/业务媒体/公开端口。
- 集中完整视频App、完整tsc和修改包副本/回滚以最终证据为准。原错误与驱动错误日志保留：Windows直接调用Linux专用测试触发platform断言后改在真实Linux运行；初次新脚本await语法和WindowsSIGTERM退出码驱动问题修正，不更改产品语义。

## 未完成项与下一步

本模块仅消除已复现的瞬时文件竞争失败路径；持续磁盘故障仍明确保留原行为。不是完整Next/独立应用Worker重启、全局新任务旧能力门禁退出、RFC A01-A19或真实付费供应商验收。生产配置/付费/部署均0。绑定迁移已合main018836a2，生产绑定仍未自动迁移；总目标ACTIVE，47HOLD、103隔离实验线和共享checkout保持。
