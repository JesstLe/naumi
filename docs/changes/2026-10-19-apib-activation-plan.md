# APIB 精确启用子集与独立配置 publication 交接

## 责任与版本

- 生产唯一写入负责人：统一 47 发布线程；本模块仅本地准备与隔离测试，不 SSH、不持生产锁、不创建候选、不运行生产 APPLY。
- 程序异步适配 `e6ce5a28` 已由统一线程合入运行候选。本模块不再次实现适配、不改运行程序，不需要第二个 Web/Worker 候选。
- 本地准备基于已保存的模型 v118/digest `826f5228a6e67f89618c89d6ae9cdef568175e936f99634c6cda66209cc187ae`、计费 v8。生产负责人必须刷新实时基线和 canonical revision/hash 后重新核对 CAS。
- 新授权允许正式启用；收费验收和自动收费巡检仍 PAUSED。本模块不生成图片/视频，不刷新供应商，不填账户采购价格，不提升 `verified`。

## 精确子集

仅启用两个既有 upstream：

- `apib:gpt-image-2.5-flare`
- `apib:gpt-image-2.5-sunburst`

两者归现有 `gpt-image-2` / GPT-Image-2.5 家族，保持 `verified=false`，仅文档声明的 generate；本批不开放 edit、参考图、mask、透明、原生高级参数或 2K/4K。

实际参数契约在 `docs/providers/apib-activation-20261019.json`：

- model 使用上述精确 wire ID，不互换、不把 ext 冒充 flare。
- quality 五档按原值发送：low/medium/high/xhigh/max。
- resolution 显式映射 `1K -> 1k`，比例字段 `size`。
- 首批 n=1、output_format=png；15 个比例及其 1K 输出像素逐项取自文档表。
- 生成 `POST /v1/images/generations`，受理 `data[0].task_id`，GET 原任务至 completed/failed，图片结果 `data.result.images[].url[]`。
- 文档来源是 APIB 关联的 APIMart 公开资料，不是 APIB 已付费运行证明。原始文档副本及 SHA-256 一并保存，不把 fixture 或文档视作真实输出验收。

来源：`docs/providers/evidence/apimart-gpt-image25-20261019.md`，SHA-256 `be8e52e7a6e1409b1f6d5a0c84f85898f9ad07e7a0a832ecea798a5205e5231d`。精确 ID/质量/尺寸/数量/格式/像素/异步结果对应行范围在契约 JSON 中。

## 最小差异与保留项

共 17 项字段/通道增量：启用 apib-image provider；两个 upstream 的 enabled、generate、qualities、nativeResolutions 和三项 parameterMap；原家族仅追加两条通道。

- 原通道 enabled/priority/weight、调度模式、公模 target、工具范围、客户售价、billing、其他 provider/upstream 全部保留。
- 两条新通道均使用原家族最大 priority+1（v118 为 3），weight=1，只作备用，不抢占正常首选流量。
- 元数据库、人工能力字段、采购报价、密钥均不写入；只复用现有 credentialRef。
- 新目标的健康扫描 `supported=false`，不会因为 provider 启用而进入自动付费巡检；脚本验证此门禁。

完整 75 条协议/适配支持与排除矩阵由 PREPARE 生成 `MATRIX.json`：

- 2 条 DOCUMENTED_GENERATE_SUBSET。
- ext 与四条 Pro/2 Banana 来源：对应文档尚未建立当前核心必发 output_format=png 及像素矩阵的完整契约，保留待核，不据此称供应商不支持。
- 17 条新图片家族来源：尚无本批核准的公模 ID/客户售价映射，不新增或猜测售价。
- 51 条视频：逐型号 wire profile、输出链路及售价映射未纳入本批验收，继续待核；不默认全 75 条启用。

## 工具与命令

本地离线准备（输入 ORIGINAL_MODEL.json、ORIGINAL_BILLING.json 放入指定目录）：

```powershell
node --conditions=react-server --import tsx scripts/ops/apib-activation.ts PREPARE output/apib-activation-20261019
```

生成 PLAN.json（含固定 operationId、v118/billing CAS、最小 delta 和 inverse）、MODIFIED_FILE.json、DIFF_FILE.json、MATRIX.json、LOCAL_PLAN.json。PLAN 75 个质量/比例组合只运行本地 simulate/resolve，不调用生成接口；不冒称公网真实 plan 验收。

