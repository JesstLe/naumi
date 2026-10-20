# 47 发布：分辨率回退与原报价保持

用户要求先上线已完成版本，再继续全通道兼容优化。独立分支 codex/release47-resolution-20261020，基线 f2dd8026；共享 checkout 的未提交内容保持。

## 范围

- 保留原选档与原报价，按合格通道实际支持档生成；恢复只查询原任务。
- 包含已完成 Seedream preflight/catalog 源码，不自动启用禁用配置。
- 发布阻塞修正：原生分辨率元数据缺失不等于明确不支持；plan/executor 保持旧通道执行路径，不虚构原生4K。显式映射继续严格校验。
- 发布策略仅增加用户本次原文授权，日期/CAS/三锁/历史事件/排空条件不变。
- 后续质量/比例/产物尺寸兼容审计暂停，未当作本次已完成内容。

## 发布记录

2026-10-20 12:44 北京时间只读：47 当前5d7631a0/build1792383873，canonical revision144；上次常规发布r2 COMPLETE，历史排空不完整和一笔冻结付费事件保留。7运行容器；MemAvailable4419700 KiB，根可用12072292352字节。Web于12:17已重启，发布使用实际StartedAt新基线，不套用旧manifest时间。

尚未构建本次最终镜像，未持生产锁/创建候选/切流。阶段与确切证据持续写入 output/release47-resolution-20261020。

## 实际发布完成（覆盖上述准备阶段）

- 用户先要求30分钟优先切换，随后明确批准“保留并隔离旧任务，继续切换”；43笔旧boot生图任务仅转needs_attention，原paidOperations/回执/payload/lease/billing保留，无重提、无结算或退款。48条旧进程观测记为owner-terminated:quarantined-domain-unresolved，不代表供应商任务完成；原记录完整备份。旧Worker一个未知扫描tick原样保留，不造completed，新Worker独立接管。
- 固定程序56aa32336cfdd5ec37a133d02db67d25806c3a21 / build1792471620，Web及Worker同image sha256:38e64646c4d68850ec4791a2708553ebf753602f9dedda7a16b9034d20e49078；91/91页面Linux完整构建exit0。程序main/任务分支已普通推送，不改共享checkout。
- 首次导入后空间较10GiB少约122MiB，完整校验并无损压缩已关闭access.log.1，解压SHA相同，未清DB/media/备份/当前与两版镜像。原操作UUID保留。OCI archive config摘要与Docker清单Image ID不同，按实际根层/source/build/hash重新绑定，不伪造相同。
- 初次切流后关联调用1047条超过默认1000快照上限，检查器保守回切旧入口，旧Worker未知tick阻止resume，原事务留PENDING_RECONCILIATION。没有把中间切流当最终成功。用户再次明确“给我换回新版本”后，使用原可读备份pg_restore --file=-仅导出COPY（无DB恢复），对全表4649条调用逐ID核验所有保护字段一致，仅2行last_observed_at/updated_at推进。结合原其他表快照无missing/binding/frozen变化，补齐完整证据，恢复同候选。后续工具默认行上限5000且前后保持同上限。
- 2026-10-20北京时间13:23:23事务COMPLETE，旧Web/Worker均停止restart=no；仅一个新Web+同镜像独立Worker，共7运行容器。三锁释放；recovery timer active，新Worker最终tick完成且未暂停，无未知tick。
- 旧build两个浏览器文档跨切流保留、17旧chunks HTTP200、5类原登录API及一次真实文字节点保存/读取/删除通过；新版旁路及公网1280/390无pageerror，真实POST plan1K6积分/4K12积分，未submit。连续3888次观测全部200，但包含中间切回旧入口，不能等同于全程新版。
- 模型配置v123/digest b2a69093...、billing8保持；禁用Seedream未自动启用；本轮供应商生成调用0。可读备份、反向网关CAS/旧镜像材料检查通过；未知旧Worker回退须新建同旧镜像的冷Worker，不能resume未知tick。该冷回退完整生产演练未做。
- 新43笔待核对+旧scanner未知回执与原历史两事件继续明确未结，不记成用户功能已恢复。全通道质量/比例/产物兼容后续开发尚未完成。

最终证据：output/release47-resolution-20261020/FINAL_STATUS.json、FINAL_RECEIPT.log、CONTINUITY_RESULT.json、VERIFICATION.txt。host工具修订提交与运行程序SHA分开报告，后续文档/运维提交不再次构建程序。
