# R9A：图片提交、回执、取消、输入与批次入口的身份归属

## 模块与职责

本轮沿 R8Z 的显式 actor 接口迁移其余 5 个图片路由文件的 7 个处理器，并让主提交的 BI 包装消费同一服务端已认证身份。入口负责认证；BI 负责观测、来源与既有 continuation/model 包装；图片领域继续负责报价、任务、素材与冻结 scope。没有新权限缓存或任务系统。

## 原始证据

- 基线完整源码 `fe9da5e0490e810fcc0d35f1a6d1b268bc795fe7`，5333 原始文件，逐文件 raw hash 对照后保存到 `output/refactor-r9a-20261101/BASELINE_SOURCE.tar`。
- 实际 HMAC cookie、PG 账号验证、7 个 HTTP handler、BI、planner/quote、任务/批次保存、取消事务、私有上传/读取与 ZIP64 流：基线 **39 场景、90 检查**。
- 原上传/读取/取消/批次/下载每次认证 SQL 2 次；主提交经 BI 共 3 次：`AUTH_READS=2/3/2/2/2/2/2`。不是整站含 middleware 的统计。
- 两个用于验证 ZIP 的终态 batch item/作品是显式 fixture 数据，非供应商完成证明。实际提交均走原 Worker 延迟策略，付费和供应商 POST 为 0。

## 公共接口与实现

- `CreationRouteCallback` 统一 creation 和 receipt wrapper 的 callback 类型。服务端已认证账号为 string；已确定匿名为 null；no-DB 未解析为 undefined；旧零参 callback 仍可使用。
- 7 个 handler 复用传入 actor；仅 undefined 时保留原认证适配。POST 来源、Worker secret、operation/schema 和 owner/scope 检查顺序不改。
- `withBiRequest(request, run, authenticatedActor?)` 消费同一服务端身份；旧调用者省略参数时保留自身认证。known-anonymous 不重试解析为另一身份，no-DB 保持旧 BI 语义。
- 业务写入、账务、供应商、价格、原报价、取消标志及 UNKNOWN 行为不改；没有 schema 迁移。

## 集中验证与未完成项

新增 `scripts/verify-imagegen-ingress-routes.ts`，并接入既有 core catalog 的 pricing 组。原/新正常响应和授权轨迹比较必须 EXACT。覆盖原任务重复提交、已受理 false、未受理 false、撤权后的原回执、跨账号/冻结 scope、封禁/过期/撤销会话、来源、Worker、私有原图/ZIP、读取失败仍 UNKNOWN、no-DB 与旧 callback。

修改版首次实际执行 **39 场景/90 检查 PASS**，认证读取 `1/1/1/1/1/1/1`，全部正常响应/授权/字节投影与原版 EXACT。两轮各自 PG/随机 schema、连接、本地 HTTP 与临时媒体均已清理。全项目 lint exit0（37 既有 warning），tsc `--noEmit --incremental false` exit0；顺序为 lint→最终类型输入捕获→tsc。

当前实际类型输入为 5091（5087 compiler source 与 4 个未变的配置文件），原字节已核对。受影响组集中回归、提交/同步与独立副本回滚尚待本轮执行；后续更新本节。

本轮补充了调用链 AST 盘点（含本地函数与动态 import 的 wrapper），不是原 R8Z 仅列直接 handler 的同一统计：59 个 wrapper 中 actor 消费者 1→8，直接本地认证候选 8→1；剩余为 `/api/generate-image` 的历史 imagegen 轮询适配。其他跨文件 BI/领域身份适配仍待后续模块核查；不把局部候选为零/迁移 7 处写成全部入口已唯一认证。

最后完整 Linux/App/Worker 验收仍是 R8Z f744，直到新固定源码完整验收取代。main/部署均未执行，47 HOLD。整体重构目标 ACTIVE。
