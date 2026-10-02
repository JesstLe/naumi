# AI Gateway 实施交接

目标已建立：保留现有 New API 统一入口，在独立 Naumi Router 完成可恢复付费执行、能力与成本路由，Naumi 负责业务任务及积分结算。

## 已实现

- Router 持久化操作及结果，稳定任务 ID 绑定请求内容；重复请求重放、并发占用和内容冲突有明确契约。APIMart/fal 已受理任务恢复只轮询；未知受理禁止另发付费请求。
- 根据草稿、商品、详情、文字排版、参考图数、保真和分辨率筛选模型；按每种规格的价格矩阵估价后排序。真实调用驱动熔断和供应商并发上限。普通 OpenAI Images 供应商可配置接入，默认不启用新供应商。
- 生图、套图、A+ 透传稳定操作 ID；冻结质量和生图提示词。普通通道和 BYOK 保存提交标记，未知受理转核查；已完成付费结果保存后可以复用。画布改字保存提交标记及原始结果，未知受理暂停重试；改色取消 SDK 自动重试。私有执行缓存不进入任务公开响应。
- 发布流程保留供应商、价格和环境配置，备份数据库及 Router 状态。禁止已接收新任务后自动回滚至绕过账本的旧 Router。

## 验证

本地 `go test ./...`、`go vet ./...`、TypeScript 检查和 Naumi 生产构建通过。独立 PostgreSQL 回归调用实际生图、套图、A+ 路由，核验 JSON/multipart 字段、未知受理后的恢复、质量冻结及业务积分仅结算一次；另核验普通通道/BYOK 模型变更后仍禁止重发、结果缓存及画布任务崩溃后转核查。

未调用真实付费供应商；已在服务器隔离环境使用实际 New API 二进制、Router 和模拟供应商验证 JSON 生图及 multipart 编辑全链路。构建现有两条 `<img>` 提示与此次行为改动无关。Linux CI 增加 Router race 检查和固定提交二进制，Naumi CI 增加独立数据库回归。

## 上线限制与运营

成本节省取决于配置经核实的价格和能力；现有固定估价不能作为真实省钱比例。当前任务分类使用明确业务规则，没有训练难度分类模型。New API 对重复成功响应仍可能重复记内部额度；Naumi 和供应商幂等不等于公开网关账单幂等，现阶段保留内部使用。

Router 使用单实例持久账本，多副本需要共享事务存储。未知付费结果必须核对供应商任务/账单，不能直接删账本、换操作 ID 或退还未结算预留。结果存储应监控容量；暂未实现自动核查/自动清理。

已按用户批准完成协调发布和线上验收：应用固定镜像 `4260aec8092ffeabf525f77b941934498ebbc8a3`，Router `849b016f08a683a301f5608b65aece7db4fc117e`。公网版本 `1790954737`，数据库和存储健康，主要页面 200，生图/画布/套图/A+ 的有效匿名请求 401，App、数据库及视频 worker 运行。New API 与 Router 模型别名目录一致。停机前后用户 74、作品 1926；环境、路由价格、原默认模型和持久媒体卷保持。

完整数据库、New API SQLite、5.9G 媒体备份及停机增量位于服务器 `/opt/naumi/backups/gateway-20261002T151424Z`，回滚检查通过。权限回归修复了私有 umask 下配置重写后的读取问题；协调发布和回滚保持入口维护及 worker 暂停，全部验收后才恢复。详见 [生产验收记录](ai-gateway-production-2026-10-02.md)。

原独立只读媒体迁移容器 `naumi-media-migration` 退出码 2，Docker 未捕获日志。此次未修改或重启它；本地媒体及完整备份保留，迁移状态需要另行排查。

Router 运行和配置说明见独立仓库 `docs/IMAGE_GATEWAY_OPERATIONS.md`。

Recovery pins the managed gateway endpoint/account fingerprint. Set `NAUMI_ROUTER_STATE_DOMAIN` to identify the persistent Router state domain; changing it pauses pending recovery. A New API channel must not be redirected to an independent Router ledger while operations are pending. Migrate the ledger and results together when moving the service.

生图、套图、A+ 和共享编辑传输已适配 Router。其余直接 SDK 工具（如改色、穿搭、风格）尚未全部支持 Router 参数/规格，发布时不得把全局默认模型直接改成 Router 别名；先在已适配路径选用 Router。保留生产全局默认模型、已有供应商及价格配置。

升级应先暂停图片入口和 worker、等待现有付费调用结束并核查旧版本未完成任务，再备份并协调发布 Naumi 与 Router，最后恢复入口。旧版 app_image_jobs 没有提交证据，升级后自动转核查，不自动重发；管理员不能直接补版本标记或重新生成操作 ID。新 Router 首次上线前，不得让新契约任务先经过旧版无账本 Router。

当前生产仅启用一条 APIMart 路由。没有把所有现有生图请求切到 Router；多供应商混合选择和实际节省比例，需要核实更多供应商、价格与质量后衡量。
