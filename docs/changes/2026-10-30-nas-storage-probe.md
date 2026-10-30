# NAS存储验收器按实际落点验证

## 模块与职责
`scripts/ops/nas47_storage_acceptance.cjs`只负责发布验收的随机小作品上传、对象/HTTP/Range/下载/权限回读及精确清理；不改变产品存储、媒体质量、落盘策略或供应商执行。测试脚本 `verify_nas47_storage_probe.cjs` 执行原验收器全文，真实Sharp/本地文件，HTTP/SQL/对象传输为fixture。

## 确定根因与修复
`writeStoredObject`在NAUMI_NAS_DEFER_UPLOAD=1下仍会按媒体文件系统余量决定是否local-first；低于4GiB加对象大小时合法remote-first。原probe误把flag当每对象落盘保证，未看remote_ready，原/新运行源码此函数体完全相同。默认MEDIA_DIR也由误用`/data/media`改为产品相同的`./data/media`解析。
父修按每asset已存remote_ready和实际文件验证：pending必须有正确本地SHA；remote-ready允许本地缺省，但远端GET必须匹配size/SHA。仅本次pending fixture keys进入有界排队等待；全部远端完成时不声称队列验收。HTTP/Range206/download字节、匿名401和精确删除保持；清理失败也在内层finally关闭PG池。

## 集中验证
原probe9场景6项未满足exit1，父修9/9exit0。覆盖remote-first低空间、本地pending、原图/变体混合、已送达且有缓存、无defer、缺本地、坏本地、坏远端和默认目录。6项是断言，不是6个生产缺陷；坏本地/远端仍拒绝。首次fixture漏拦node:fs及漏注fetch的准备错误保留，修测试接线后再比原/改，未算产品缺陷。
独立诊断7项实际storage/object-adapter/Sharp/local文件也通过；仅statfs/远端传输为fixture，不冒称真实NAS。

## 2026-10-30真实47有限验收
持三锁，仅使用现运行b79c8c39的原账号和一个随机48×64 PNG，运行镜像/版本未变。实际媒体目录`/data/media`可用4,201,209,856 bytes，低于4GiB，deferFlag=true；原图与两个变体均remote-ready、localCopies0、pending0。
真实上传、NAS直接GET三对象size/SHA、HTTP原图、Range206、下载原字节、匿名401全部通过，probe exit0、stderr为空、verificationDataCleaned=true。`deferredQueueVerified=false`如实表示本轮没有走队列，不凑成功。三锁释放，供应商生成请求0，不重发既有任务、不回灌DB/媒体。
线上证据：`output/capacity-audit-wave2-20261029/storage-probe-fix-20261030/RESULT.json`、`ONLINE.stdout`、`ONLINE.stderr`。原DURABLE_LOCAL_BYTES验证阻断已定位并关闭；不能从这个小图推断所有媒体规格、队列或容量通过。

## 四产物与未完成项
原/改/独立副本回滚完整证据与四产物在上述storage-probe-fix目录；主源码留修复。47旧Web两条UNKNOWN及完整快照闭包性能是其他项，本记录不将其关闭。无本次业务程序发布，不增加发布计数。
