# R5M 后第三模块普通 main 同步

日期：2026-10-26。工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。

## 固定版本与整合

同步前完整基线 `0bb21cfb4155a5a4b8f600ae656719e0a1c64d3c`（R5M已提交推送），4419原文件hash和完整归档。合并前fetch，固定main `d460e61f86b509abc5edaffe40a4ff6318dc64ce`；新增b3103a4d文档与d460e61f原完成结果核对/缺失位置补齐。普通双parent合并，不rebase、不合回main、不部署。

Git自动合并无冲突；人工核对保留 `@/platform/db/pool` 真owner，未恢复旧db owner或任务调度。completed-parent-receipt除import归属外，全部非import AST正文与incoming精确一致：默认仍只收pending/running，显式repairTerminalReceipt才处理已结算error/done；仅精确legacy ratio错误转警告，透明/取消/未知收费等不放宽。done父只修正原creation投影，不改原父snapshot和账务。

## 最小整合适配

- 固定b15专用维护runner继续锁定旧source/webpack module IDs，不能拿它在新镜像随意运行。仅给receipt加载器添加Pool路径同实例alias，保留旧`../db`兼容；无新运行入口，不执行生产repair。
- runner verifier不再依赖ignored目录遗失的legacy-ratio.cjs；使用实际output-advisory转译，输出目录自建且可指定；VM中旧部署module ID为显式bindings，不冒充实际Next bundle。
- incoming runner的`module`局部变量触发项目Next lint，第一次exit1日志保留；改名moduleBox，VM CommonJS语义保持，runner隔离PG复验通过。
- 完整源码入口测试新增13检查覆盖显式terminal、原done投影、legacy比例、透明与取消负例；实际Pool/creation/media/账务实现，不以VM原语替代真实装配。

## 集中验证

| 项目 | 实际结果 |
|---|---|
| 原始primitive→整合primitive | 29→35，真实PG/像素，原child/billing/ledger/UNKNOWN保持，无新生成/收费 |
| 完整源码实际active/notify入口 | 24→37，真实PG/原PNG/实际creation writer，原6积分、原UNKNOWN逐字保持 |
| 纯placement | 23，已有坐标不动、右侧布局、碰撞避免、幂等 |
| 实际维护runner源码VM＋PG | terminal/fsync前像/右侧位置/幂等/副本行回滚通过；不是生产执行 |
| 助手相邻owner | 15类55检查通过，R5M行为保持 |
| 全项目TypeScript | exit0 |
| 7个本轮源码/脚本lint | 修正incoming命名后exit0 |
| 结构 | emitted静态及全部literal导入SCC仍0；receipt非import正文等于incoming，4415原非目标文件精确保持（文档更新前计数） |

没有重新跑全产品build/外部供应商/真实Next整包；此次新增生产行为为显式维护选项，真实入口与PG已定向覆盖。R5M控件结果单独绑定其模块源码，不冒充main整合后的生产上线验证。

## 回滚、交付与继续

`output/refactor-r5m-main-sync-20261026/`保存独立完整基线与modified副本、四产物、manifest、patch重放与旧primitive/完整入口恢复结果，全部4419原hash恢复；真实工作树保留整合后新版。最终提交双parent、push与远端核对、fixture清理见DELIVERY.json。

R5K/R5L/R5M三模块同步计数归零。整体目标active，后续继续Canvas外围组合、多tab/CAS和R6完整候选/同SHA CI/benchmark债务及性能容量，不合回main、不部署。
