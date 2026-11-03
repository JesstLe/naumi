# 用户用量查询性能与加载优化（2026-11-02）

## 模块与职责

后台企业经营概览/平台用户用量统计。职责是从真实历史任务、作品、账本与模型调用形成统计，不推算员工绩效或等待耗时。本轮不变更计费、供应商、任务状态、企业层级或历史归属。

- 开发基线：`d75a9d7ee3d748418a866ff1717b7c410a6aa4aa`，独立任务分支。
- 47实际读取基线：`67bbcddfe056a51739d5d5b954d9fb05c55e0479` / `1793544987`，相关源文件与开发基线相同。
- 模型映射103隔离线未合入、未操作。

## 根因与实现

1. `usage-repository.ts` 的旧历史父子去重先按owner匹配候选父/子，再重复展开children。真实47计划9,729父、11,354候选子产生3,885,454次`jsonb_each`，该段10,441ms，约占全查询89%。
2. 新增`legacy_parent_edges AS MATERIALIZED`，先将每个父children展开为`(email,child_id)`一次性关系，再按owner和child ID精确匹配。保留跨日期父子去重、creation精确关系、foreign-owner隔离、未知来源和账务语义，不读取generate payload、不加日期下界漏算。
3. `UserUsage`以endpoint+完整筛选键绑定结果；同范围刷新保留已有结果，改筛选隐藏旧结果并中止旧请求，过期返回不覆盖。读取helper提供30秒请求与响应体期限，401/403/404立即清除已显示结果，卸载/结束释放请求，不新增跨账号持久缓存。
4. 企业壳的用户用量组件按账号+权限scope绑定；刷新revision作为prop而非强制remount。专用经营概览不再额外请求未使用的saas-overview，设置页和共享概览仍按需读取。

## 公共接口、事务与权限

API契约和统计口径保持。`readUserUsage(tx,query,scope)`继续使用调用方同一个事务，不借新连接，不初始化schema。

授权共享锁原样保持：`scope`及`requireTeamGrant`的`FOR SHARE`与撤权/成员更新排序配对。本轮以更快SQL缩短持锁窗口，没有把分析读改成无锁旧快照、没有放松权限。UI中止仅结束读取，不是任务取消或退款。

## 验证进度

- 真实隔离PG原13项语义通过，修改态含放大样本14项通过。
- 新增单高活跃账号1600父/1601子偏斜回归：baseline `JSON_EACH_LOOPS=2561600` / REPRODUCED exit1；modified `JSON_EACH_LOOPS=1600` / PASS exit0。两个完整语义结果文件相等。
- API鉴权/同事务8项通过。
- TypeScript `--noEmit --incremental false` exit0。
- 真实UserUsage组件16项、真实EnterpriseConsole父effect 5项通过；HTTP/身份/子面板为显式fixture，不冒充完整Next或线上浏览器。
- 源码窄审发现并关闭两个增量边界：平台失权实际为404，已补立即清值；AuthProvider ready未就绪不作为统计请求门禁，避免额外无限等待。
- 最终TypeScript复核exit0；统计/API/前端最终通过项共51项（14+8+8+16+5）。副本回滚及制品封存的实际命令、原始输出、退出码与hash见下述VERIFICATION.txt，不用本段语义通过替代回滚结果。

## 47真实只读同快照对照

2026-11-02 11:30—11:31，对同一`REPEATABLE READ READ ONLY`快照和198人授权可见集合，顺序执行旧/新完整统计SQL：

| 查询 | 耗时 | 完整返回值摘要SHA256 |
| --- | ---: | --- |
| baseline | 9878.151 ms | `6cbeacc1cd31d44c36054655eb9247ed77bda336a53e1cf2dcc4ea88ebadb0a8` |
| modified | 2279.139 ms | `6cbeacc1cd31d44c36054655eb9247ed77bda336a53e1cf2dcc4ea88ebadb0a8` |

完整返回值deepEqual成立；减少约76.9%。随后新SQL执行计划1589.161ms，`jsonb_each`9,755次，对应9,755候选父，legacy关系段约151ms。新计划出现约292ms JIT开销但未修改JIT/全局DB参数。

这是生产数据只读SQL对照，不是新版本HTTP/浏览器或生产发布验收；旧先新后的单次顺序对照存在缓存/实时负载影响，不代表性能SLA。没有schema/业务写入、供应商调用、收费重放、重启或发布。之前10.157s是旧版本HTTP读数，不能与新SQL2.279s称完全相同测量层级。

证据目录：`E:/Workspace/naumi/output/admin-usage-performance-20261102`。根因原始材料在`output/admin-usage-slow-20261102`。

## 发布状态

开发验证/主线整合与上线分开记录；本轮不执行47发布，103隔离线保持。最终任务代码以Git主线合并记录为准；生产SQL对照不会替换在线应用。

## 集中复核命令及制品索引

```powershell
$env:ADMIN_USAGE_FIXTURE_DATABASE_URL='postgresql://postgres:fixture-only@127.0.0.1:54971/usage_fixture'
node scripts/verify-admin-usage-skew.cjs --source-root E:/Workspace/naumi/output/admin-usage-performance-20261102/before --output-root E:/Workspace/naumi/output/admin-usage-performance-20261102/tests/skew-baseline --baseline
node scripts/verify-admin-usage-skew.cjs --source-root E:/Workspace/naumi-release47-main-20261101-r1 --output-root E:/Workspace/naumi/output/admin-usage-performance-20261102/tests/skew-modified
node scripts/verify-admin-usage-pg.cjs E:/Workspace/naumi/output/admin-usage-performance-20261102/tests/modified-existing --scale
node scripts/verify-admin-usage-routes.cjs E:/Workspace/naumi/output/admin-usage-performance-20261102/tests/modified-routes
node scripts/verify-admin-usage-ui.cjs E:/Workspace/naumi/output/admin-usage-performance-20261102/tests/ui-final-r2
node scripts/verify-enterprise-usage-loading-ui.cjs E:/Workspace/naumi/output/admin-usage-performance-20261102/tests/enterprise-ui-final-r3
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

制品固定目录：`E:/Workspace/naumi/output/admin-usage-performance-20261102/artifacts/`：

- `MODIFIED_FILE.zip`：本任务8个文件和前后hash manifest。
- `DIFF_FILE.patch`：任务增量，独立副本重放验字节。
- `ROLLBACK.sh`：仅针对无.git副本；先核对全部修改态hash，任何后来编辑不符都在首次写入前退出73。保留修改态copy，不恢复生产数据库。
- `VERIFICATION.txt`：基线/修改态/副本回滚、全部测试原始结果及四路径的最终封存记录。

本地fixture数据库为单独容器，测试结束后移除该任务容器；其他本地/远端实例原样保留。
