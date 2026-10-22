# 共享 scratch 的媒体 Worker 退休缓存（2026-10-23）

## 问题与真实本机复现

combined→combined 交接时，新旧媒体 Worker 使用同一 scratch。新进程启动恢复旧终态 worker-state 到内存 Map；旧 App 随后向旧 Worker PATCH 完成输出确认，写 .retired 回执、删除任务目录，并只删除旧进程的 Map。新进程没有跨进程缓存失效；health 的 terminal 仍包含已退休任务，达到 8 时 App 与 Worker 都拒绝新任务。既有定时 collector 只枚举仍存在的目录和删除过期回执，无法纠正已删目录的缓存。

修前运行 verify-media-shared-retirement.mjs --reproduce：两个真实 Node Worker 同时恢复 8 个非 inspection 终态。旧 Worker PATCH 清理后，新 health 仍 terminal=8，旧任务 GET 返回过期 200，新 UUID POST 返回 429/MEDIA_QUEUE_FULL。本机可复现，不声明线上发生；47 前序首次启用媒体 Worker 的旧槽没有媒体组件，该边界是本次 SaaS 后续 combined→combined 交接风险。

## 最小实现

- retiredState 严格验证匹配 UUID、合法终态、规范 ISO 过去时间、普通文件和大小上限。拒绝目录、symlink、错误字段和异常回执；以 lstat、带 O_NOFOLLOW（系统支持时）的文件句柄及 inode/dev 校验读取，最多读取 1025 字节。退休根目录也须为真实目录。
- 启动恢复跳过有有效退休回执的任务；HTTP health/GET、POST 容量判断和真实周期 collector 同步本地缓存。
- reconcile 仅删除本地已终态且 engine 不活跃的 Map 项，不删除共享目录、输出或回执，不将“目录缺失”推断为已确认，也不触碰 queued/processing。未确认产物仍保留并计入容量。
- 已退休 GET/POST 返回 410，不重新暴露缓存结果或重建任务。既有 App 主动 PATCH 的共享目录清理行为保留。

不改供应商、计费、DB、媒体程序、发布控制或源码 metadata；不重放已接受任务。

## 集中验证

证据目录 output/saas-admin-20261022/verification（忽略目录）：

| 证据 | 结果与限制 |
| --- | --- |
| media-shared-retirement-before.log | 修前两真实 Worker/HTTP/共享文件复现 stale terminal=8、新任务429；非线上证据 |
| media-shared-retirement-after.log | 7个真实 Node Worker（包含重启），38断言。8终态旧PATCH→新health0/旧GET非200/新POST202；有效退休410、启动/重启、未确认保留、缺目录保留、错误UUID/非终态/坏时间/未来时间/目录/symlink/超长回执拒绝、queued/processing保留均通过。symlink真实创建并通过负例 |
| 同上真实collector周期 | 等待实际60000ms定时器，期间无health/GET驱动。通过过期回执被collector删除后terminal仍0，证明collector先失效本地Map；非inspection共享目录保持存在 |
| combined-worker-post-retirement.log | 原 combined Worker 生命周期fixture 91断言通过；该脚本 real_processes=0，不替代本次真实进程证据 |
| types-media-retirement.log | 正式 tsc --noEmit --pretty false 退出0 |

本次跨进程测试在Windows执行，操作真实Node、loopback HTTP和文件。fixture engine 的 hold 控制只在测试入口注入，不进入生产worker；未调用外部供应商、数据库或原生媒体程序，不证明Linux sandbox/FFmpeg隔离。Windows fixture进程以SIGTERM终止，不将其当Linux优雅退出证明。定时器使用真实60秒，无虚拟时钟。

## 尚未完成与同步

最终固定Linux镜像须重新构建并验收：本修复后的双Worker共享scratch脚本（约61秒）可在Linux执行，及根任务真实Web/Worker/native联合回归。当前a48构建产物不是含此修复的最终候选，不上线。47实际旁路、三锁切流、旧槽排空与停止、受控维护恢复均由根任务负责，本文件不是发布回执。

本次是整合验收纠错，功能同步计数仍0；源基线a48e201f。只保存本任务source/test/docs，不改reference-media.ts、ops或公开更新说明。
