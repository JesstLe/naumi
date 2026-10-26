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

执行证据、原始字节和副本回滚保存在 `output/imagegen-project-scope-fix-20261026/`。当前为实现中，运行结果与线上版本将在完成后追加；测试通过不等同已经部署。

本轮集中结果：原始五文件副本真实复现首出图后404（5检查、exit1），原函数正控仍通过；修改态真实PostgreSQL/HTTP 31检查通过，父任务实际读取原child收尾、creation succeeded、chargedCredits=6，原ledger/billing/payload不变、网络0；父通知原24回归全通过；最终TypeScript exit0。独立回滚副本恢复五文件原hash并再次复现原行为，修改态副本保留。

首轮fixture错用artwork尺寸列、无编辑输入的fixture格式错误均保留并仅修测试。旧scope VM缺staging-history mock（8项）及旧冻结报价PG过期报价预期409但实际200，已在原基线和修改态得到相同失败，属于既有测试契约漂移，未改产品迎合旧断言，未伪记全套PASS。

用户已明确要求修复后上线，沿用47直接切流授权。保持原 Web/Worker 未决工作记录和原数据，不伪造排空或回灌业务库；完整发布与尚待收尾状态分开记录。
