# R8B：请求基础设施 schema 的显式启动归属

## 基线与职责

独立工作树 `E:/Workspace/naumi-refactor-20261024`，基线 `65ff93d76e8720046439dca9ea02a864c8c65dff`；完整 5226 文件原始 hash/tar 与独立原始副本位于 `output/refactor-r8b-20261030`。开工刷新 main 仍为 `e2f562556ea6e71370619686e1fc8d4c634ef5e7`，没有新增待接提交。

本片不是改业务限流、站点策略或账务：限流初始化仍归原 `rate-limit-store`（原 bounded transaction/SQL/deadline），站点表 DDL 归轻量 `site-control/schema`，普通 Web 组合在原 43 步之后准备限流；只有已绑定 dedicated 企业站才准备站点表。一般平台不创建站点表，sidecar/无 DB 仍不运行一般应用迁移。Fleet 角色与 release/Worker 协调 schema 不塞入普通业务启动。

## 实际旧源码反例

完整原始源码 7 个独立冷进程、真实 PG、真实 Web startup/限流/站点 HTTP handler、真实 esbuild 独立 route bundle：旧 57 检查按预期复现。共享站首次限流有 1 次 DDL；企业站首次限流及策略分别有 1 次 DDL；另两个策略 bundle 重复 2 次 DDL。真实 PG event trigger 拒绝 DDL 时失败落在用户请求，而非启动。

额外实际 pool-rebind 反例：关闭原 Pool、切换到新的隔离 namespace 后，原 startup 复用旧 report，新 schema 的 app_users 缺失；原策略模块沿用 ready，直接读出 42P01。原追加 14 检查已运行复现，不把不存在的表读失败变成空策略或默认授权。

## 实现与边界

- 原限流 schema initializer 公开为 `ensurePostgresRateLimitSchema`，与请求兼容路径共用原 process/Pool 缓存；消费、过期清理、排队、超时与 429/503 判据保持。
- 站点 DDL 原 SQL 不变，readiness 改用已有 actual-Pool/owner 注册；跨 Next bundle 和 HMR 共享就绪，失败清除 promise，下个真实初始化可重试。store 保留旧 named export 的同一函数兼容，生产 Fleet/media 调用改为真实 schema owner。
- Web startup 的完成 Promise 同样用已有 actual-Pool readiness，避免把上一 Pool generation 的完成状态借给新库；未建立新 registry 或引入后台任务。
- 保留 policy CAS、dedicated binding、权限/素材归属、原 command receipt、UNKNOWN 和钱包一致性；不添加业务确认/限额。

## 验证与未完成

实现完成后集中执行 modified 7-part 真实 PG、原分布式限流/站点策略、Web startup/持久化与必要完整候选。当前该段记录实施状态，不预记测试通过；最终固定源、命令、literal、退出码和副本回滚以 DELIVERY/VERIFICATION 为准。

R8A 文档中 lint 37 的汇总是抄写差异：其最终原始 LINT_FINAL.log 实际含 38 条 Warning，R8A DELIVERY 已记录 38。本片保留原日志，后续按本片实测计数，不把既有 warning 误报为本片新增/减少。

整体仍 ACTIVE；本片完成是同步后的第 3 个模块，应普通同步 main 并计数归零。独立整版重构分支已超过 48 小时未合 main，原因仍是用户要求完整重构候选、尚有整版验收/性能容量/有效 CI 与剩余 UI 归属未完成；不把本片通过写成最终 main 整合或上线。47 HOLD，未部署。

### 复现驱动的追加修正

- 真实四个 Pool 的同 namespace 首启 barrier 已复现旧站点 DDL 竞态：3 个 23505。新站点 schema 使用现有 namespace transaction/advisory lock，SQL 原文不变，不新建锁体系。
- 首次实现确实重跑新 Pool 启动，但真实 PG 又捕获计费配置 singleton 仍指旧已关闭 Pool 的 CONFIG_UNAVAILABLE。已将配置及账务装配缓存绑定实际 Pool（WeakMap），只改生命周期身份，原配置初始化函数/现价查询/历史冻结版本/账务算法不改；新库不继承上一库 immutableVersion 缓存。该 Pool generation 场景只在明确排空/关闭后重建，不新增线上热切库功能。
- 两次失败完整保留：一次是上述生命周期缺陷；另一次是自有 PG 的 128MiB 数据 tmpfs 被累计 catalog/WAL 写满，53100 最终导致该 fixture 退出。核对两个自有标签后移除，换为原 Docker 匿名数据卷（256MiB 内存/1 CPU 不变），没有修改产品资源参数或掩盖数据库错误。
- 当前修改后 7-part 70 检查已实际通过；新加四池竞态、跨 startup bundle、schema 全结构等价断言后，再统一做最终 matrix，不用阶段数字冒充最终。

