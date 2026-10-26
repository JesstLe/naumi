# 首次成图后原任务 404：项目归属一致性修复

## 已确认根因与基线

线上 `af22c6e5`：个人上传图片的新画布没有创作输出证明，受理时 `parentContext` 被清空；首张输出产生 proof 后，同项目读取上下文保留 tree parent，严格比较与已冻结 null 不符，读取返回 null 并映射 404。原图和原结算实际已经存在。诊断已在原源码、隔离 PostgreSQL、实际函数中复现。

本轮起点为 clean `503fae06ed72890c643ae2e7f774001ded9feeeb`。已刷新远端，未发现已提交的同缺陷修复；线上仍为 af22。继续使用本任务 worktree，不混入尚未完成整合的核心重构。

## 最小修复

- `bindActualCreationProject`：物理项目和账号归属核对成功后，个人图片、文字、视频画布统一保持项目 ID；首次产物出现不会再改变上下文。receipt 只读路径不新写 project binding，企业未知归属继续拒绝。
- `assertAcceptedImagegenCreationScope`：原严格匹配优先。仅对已存 personal/null-parent 请求，使用其冻结的画布 sourceNode／编辑目标及数据库中同 owner 的实际项目关联做精确兼容；拒绝其他项目、其他 owner、其他 tenant、损坏 scope 和没有锚点的请求。原 payload/scope 不重写。
- 单任务、批次的原回执、已接受请求快路和取消均使用该兼容；旧报价同样核对已存请求锚点，复用原报价而非重新定价。
- 原任务继续通过原 runParent 读取已完成 child、作品与结算，不提交供应商新生成。

## 验收与发布

集中回归覆盖：上传图片画布首次出图前后、原冻结空 parent 的已受理任务、只读receipt、真实父收尾、账务不变、原报价复用、批次、跨账号/项目/tenant拒绝，以及原并发通知模块回归。

执行证据、原始字节和副本回滚保存在 `output/imagegen-project-scope-fix-20261026/`。

本轮集中结果：原始五文件副本真实复现首出图后404（5检查、exit1），原函数正控仍通过；修改态真实PostgreSQL/HTTP 31检查通过，父任务实际读取原child收尾、creation succeeded、chargedCredits=6，原ledger/billing/payload不变、网络0；父通知原24回归全通过；最终TypeScript exit0。独立回滚副本恢复五文件原hash并再次复现原行为，修改态副本保留。

首轮fixture错用artwork尺寸列、无编辑输入的fixture格式错误均保留并仅修测试。旧scope VM缺staging-history mock（8项）及旧冻结报价PG过期报价预期409但实际200，已在原基线和修改态得到相同失败，属于既有测试契约漂移，未改产品迎合旧断言，未伪记全套PASS。

用户已明确要求修复后上线，沿用47直接切流授权。保持原 Web/Worker 未决工作记录和原数据，不伪造排空或回灌业务库；完整发布与尚待收尾状态分开记录。

## 10:03 实际上线与原结果交付

- 固定产品提交 `0641ce2e23c6ae5653c5a1d4c2da36782e0366c7`，BUILD_VERSION `1792979563`，Linux Image ID `sha256:707405bed1181c501aaf02821230d9b73b1ccbc4bac9f8c4fa68157771e4bfdf`。本机构建 exit0，传输归档hash和服务器导入身份相符。
- 三锁事务内完成可读数据库备份、23表任务保全快照、一个候选Web旁路就绪、现有登录/DB/画布/公开说明检查、旧新静态union、完整Nginx closure CAS及平滑reload。原任务/供应商绑定保全比较通过，violations与unknownTables均为空；外部Windows客户端HTTPS版本200核对通过（该外部探测显式关闭IP证书校验，未声称完成TLS链验收）。
- 新Web `naumi47-web-project-scope-20261026-r1`，容器 `712be923ee314f048ad5a74bda9a79c61f6526ff576fc461aa0dbafddbf2359b`，admission=open。旧Web保留running/draining，旧Worker保留paused/UNKNOWN。39条切换前UNKNOWN原行及原tick保持不变。
- 生命周期记为 `SWITCHED_CLEANUP_PENDING`（revision826），不是全链路同版/排空完成。新Web自调用原点为本容器loopback；原扫描Worker和媒体子服务仍为旧版，恢复supervisor暂缓重绑。未退役旧槽、未清UNKNOWN、未重放付费任务。
- 真实补交3对：青眉10/25两笔和石冬10/26同类scope漂移任务均从原GET读取进入既有父收尾，最终parent/creation succeeded、每笔原6积分、原child及payload/作品/账务/供应记录hash一致、生成POST0、新扣费0。三张原图HTTP200且完整解码；青眉主例SHA256仍为 `33214d37c91dba475cb33f8bc706b1857d164012eefa6e9cde80fe04c4e21459`。
- 回切材料保留原upstream并继续保留新旧static union；可执行远端 `ROLLBACK.sh` 已做两文件副本校验和dry检查，未在真实入口来回切换。程序回切不回灌数据库或取消已经成功交付。

## 独立待处理故障

最近一小时排查确认：旧Worker自10/24 15:10原tick UNKNOWN，且durable-image/recovery-dispatch-scan全局UNKNOWN阻断补扫；白枫另有任务级UNKNOWN。另有未领取排队、已上游完成但本地未交付、ECONNRESET未知结果等不同断点。它们已纳入同一47恢复协调，本次scope上线与三笔补交不被表述为这些故障已结案。保持原证据，后续需按精确扫描派生动作、领域租约及付费结果分别核销或恢复；不以删除UNKNOWN/伪填completed放行。
