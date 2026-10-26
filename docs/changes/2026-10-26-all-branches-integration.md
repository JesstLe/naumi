# 2026-10-26 最新非重构分支整合

## 任务与基线

用户先要求合并全部最新代码，随后明确“重构分支不合并”。本次只整合已提交的非重构业务；不部署，不启动巡检定时器，不修改线上任务或配置。

- 原 main：`905c8c635e41ff3f4443d43db9776d1db3aab469`。
- 独立工作树：`E:/Workspace/naumi-all-branches-20261026`。
- 最终整合分支：`codex/all-branches-no-refactor-20261026`。
- 纠正前的本地重构试合未推送；已中止未完成 merge，从原 main 重新建立本分支。它不属于最终交付祖先。
- 共享主目录 18 项未提交 UI 改动保持；其他工作树的未提交内容不代提交、不搬入。

## 纳入的固定分支

| 分支 | 固定 tip | 内容 |
|---|---|---|
| canvas-model-pricing-fix-20261024 | `cac12db8357eb481be461b9cfbf6f9c411489a00` | 供应商家族报价、品质回退、原结果续交付、父回执完成、首张输出后项目归属 |
| server-stability-performance-20261024 | `74c5ca296092a78908310160bacb54d0f2945cfb` | 清理查询、设置批读、视频协调连接与 busy 恢复 |
| benchmark-run-20261023 | `7b45c4c2dabfa758cff44bfb285557ec42aa8403` | 冻结原报价测试与当前服务端合同对齐 |
| quality-fallback-20261024 | `d289d2045d4a7b9160ea46e50cdeb65e0aeba581` | 已含质量修复，补齐架构现状与护栏审计文档；不携带重构实现 |
| admin-anomaly-watch-20261026 | `b1a0c5dff8fbd85acb982f94e416d0bffb504f4e` | 只读异常采集与 benchmark、扫描存活性、列表/详情状态一致性 |

五次普通 merge 均自动成功。重点共享文件 `durable-image-jobs.ts` 同时保留原结果 checkpoint/父唤醒与新扫描身份/singleflight，不改任务级 UNKNOWN 或已受理付费身份。

## 明确排除与已含内容

- 按用户要求排除 `core-refactor-20261024`（`4e568622…`）及 `modular-refactor-20261024`（`e9c0a21b…`），包括它们的后续未提交工作；不从这些分支另挑重构或抠图实现。
- 四条 T3 分支 benchmark-case-evidence、supplier-quota-health、verify-original-image-continuation、video-capability-upgrade 均通过 `git cherry` 证实补丁等价已在原 main。
- 专用 rollback compatibility、历史 backup 与纯 baseline 分支保留，不将旧版本恢复为当前业务。
- 初始盘点 438 refs，完整 SHA、分类和工作树保护指纹在 `output/all-branches-20261026/`。完成前再次 fetch 并复核。

## 验证进展

原 main 基线：捕获 benchmark 11/11，完整 TypeScript exit 0。原始 Git tree 和 tar SHA 已固定。

本轮有效结果：29 个验证入口中 28 个通过，1 个已在原 main 复现的旧契约失败保持。完整 TypeScript exit 0；真实本地 PostgreSQL 与零外部请求的 UI fixture 已运行。重点结果：

- 捕获/异常 benchmark 21 tests、Worker 23 tests、报价路由35组、报价目录22组、品质UI 10组。
- 原结果恢复11组/142检查、父任务收尾24组；真实PG续交18项、父通知19项、项目归属31项。
- 只读异常修复12项、SaaS账号/企业/历史/媒体读取回归通过；原任务UNKNOWN保持，供应商重投0。
- 设置批读78组、配置缓存14组、视频锁池9组、busy恢复12断言、清理PG24组；不是线上容量验收。
- 定价四模块通过：core真实余额/单次扣费，Agent58检查，image25组/74检查，Workbench13组。

首轮失败完整保留：缺三组历史 before 文件、缺隔离fixture secret/指定DB名，以及旧图片测试mock遗漏 currentWorkspaceRevision。补齐实际Git原字节和fixture输入后定向7入口全部通过；代码仅修改该测试mock，原业务断言没有改变。合并分支原有一处测试尾随空白另作清理。

旧 `verify-imagegen-frozen-quote-pg.ts` 默认模式仍在取消断言报 `400 !== 409`。原905c8c完整归档、副本独立CWD和原脚本得到相同exit1；`--simplify`通过，但其异步fixture收尾有“pool after end”诊断，日志保留。默认模式后续未执行的矩阵不记通过，不为变绿恢复产品的旧拒绝逻辑。

首轮完整构建因共享node_modules缺少Geist字体文件失败（非TS或应用编译错误）；不修改共享依赖，改用本任务全新构建副本、原package-lock独立npm ci。独立 npm ci exit0；同4040份tracked输入的完整 Next15.5.27 build exit0（106.777s），产品/scripts hash逐份保持。原Hook/img lint提示保留；这是本机构建，不是Linux镜像或部署验收。副本回滚和推送结果待下文更新。

既有历史观察项继续OPEN，不用Git合并或本地通过宣称线上问题全部已修复；巡检计划仍未启用。
