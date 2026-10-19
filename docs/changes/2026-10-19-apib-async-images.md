# APIB / APIMart 应用内异步图片适配

## 范围与状态

- 分支：`codex/apib-provider-20261019`；本模块在独立 worktree 开发，未覆盖共享 checkout 的 UI 改动。
- 接通非成本预设的 APIMart 图片直连与图片家族供应通道：受控参考图上传 → 单次生成提交 → 持久 task ID → GET 查询 → 图片验收。
- 本轮仅修复、隔离验证与提交推送；不部署、不重启、不持生产锁，不恢复用户暂停的收费验收，也不启用收费巡检。
- v118 已登记的 APIB 图片/视频来源仍保持禁用；本模块不创建模型 publication、不改售价、不批量声明 generate/edit/verified。
- 视频沿用原 `apimart` 视频适配，不将图片适配冒称新增视频实测。

## 实现边界

### 1. 显式、冻结的协议选择

`upstream.parameterMap.apimartImages` 是 schemaVersion=1 的应用内执行 opt-in；仅允许 `apimart-images`，必须配套显式 `qualityPolicy` 与 `resolutionPolicy`。它记录数量上限、mask、允许比例与可选输出像素表。

- 未 opt-in 的历史 APIMart 仍走 Router，原 `routerDigest` 校验不变。
- 原成本预设仍沿用 `apimart-preset:<modelVersion>:<unit>` attempt ID、medium 封顶与原计费逻辑；预设和普通模型共享一个持久提交核心。
- 普通模型按自身冻结质量/尺寸映射执行，不套成本预设 medium 封顶，不统一硬发 1K。比如文档中的 1MP、2K 等值由配置明确映射，不从模型名字推断。
- 管理端候选使用服务端 `channelCompatible` 标记；只有完整 opt-in 的已有来源才进入家族候选，目录采集仍不自动捏造契约。
- 应用内 family 不投影为外部 Router 池；opt-in 目标也不能偷偷进入外部混合池。

以下仅展示契约形状，不是已核验生产能力或可直接启用的配置：

```json
{
  "apimartImages": {
    "schemaVersion": 1,
    "maxOutputs": 1,
    "supportsMask": false,
    "ratios": ["1:1"]
  },
  "qualityPolicy": {
    "mode": "omit",
    "choices": [{"id":"medium","label":"标准"}]
  },
  "resolutionPolicy": {
    "mode":"map",
    "field":"resolution",
    "ratioField":"aspect_ratio",
    "values":{"2K":"2K"}
  }
}
```

### 2. 一次提交与原任务恢复

- 通用 attempt ID 纳入配置版本、公模、供应商、精确 wire model、稳定图片操作 ID。
- 家族候选在上传/marker 前竞争同一持久 operation pin，防止并发调度到不同供应商后各提交一次；ledger parameters CAS 只有一个请求获得生成权。
- `data:[{task_id}]` 与 `data:{id}` 均可受理；统一使用 `X-APIMart-Response-Version: 2026-07-27`。
- 上传 POST 的 transport gate 不把上传当生成 dispatch；最终生成 POST 仍重新核验实时负向开关。DNS pin、内网限制、重定向与鉴权保护保持。
- 受理超时、断连、缺 ID、marker-only 崩溃、GET 错误均保留状态，不重复提交。
- 已有 task ID 恢复只查原任务，即使当前通道被禁用。混合同步/异步家族只有持久 pin 指向异步来源后才允许恢复；不因为候选包含异步模型就重试同步付费请求。
- 画布改字 Worker 的 upstreamStarted 门禁同样识别精确原 APIMart marker/pin，沿用原 quality 后缀操作 ID；没有持久证据的旧提交继续暂停，不借恢复重新生成。
- 费用 Worker 复用已有 task outbox 与原凭据 GET 补查，不新增付费生成 Worker。
- 只有上传前失败或上游明确 `billing_status=not_charged` 才释放此通道。任务已受理后的失败、实际模型不符或坏图均保留原任务与费用记录，不自动换供应商。

### 3. 输入、输出与计费

- 参考图/蒙版使用文件字节；JSON 任意远程 image_urls/mask_url 不绕过应用上传链。
- 本地先校验格式、大小、实际解码、mask alpha 与首图像素匹配，再上传。
- 媒体下载不携带供应商 Authorization，不跟随重定向，限制 32 MiB 和解码像素量；数量必须精确匹配，维护了像素表时逐张核对尺寸。
- 供应商 task receipt 记录原实际 model/费用/usage；仅图片下载、解码与规格验收后写 `acceptedOutputs`。Worker 查到 completed 本身不构成客户交付凭据。
- 原客户售价、预设成本结算、计费冻结、人工数据优先级不改。
- 集中回归发现旧 supplier-cost SQL 文件漏了运行 schema 已有的 bi_call_id/索引，两条幂等 DDL 已补齐，保持迁移文件与执行 schema 一致；本轮没有在生产运行迁移。

## 集中验证

测试只使用 `127.0.0.1` 隔离 PostgreSQL schema 与本地 HTTP 假供应商；任何 fixture 的像素、价钱、模型名均不是生产证据。

- `scripts/verify-apimart-async-contract.ts`：新旧 schema opt-in 对照、缺字段和错协议拒绝。
- `scripts/verify-apimart-async-images.ts`：直连/家族、旧 Router 冻结、两种受理、并发 CAS、跨供应商 pin、禁用后的 GET 恢复、marker-only、未知响应、model/task/count/pixels/解码错误、mask/上传、费用与交付门禁。
- 原预设、供应通道、模型执行、版本发布、Reverse Hub 与供应商费用模块集中回归。
- 完整依赖在独立 build-source 安装，不改共享 node_modules；完整 Next 构建与类型检查记录在本地证据。
- 原始文件 SHA-256、可复现命令、完整输出、独立副本回滚与真实供应商调用数写入 `VERIFICATION.txt`。

## 尚未完成的线上阶段

本地适配通过不等于线上模型已可调用。后续需要独立有效蓝绿发布安排、刷新主线及已完成同事提交、逐模型参数/账户报价核对，并在用户恢复收费验收后取得真实输出证据。生产启用必须另行版本化发布相应模型配置；未验证能力不能自动改为 verified。


## 本轮验收结果

- 8 组集中隔离回归通过，异步专项 56 项检查；新增费用 Worker GET-only 与画布恢复门禁验证。
- 独立依赖的完整 Next 15.5.27 生产构建通过，包含类型检查与静态页面生成；保留项目既有 hooks/img 警告，未改无关 UI。
- 独立副本回滚通过：18 个原文件 SHA-256 恢复，5 个新增文件移除；回滚后原成本预设通过，异步 opt-in 恢复为 false。开发分支与交付包仍保留修复。
- 证据：`E:/Workspace/naumi/output/apib-async-adapter-20261019/`，包含 MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、仅用于本地独立副本的 ROLLBACK.sh。
- 真实供应商生成提交 0；线上配置/部署/收费验收状态均未改变。
