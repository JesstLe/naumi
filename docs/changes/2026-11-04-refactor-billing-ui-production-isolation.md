# 9fe Verify：账单 UI 与业务 UI 的封版构建隔离

## 原 CI 与可核验原因

PR #8 Verify run41694243514/job126120462131：通知 head9fe89090，实际 checkout1e8fd283。真实 production capture/seal 均 PASS，buildId4Ve0KtNmhH7I_QxqhCu3r、Linux embedded。账单 UI 先通过，随后 business runner 在 prepareOwnedModelUiProduction 的完整 tree 比较处抛 `MODEL_UI_BUILD_ARTIFACT_MISMATCH`，尚无 production/check 字段，页面检查未启动。不能把 PG 的刻意错误注入日志或未发生的浏览器超时当作本次根因。

原 ZIP artifact13261500255（2520711字节）SHA256为5afc033363ebb53312e20402c60dd49c550578ef66221009a5dd058b4a79ccb2。原RUN/BUILD/INPUT、运行日志与元数据保存在 output/pr8-checks-9fe89090-verify-audit-20261104，不重跑原 CI 或覆盖前阶段。

原 billing runner 将 .next/static 与 public 直接 cp 到已 seal 的 .next/standalone，然后启动该原树。CI seal 中 standalone3443、static530、public147；standalone 内 static0、public4。按原代码与原 manifest 的确定性投影，新增673路径（530static+143public），既有行无变化；这不是已上传的真实 post-billing aftertree。完整 afterdiff、是否另有 mode/content/cache 变化仍 UNKNOWN。

## 实现与职责

只修验证执行链，不改产品、价格或服务端规则：

- billing production 分支复用真实 sourceIdentity 与 prepareOwnedModelUiProduction，在唯一 output/billing-20261003/runs/<id>/production 组装运行副本，保存该 run 的 PRODUCTION.json。
- 默认启动入口为该 owned production.server，不再写入或启动原 sealed standalone；沿用已封存 public/config environment。原 external 不启动本地服务、development 启动原 dev 命令的分支保持。
- production helper 只有适用范围头注释更新，source/build/dependency/public/environment/full tree guard 均保留，没有忽略新增文件、重新 seal 污染树或绕过漂移检查。
- 新正式 case billing-ui-production-isolation 进入既有目录及 evidence routing；CI 上传 billing run 的 PRODUCTION.json。目录248→249，不等于249全跑。

## 回归分层

新增 oracle 从待核源码 AST 抽取真实 billing 准备语句（直到 schema 数据库边界），并执行真实 env/server 选择。PG/provider 未执行；最小 embedded next/pg 是声明依赖 fixture，随后两个真实最小本机 HTTP 子服务核验各自 owned 的 health/static/public、关闭端口。真实 helper 创建第二套业务副本，完整源码 raw/modes、seal/artifact bytes/size/modes保持；copy 无 write-through；受控根漂移仍在 copy 前被原 guard 拒绝。受控负向写入均标注并恢复，不把整个测试说成零写。

当前aaa80dc8完整5709源码先封存。原前缀受控基线在 business-prepare-after-billing 精确复现 MODEL_UI_BUILD_ARTIFACT_MISMATCH/exit1；修改版46检查/两个真实最小HTTP child PASS/exit0；原 production owner65检查、framework33场景441检查通过。首次 oracle 的生成源码换行转义错误保留为测试 setup error，修正后才登记 confirmed baseline/modified，不拿任意exit1充当原失败复现。

另在独立全量源码 runtime fixture 上执行一次真实构建、封存及原 billing→business UI 顺序验收；实际命令与结果以本轮 FULL_COMMANDS/FULL_PAIR_RESULT 和最终桥为准。该副本使用独立 fixture Git身份与显式 Windows locked-external依赖，不冒称当前PR head构建或Linux embedded CI。物理5709原始文件均复制；fixture Git尊重ignore的26个历史audit/output文件另以完整raw桥复核，不把sourceIdentity自身遗漏项静默当作已覆盖。

真实全量副本本轮一次 build/capture/seal exit0，buildId PI0LbrgDP8WtcfP1n48tF。原账单16个Playwright测试全部PASS，随后原business Next/PG/pinned Go Router验收PASS（真实发布应用、价格75、catalog/Canvas/mobile/nonadmin404）；原树在两套服务后重读完整artifact bytes/size/modes仍与seal一致。一次activation、generationRequests0，五端口关闭，业务schema无残留，自有PG容器按ID/name/label核验后移除。构建中的Windows tracing EPERM警告与locked-external模式保留，不冒称embedded。fixture Git身份96b35135、5683个sourceIdentity文件/3434个build inputs与外层5709完整物理raw桥分别记录；26个被ignore的历史audit/output文件未丢失，不是产品源遗漏。该派生构建不重新贴为最终PR commit构建。

## 保留与下一步

最终候选只包含本切片测试/文档路径。四产物 MODIFIED_FILE.tar、DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh 归 output/pr8-verify-9fe-production-isolation-20261104；基线hash/mode、patch独立重放、另一副本回滚与三相原样输出以该目录为准。原共享源码与上一generation四产物不变，当前候选保持修改。

本轮明确区分受控前缀/最小HTTP、完整本机Next/PG/Router、最终SHA正式selected、新头CI、main整合与部署。wholeRefactor=ACTIVE，mainMerged=false，deployed=false，47 HOLD；最终新头CI独立等待，不轮询/重跑。