### 固定源码前的集中检查

完整旧版最终 8-part 73 检查复现，新版 8-part 76 检查通过；共享及 dedicated 的 columns/constraints/indexes 完整 schema 摘要分别逐项相同。新增实际Web startup 独立bundle共享同report，四个真实Pool并发首启由旧3个23505→新0；原价/历史计费版本缓存只在原Pool内复用，新Pool不继承旧版本。完整tsc exit0、lint exit0、四类SCC0，runner12组214检查通过。

第3模块普通fetch/merge main 已执行，main仍e2f56255，没有新增提交，返回Already up to date；模块计数3→0。当前准备固定源码后跑完整167 core以及完整Linux同镜像候选（不是将阶段日志跨源码拼成全量通过）。新测试只给原既有分布式限流脚本增加独占证据目录、给站点脚本增加已有隔离fixture命名支持；没有替换原业务断言。

## 最终固定候选验收

固定应用/完整验收源码 `d9d03576b238360e712bd745c2bb1ebb592a67c6`。限流沿原 store 初始化，dedicated 企业站的 site-policy DDL 归轻量 schema owner，两个准备步骤接原显式 Web startup；原 startup/策略就绪和计费配置/装配缓存按实际 Pool 隔离。已有 43 个 owner 顺序与 SQL、限流消费/清理及策略 CAS/绑定/计费 initialize 正文保持。共享平台不创建站点表，sidecar/无 DB 不迁移，Fleet/release/Worker 独立角色不越界。

真实 PG 旧 8 组 73 检查复现→新 8 组 76 检查通过；首次限流及企业策略 DDL 1→0，两个独立 route bundle DDL 2→0，四个 Pool 并发建表旧 3 个23505→新0，已关闭 Pool 的42P01/配置缓存串代闭合；真实DDL失败改在启动暴露并可重试。共享/企业完整 schema columns/constraints/indexes 分别相同。

**完整 core167/167 全部重新执行，0失败/0未运行/0复用**；原分布式限流、站点策略、持久化均纳入同 SHA 目录。新完整生产 Dockerfile 同 Web/Worker 镜像：Linux runtime177/原生媒体与实际产品双 browser50 均通过，原 frozen price/UNKNOWN/单次扣款/原图与历史保持。额外原 Web startup53、registry99 通过；旧 Compose verifier 对已上线 direct Worker 仍断言无 DB 的历史错误已在完整原树复现，改为验证当前 direct/shared DB 及旧HTTP relay的实际角色，14检查通过，产品 Compose 字节未改。

8 个原 src/services 文件改变、1 个新 schema owner，其余 2099 个原产品文件 hash 保持；四类SCC0，类型/lint通过。R8A历史文档的37条warning是抄写差异，原日志及DELIVERY实际38；本片按原始日志计数。最终封版仅补验收脚本/文档，应用源码与镜像逐hash一致；完整包/5226原hash副本回滚及远端以 R8B DELIVERY/VERIFICATION 为准。

第三模块普通 fetch/merge main `e2f56255` 无新提交，计数3→0。整体仍 ACTIVE，未合 main、未部署，47 HOLD；当前完整退出审计见 `docs/architecture/REFACTOR_EXIT_AUDIT.md`，保留剩余Canvas组合/同机性能与容量/有效CI/最终main整合，不用本片通过替代整版交付。


第一轮完整core因编排传错fixture数据库名停在cutout-before-setup（43PASS/1FAIL/123NOT_RUN）；保留全部失败日志，修正自有PG目标名后完整167从零运行，不复用早一轮日志。旧Compose断言的baseline/modified两次exit1同样保留，修正的是验证脚本而非Worker或配置。
