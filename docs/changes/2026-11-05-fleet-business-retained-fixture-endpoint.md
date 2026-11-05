# Fleet retained fixture：拒绝连接串路由覆盖

## 问题与修改

PR #11 review `5775820091` / comment `4473352496` 指出：`new URL()` 的 authority 校验没有覆盖 node-postgres 的连接串查询参数。实际安装的 `pg@8.20.0` / `pg-connection-string@2.12.0` 将 `?host=other-server&port=5432` 解析为另一端点；事后的 `current_database()` 相等检查只证明数据库名称，不证明连接到了指定本地 fixture。

`scripts/lib/fleet-business-retained-fixture.ts` 现在在 `pool.connect()` 之前拒绝 URL 查询参数中任何 `host` 或 `port`，包括空值、与 authority 相同的值、重复参数和 URL 解码后匹配的参数名。原 loopback、65298、两个具名 central fixture DB、显式 isolation flag 和事务内实际数据库名检查保持不变。`application_name` / `sslmode=disable` 等无路由覆盖参数保持可用。

这是 scripts 下的历史行重建辅助函数，不是公共 admission。生产公共 `business.query` 继续硬性 HOLD，没有新开启路径，也没有执行任何远端、103/47 或生产数据库连接。

## 回归模块

新增 `scripts/verify-fleet-business-retained-url.mjs`：

- 执行完整的实际 helper 与实际导入的合同；baseline 从指定 Git SHA 读取，恢复测试从独立副本读取全部本地 TypeScript 依赖，不回退工作树源文件。
- 使用实际 `pg.Client` 的参数解析，不调用其连接方法。14 个路由参数对照使用有限 pool/SQL，检查拒绝消息、零 checkout/SQL、零行写入，不连接那些对照端点。
- 覆盖编码和重复 key、空值、Unix socket host、8 种可用本地 URL、稳定 ID 不改写、既有 flag/host/port/database/protocol 拒绝、实际数据库名不匹配回滚释放、非 business 操作拒绝。
- 原版84项中42失败；修改版84/84。这里的写计数属于有限 SQL fixture，不宣称在远端实际写入过数据。
- Workflow 加入此专项和具名 JSON artifact；远端任务是否启动、是否通过仍按新 HEAD 的实际 CI 单独记录。

本轮集中验证还覆盖既有真实本地 PG/HTTP protocol 和全库 TypeScript 检查，实际命令、输入、stdout/stderr、退出码以作者本地 `output/fleet-business-retained-url-20261105/final/VERIFICATION.txt` 为准。四份产物包含实际副本回滚与 later-edit 零写拒绝记录；它们不是生产回退或公开 CI artifact 的替代证明。

## 状态

公共 admission 与生产发布保持 **PREPARATION ONLY / HOLD**。未合 main、未部署103/47、未执行生产操作；现场 producer/consumer 归属、旧运维包与不可变恢复镜像、混合版本回退和 retained 结果生命周期的发布条件仍未建立。Docstring 覆盖率汇总警告仍开放，已请求具体函数清单；本修复不改变该阈值或宣称覆盖率达标。