生产负责人用固定 bundle 在 host 本地运行 `scripts/ops/apib-activation47.py --spec <spec.json>`。它复用 HostTransaction 持三锁，检查完整 Web 身份、源版本/build、canonical 原始字节 hash/revision、activeNormalBlueGreenReleaseId 对应记录 COMPLETE；历史根 MIGRATED_CLEANUP_PENDING 不清除、不改写。

spec 必须由负责人当时核对的真实值填写：

```json
{
  "target":"47.105.59.142",
  "mode":"PLAN",
  "bundleRoot":"/opt/naumi-staging/evidence/<operation>/bundle",
  "evidenceRoot":"/opt/naumi-staging/evidence/<operation>/plan",
  "web":{"id":"<完整64位ID>","name":"<当前Web名>","image":"sha256:<完整镜像>","running":true,"startedAt":"<原值>","restartPolicy":"<原值>"},
  "sourceCommit":"<当时运行commit>","buildVersion":"<当时build>",
  "releaseId":"release47-alldev-20261019-r2",
  "canonicalRevision":144,"canonicalSha256":"<当时current.json原始字节SHA256>"
}
```

顺序：PLAN → APPLY → VERIFY。每次 spec mode 对应操作，沿用同一 bundle/operationId 和容器内证据目录，不能重新复制覆盖 REQUEST 或 publication。VERIFY 输出当前 publication UUID/phase 原值、模型/计费版本、精确候选与冻结 wire model，以及本地计划输入/eligible；生产负责人另跑真实授权 `POST /api/imagegen/plan`（不是 submit）并保存回执。

- APPLY 使用专用 actor 草稿，不覆盖管理员草稿。先持久 REQUEST 后调用版本化 runtime.publish；UNKNOWN 仅用同 UUID/同 REQUEST 对账，不新建 UUID 重发。
- 脚本 fetch 仅放行 Router 管理路径，不调用供应商；LOADCHECK 不初始化 DB。
- host wrapper 只复制私有运维制品到 `/tmp/apib-activation-<UUID>` 并执行，不改 App/Worker 文件或持久环境、不重启。独立 Node 进程覆盖其自身 NODE_OPTIONS，避免继承 HTTP observer 端口。
- ROLLBACK 是新的版本化 publication：对当前配置只逆转本次 17 项增量，保留后来无关标签/权重/价格；自己的字段被改过、通道权重被改过或 provider 有新依赖时 HOLD，不盲回灌 v118。
- 生产 publication/公网 VERIFY 尚未在本线程执行；本地 ROLLBACK.sh 只用于副本验收，生产回退仍须上述持锁 host wrapper 的 ROLLBACK 模式。

## 集中验证

`scripts/verify-apib-activation.ts` 用隔离 PostgreSQL 与假 Router 验证最小增量、75 组合、UNKNOWN 同 ID 恢复、重复 APPLY 幂等、后续管理员修改及 billing v9 的选择性保留、重复 ROLLBACK、0 supplier calls；`scripts/ops/test_apib_activation47.py` 验证 canonical CAS 与新 successor COMPLETE、历史根状态保留。运维 bundle 需编译、LOADCHECK 与限定范围 TypeScript 检查通过后交接。


### 本轮实际结果

本地 v118 PREPARE：候选 2、待核 73、最小 delta 17、质量/比例组合 75，调用供应商 0。隔离 PG 的 PLAN/APPLY/VERIFY/ROLLBACK、UNKNOWN 同 ID 对账和重复幂等通过，后来无关权重/标签与 billing v9 保留；6 个 host canonical 测试、限定范围 TypeScript、运维 bundle 编译/LOADCHECK 通过。独立 JSON 副本回滚恢复 v118 digest，MODIFIED_FILE 保持启用候选。

实际制品目录：`E:/Workspace/naumi/output/apib-activation47-20261019/`。生产平面 bundle 在其 `bundle/` 子目录，含 SHA256 清单。计划 UUID 是配置 publication 候选 ID，不是已创建的线上 publication；本线程没有生产 APPLY/VERIFY 结果。
