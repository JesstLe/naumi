# 103短维护baseline分层（2026-10-16）

`LiveAdapter.inventory`在现有完整docker/nginx/machine和逐baseline身份pin校验上，新增仅103且通过现有Oct16显式维护authorize的有限例外：仅允许systemd-unit-list/SERVICE_LIMIT_EXCEEDED及systemd-unit-cat或show/OBSERVATION_UNAVAILABLE。其他任何错误仍拒绝；47不使用例外。

原errors原样保留，另附baselineCoverage：coreComplete=true、systemdReferenceCoverage=partial、retainedSystemdErrors完整副本、retirementEvidence=false、taskDrainEvidence=false。catalog缺项不再被误作core身份缺项，也不被宣称为systemd引用完整或任务drain。collector本身、固定业务0614、生产均未修改。

集中验证：baseline session35OK(skip2)；新增7tests，与session集中共42OK(skip2)，Windows与Linux容器均通过。覆盖全部允许项、错误混入、47/授权错误、core不完整、baseline丢失/重复/image变化与pin竞态。
