# 2026-10-19 APIB图片能力对齐（配置已上线，程序缺口独立）

## 授权与结果
用户要求APIB与Geeknow能力直接对齐。本统一窗口17:06:11北京时间完成v121→v122，publication `6af8b164-99a9-4235-b89b-157a1755aa1f`，phase原值`applied`，digest `3dc556e5433ab25baf9934c6580b4760d0aae1d99a7cd34ebb735881d5b482b8`。

仅对两条已启用APIB flare/sunburst：18字段delta，参考图编辑1–6、透明背景、1K/2K/4K、蒙版协议配置及n≤4。原五档quality/12可执行比例保持，来源15比例×3分辨率表保留；不把当前route仍拒绝的9:21/3:1/1:3加回来。configuredHealthTargets仍不创建自动收费巡检。verified=false，采购价/客户售价、管理员最新权重优先级/模式、其余模型和billing v8均保持。能力来源为APIB关联APIMart公开契约，不冒充付费交付验证。

## 实际线上验收
持续持三锁（包括备份/CAS、PLAN/APPLY/VERIFY与真实公网plan），同一UUID、同一REQUEST；最终三锁释放。真实POST /api/imagegen/plan：gpt-image-2、edit、私有QA artwork 1张、medium、3:4、PNG，分别1K/2K/4K及1K透明，全部HTTP200/modelVersion122/billing8，两APIB ID均eligible；仅plan没有submit，supplier_calls0，未恢复收费验收/收费巡检。

Web/Worker实际source `5d7631a06cb3ca64b036641ba85eddf72fb5d3fa` / build1792383873 / Image9b43d564…、ID/StartedAt/restartPolicy、Nginx全文SHA、canonical revision144原始字节均不变。health200/db.ok=true。历史两未结事件独立保留。

## 边界与回退
当前5d蒙版规划仍排除APIB（MASK_BOUNDARY.json），本地runtime门禁补齐已测，未部署。17:09自然任务仍见任意比例658:877失败，无APIB调用；不可宣称全体用户恢复。参考图/高分辨率的公网plan成功，不是最终供应商出图成功。

最初PLAN发现billing原始JSON与validateBillingConfig的规范化JSON哈希不同；没有创建publication/REQUEST。保留r1原制品，r2工具仅修规范化比较，仍以HostTransaction原始billing行哈希CAS；使用独立/tmp制品目录、原UUID和原PLAN，不覆盖旧材料。中间锁冲突均flock -n退出，无抢占/杀进程。最终一次完整三锁事务通过。

隔离PG的版本化选择性ROLLBACK及重复调用通过，保留后续管理员weight/label/billing9；线上未触发回滚，新v122保持。失败/UNKNOWN应复用原UUID与REQUEST核对，已applied但VERIFY失败才选择性新publication逆转本批字段，不restore整个v121。

运维命令：scripts/ops/apib-edit-activation.ts PREPARE/PLAN/APPLY/VERIFY/ROLLBACK；host采用既有apib-activation47.py的副本，仅独立/tmp工具目录前缀改变，没有修改旧host脚本/程序。生产四阶段和HTTP证据在`/opt/naumi-staging/evidence/apib-alignment47-20261019`，本地私有`output/image-recovery47-20261019/apib-alignment/server`。

## Git与协作
独立codex/image-recovery47-20261019，基线origin/main2b9ce5ea；不覆盖共享checkout、不连接其他服务器。程序源/配置版本/publication分别报告。进度不依赖线程记忆。
