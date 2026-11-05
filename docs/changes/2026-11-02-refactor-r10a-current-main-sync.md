# R10A：R9Z 封版后的最新 main 普通整合

## 原因与范围

R9Z 完成本机固定镜像96检查、真实经典Go／PG业务页面、四产物及副本回滚后，推送前fetch发现main由67bbcddf推进到`ca63c76fa0f8c87ae404ad500ca65f71b064e62e`。原推送未执行；独立分支在`b8c17dcac152a932ca0ce0ca2c28cb666c099a0c`上普通merge，不变更main，不重复开发同事工作。

incoming仅四文件：`docs/changes/2026-11-01-release-row-preservation.md`、`docs/changes/2026-11-01-release47-main.md`、`scripts/ops/release47_row_fingerprints.py`、其对应测试。四者原始字节与固定main blob一致。保留主线对已执行47发布的取证记录；该记录不是本线程执行发布，也不解除本重构候选的暂缓部署决定。

## 模块与数据归属

新增工具属于发布取证，不拥有生成、钱包、任务恢复或业务表写入。按原模块接口采集有界、repeatable-read / read-only逐行指纹，输出哈希及计数；不能把业务行变化、采集不完整或UNKNOWN解释为排空完成。本次只整合并验证现有代码，不执行远程采集，不调用其生产发布／退役能力，不替换原任务身份。

## 集中验证与证据边界

证据目录`output/refactor-r10a-20261102/`，完整原始基线为R9Z最终5389文件快照。

- BASELINE：原task-snapshot unittest共22，**21通过、1跳过**，exit0。
- MODIFIED：同一原命令仍22（21通过／1跳过）；新增row-fingerprints共28（**20通过、8跳过**），均exit0。总计41个实际通过／9跳过，未将opt-in真实PG或Docker检查改记为通过。
- 原2149产品文件、1737既有scripts文件及5105编译器输入／配置与R9Z逐字节相同。本次没有再次构建产品或冒充新merge源执行了96浏览器；原实际运行绑定保留在R9Z，固定完整镜像源仍61ef。
- 全量源码归档、原始二进制patch、完整首写前hashguard副本回滚、原22项恢复行为及后续编辑零写，最终数字和命令归本轮VERIFICATION／DELIVERY。

## 当前状态与下一步

整体重构ACTIVE，候选未合main，本线程部署0。R9Z的同任务浏览器离线维度已实测；供应明确未受理与客户账务、真实供应丢响应、对象PUT故障等剩余矩阵及语义耦合审阅继续，当前固定head CI仍需实际完成。

**分支超过48小时**：整体退出证据及有效同源CI未闭合；继续普通主线整合，不以本次main合入候选代替候选合main。最终源码／父提交以COMMIT_BINDING为准；R9Z四产物保持原source不覆写，本轮四产物交付最终整合快照。
