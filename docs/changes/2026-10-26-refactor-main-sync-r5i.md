# R5I后三模块main普通整合（2026-10-26）

## 来源与计数
R5G、R5H、R5I已完成；独立分支codex/core-refactor-20261024，模块c1578088a6683db30e50b2ef2393cbbf90090dab。开工/合并前fetch origin/main=73384aaa5d1547de84586de437dc1375257225c8（此前整合368c93e2）。普通合并origin/main，不rebase/强推，不合回main、不部署；完成后模块计数归零。

## 三处冲突的实际整合
1. durable-image-jobs保留兼容壳；incoming pre-execution bindBackgroundClaim失败只释放本调用新租约的修复迁入image-jobs/runtime原执行点，不恢复巨型旧文件、不执行用户业务或清除UNKNOWN。
2. background-activity合并scope/action/finish净化诊断，并保留trackBackgroundWork/onSettled跨进程排空语义。finishActivity先确认主事务、历史cleanup失败只警告的main修复完整保留；真实完成写失败仍UNKNOWN。
3. legacy-creations保留TeamError窄owner与raw存储import，叠加main真实失败证据、原结果资产查询不依赖diagnostics；新增后台故障卡仅平台后台可见、企业视图不泄露供应商或原因详情。

原有重构各owner、原价/已受理/任务恢复/原对象字节保持。发布监控计划只整合代码，不安装或启动任何线上定时任务。

## 实际集中验证
- 原main缺陷在完整c157副本重现：cleanup-sql/cleanup-connect两例完成转UNKNOWN；合并后8组真实PG通过，正常结果/会话保留，关键写失败和action失败仍UNKNOWN，cleanup上限100及活跃/UNKNOWN/Agent保护不变。
- 后台失败证据38真实PG、真实组件1440/390控件19通过；新旧创作记录、同owner/tenant精确子任务、403未知不伪装quota、空页/失败503、媒体原查询及企业私有投影保持。
- 父子回执25（新增bind失败不执行业务/只释放own lease）、项目素材33、只读异常unit15/Python14通过。
- 合并后再次真实Linux图片Worker71、Next15.5.27六入口20通过，原6/current17和consume11/66保持；Worker2350输入/HTTP route0。emitted静态/全导入SCC仍0，全项目tsc通过；lint原3warning保留。
- 本任务独立node_modules链路先后被外部清理两次；现按本分支lockfile npm ci创建自有依赖（Next15.5.27/sharp0.34.5/esbuild0.28.1），不改其他工作树，安装/原失败记录保留。

## 交付与未完成
完整c157基线4380文件已归档；本次main整合独立四产物、副本回滚/恢复后缺陷重现、最终源码绑定/双parent提交/远端/清理以output/refactor-r5i-20261026/main-sync/VERIFICATION.txt与DELIVERY.json为准。R5I模块前144路径材料是单独固定c157证据，不把它冒充合并后源码。

整体重构继续：外围Canvas组合/多tab-CAS、同SHA完整产品/R6/CI/benchmark/性能容量与最终交付；本轮不是整个项目完成。

收尾再次fetch发现origin/main已推进到`b15d4761b938428c449531e2d8744401a38a2ec7`（原结果父回执与postaccept原因修复）。当前已完成并验证的普通整合来源固定`73384aaa`；新增提交另列下一轮待整合，不冒充已包含，不开启发布。
