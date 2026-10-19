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
- 首批 n=1、output_format=png；执行候选只含 12 个当前 route 可通过的比例及其文档 1K 像素。完整 15 项原始来源观察独立保留在 sourceObservations，不写入执行白名单。
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

生成 PLAN.json（含固定 operationId、v118/billing CAS、最小 delta 和 inverse）、MODIFIED_FILE.json、DIFF_FILE.json、MATRIX.json、LOCAL_PLAN.json。PLAN 为 60 个质量/比例组合（5×12）的本地 simulate/resolve，另有 15 个排除组合（5×3）的实际 adapter 参数拒绝检查；直接调用实际 request-size helper 验证公模及两个精确 wire ID 的 36 次通过、9 次拒绝。不调用生成接口，不冒称完整 HTTP handler 或公网真实 plan 验收。

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

顺序：PLAN → APPLY → VERIFY → 真实只读 HTTP plan，由唯一生产负责人负责外层 HostTransaction 全程持续持三锁；其可选 existing_tx/nullcontext host wrapper 入口由该线程单独修改，本次不修改 host wrapper。各步沿用同一 bundle/operationId 和容器内证据目录，不能重新复制覆盖 REQUEST 或 publication。VERIFY 输出当前 publication UUID/phase 原值、模型/计费版本、精确候选与冻结 wire model，以及本地计划输入/eligible；生产负责人另跑真实授权 `POST /api/imagegen/plan`（不是 submit）并保存回执。

- APPLY 使用专用 actor 草稿，不覆盖管理员草稿。先持久 REQUEST 后调用版本化 runtime.publish；UNKNOWN 仅用同 UUID/同 REQUEST 对账，不新建 UUID 重发。
- 脚本 fetch 仅放行 Router 管理路径，不调用供应商；LOADCHECK 不初始化 DB。
- host wrapper 只复制私有运维制品到 `/tmp/apib-activation-<UUID>` 并执行，不改 App/Worker 文件或持久环境、不重启。独立 Node 进程覆盖其自身 NODE_OPTIONS，避免继承 HTTP observer 端口。
- ROLLBACK 是新的版本化 publication：对当前配置只逆转本次 17 项增量，保留后来无关标签/权重/价格；自己的字段被改过、通道权重被改过或 provider 有新依赖时 HOLD，不盲回灌 v118。
- 生产 publication/公网 VERIFY 尚未在本线程执行；本地 ROLLBACK.sh 只用于副本验收，生产回退仍须上述持锁 host wrapper 的 ROLLBACK 模式。

## 集中验证

`scripts/verify-apib-activation.ts` 用隔离 PostgreSQL 与假 Router 验证最小增量、60 个允许组合及 15 个排除组合、UNKNOWN 同 ID 恢复、重复 APPLY 幂等、后续管理员修改及 billing v9 的选择性保留、重复 ROLLBACK、0 supplier calls；`scripts/ops/test_apib_activation47.py` 验证 canonical CAS 与新 successor COMPLETE、历史根状态保留。运维 bundle 需编译、LOADCHECK 与限定范围 TypeScript 检查通过后交接。


### r1 历史结果与替代状态

旧 e21/r1 在模拟层验证了 75 组合，但没有覆盖真实 handler 前置 sizeFor 门禁，因此其 15 比例可执行声明被本修订替代。旧目录 `E:/Workspace/naumi/output/apib-activation47-20261019/` 保留审计，不再作为执行输入。旧包 candidateDigest `d42832283798485ee193247890f66cb05bedca0f4425e55bd410ab7d908c8e53` 已被替代。

### r2 本地 route 核实

核对运行源 `5d7631a06cb3ca64b036641ba85eddf72fb5d3fa`，运行源码未修改；契约 `routeConstraint.sourceSha256` 固定 8 份相关 Git 源码字节的 SHA-256，测试只规范化本地 CRLF 为 LF。

- `generate-image/route.ts:1014` 对普通新 HTTP 请求服务端写入 `ratioContractVersion=1`；`imagegen/plan.ts` 新计划同样为 1，`generation-core.ts:34` 传入该版本。
- `route.ts:247–248` 在所有 SDK images 调用前先执行 `sizeFor(effectiveRatio,sizingModel,true)`；`request-size.ts:5–17` 的 EXACT_SIZES 只有 12 项。
- `supportsExactImageSize` 同时匹配 flare、sunburst 及公模 gpt-image-2。实际家族 supplier-channels 顶层 scope 使用公模 gpt-image-2，而非某个 child wire ID；这个区别不构成绕过，两类 ID 全部命中同一门禁。
- 显式 `9:21`、`3:1`、`1:3` 经 inheritedImageRatio 保持原值，自定义宽高也不绕过 sizeFor。adapter 的参数映射发生在后续 SDK fetch 阶段，此前已 throw。
- 历史冻结任务可能保留 undefined 的旧方向尺寸协议；这是历史兼容路径，不是本次新启用候选可以使用的正常提交路径。BYOK/new-api-flow/mock 也不是这两个平台 APIMart upstream 的替代提交证据。未发现该候选正常新请求的可用绕过路径。

执行比例精确为：`1:1, 3:2, 2:3, 4:3, 3:4, 5:4, 4:5, 16:9, 9:16, 2:1, 1:2, 21:9`。`9:21, 3:1, 1:3` 仅来源观察，因当前 route 未配置精确尺寸而排除。

注意 helper 的请求像素不等于 APIMart 文档输出像素，例如 4:3 分别为 1536×1152 与 1024×768；前者只用于当前 handler/SDK 尺寸门禁，后续 adapter 按已冻结 ratio/resolution 输出原文比例契约。两种矩阵不得混称；真实供应商输出未验收。

`scripts/verify-apib-route-gate.ts` 用 TypeScript AST 提取未修改的实际 sizeFor 与 sizingModel/size 前置代码，结合真实 helper 执行 36 通过/9 拒绝，并检查其位于所有 SDK images 调用前；不 import/运行完整 route、不初始化其 job 服务、不伪称 HTTP 运行验收。

### 模拟层额外核实

当前 `simulateModel` 不读取 `apimartImages.ratios`，即使收敛到 12 项，后三比例在粗粒度模拟中仍可能返回这两个 eligible upstream。首轮新增负向断言揭示此事实，现将 rawSimulationEligibleIds 原样记录到 LOCAL_PLAN.excludedSimulation，明确 routeAdmissible=false、adapterAdmissible=false，不把原始模拟 eligible 改写成 excluded，也不修改运行源码。

实际 `apimartImageParameters` 读取候选的 12 项白名单：两个 upstream 共 120 次允许参数检查通过、30 次排除参数检查拒绝；这属于真实参数 helper 的本地验证，不是执行 adapter fetch。生产负责人真实只读 HTTP plan 的 eligible 也只证明规划层响应，不能单独证明 handler/收费输出验收。若未来要在规划阶段就提前拒绝这些比例，需要另一个运行源码任务，本次不扩展。

### r2 交接制品

替代目录：`E:/Workspace/naumi/output/apib-activation47-20261019-r2/`。预留 operationId 仍为 `4ccac68c-f764-4add-967b-1fafbbb40381`；用户确认它未在线创建、无 REQUEST/UNKNOWN，本次是修正未提交候选，不是 UNKNOWN 恢复。精确 digest、bundle SHA256、测试实测回执见该目录 VERIFICATION.txt 与 HANDOFF.json。

保留基线 v118/billing8、2 候选/73 HOLD、17 项 delta、generate-only/1K/n1/PNG/5质量/备用 priority3 weight1、verified=false、采购价未知、收费验收和收费巡检 PAUSED。字段级选择性回滚保留后来无关权重/标签/计费修改，不回灌 DB/媒体、不重放任务。生产 PLAN/APPLY/publication/真实 HTTP plan 均交唯一负责人；本线程不执行。

### r2 集中验证实测结果

- handler 实际前置提取：36 通过 / 9 次在 SDK 前拒绝；历史兼容 9 例仅用于说明非新请求路径，HTTP 执行 0。
- v118 本地替代候选：2 候选 / 73 HOLD / 17 delta，60 个允许组合、15 个排除组合；实际 adapter 参数 helper 120 通过 / 30 拒绝；原始粗粒度模拟比例盲区按实保留。
- 隔离 PG publication PLAN/APPLY/VERIFY、UNKNOWN 同 UUID 恢复、重复 APPLY、选择性回滚及重复回滚通过；后来无关 weight/label 与 billing v9 保留。此 UNKNOWN 是 fixture 故障注入，不是原预留生产 UUID 的状态。
- 异步 opt-in 契约回归通过；限定 TypeScript（含新增 route gate 测试）无诊断；esbuild 运维 bundle/LOADCHECK 通过；独立副本回滚精确恢复 v118，MODIFIED_FILE 仍保留 12 比例启用候选。
- candidateDigest：`85e2eb60ee9aa69c88d293315641e347d235c08e78365cec65c70d1ed3dbee52`。
- contractHash：`9b63b906a19411b1f6a350e7972a2c7eb8b4065506dd16b47dbbbcd7dd1785f2`。
- 替代 PRODUCTION_BUNDLE.zip SHA256：`3bb403196ca11c9e237d63fbde6d292af1b3c856d2a0cdbfe1fc4615a171f200`。原始 15 比例来源文件 SHA 不变。
- r1→r2 的 config 差异严格只有两个 upstream 的 ratios 列表及每个列表对应移除的 3 个像素项（8 个 JSON 叶子差异）；其余候选字段完全相同。
- 本线程 SSH=0、生产锁=0、生产写入=0、生成/供应商调用=0；`scripts/ops/apib-activation47.py` 未修改。生产 APPLY/真实 HTTP plan 未执行。

开发同步计数：本修订为 1 个运维候选模块；开工及提交前刷新 origin/main，基于 `97a282c5` 已整合，无新远端业务提交时保持当前父 e21。不是一次程序发布，不增加生产发布/空间清理计数。

## 生产执行结果（统一窗口，2026-10-19 13:34 北京时间）

生产接手人为统一窗口线程 `da1fb6c5-ffa9-4da4-97eb-d71dc858b418`。实际执行替代增量 `29f4be6f` 的12比例包；旧15比例包保留审计，不作执行输入。版本化 publication `4ccac68c-f764-4add-967b-1fafbbb40381` 的 phase 原值为 `applied`，模型配置 `118→119`，digest `85e2eb60ee9aa69c88d293315641e347d235c08e78365cec65c70d1ed3dbee52`。DB updated_at 为 `2026-10-19T05:30:29.239765Z`；最终独立验收为 `2026-10-19T05:34:41.994321Z`。

- 真实授权公网 `POST /api/imagegen/plan`：`gpt-image-2 / generate / medium / 1K / 3:4 / PNG / n1 / 无输入`，HTTP200、modelVersion119、billingVersion8、报价6；eligible upstream 为原 `platform-images:9ba2827204791ed8`、`geeknow-gpt-image-2` 以及新增 `apib:gpt-image-2.5-flare`、`apib:gpt-image-2.5-sunburst`。未submit，0供应商生成。
- 单张授权参考的edit、2K生成两个真实负向plan均HTTP200，均未纳入APIB。冻结本地模拟仍报告基线modelVersion118，明确不同于实时HTTP的119。
- 相对118严格17增量；两条备用priority3/weight1、其余售价/旧通道权重与billing8保持。73项待核、51视频禁用、verified=false，收费验收及自动收费巡检PAUSED。
- 运行程序仍 `5d7631a06cb3ca64b036641ba85eddf72fb5d3fa / build1792383873`；同镜像Web/Worker `sha256:9b43d564c51fd26a45d8d8129f1e1faac21459f2337272b7651ca015a588deb2`，容器完整ID/StartedAt/restartPolicy保持。本配置事务无程序候选、无重启/切流；canonical revision144原始字节SHA和Nginx全文SHA保持，原历史未结事件不改写。
- 首次APPLY/VERIFY后，自有独立核对SQL错从publication表直接选digest（实际存于versions表），远端exit1。只读JOIN核对确认原UUID已applied119，随后重新持三锁，保留原REQUEST，仅VERIFY和真实HTTP计划，不重做APPLY、不换UUID。原REQUEST字节SHA `16bf17038acee7ee7d331ec50850296ce1244d3a9ab5789b99ea567a943c6cd6` 前后相等。恢复命令REMOTE_EXIT=0，最终三锁FREE；无生产回退。
- 当前模拟/plan仍不能提前过滤9:21/3:1/1:3；真实route/adapter拒绝这些，不把eligible当作付费交付证明。
- 12项host/CAS/外层三锁测试通过；从生产119导出的独立JSON副本实际执行选择性逆向，恢复v118 digest，正式配置与MODIFIED_FILE保留119；不回灌DB/媒体/任务。

证据：`E:/Workspace/naumi-all-dev-release47-20261019/output/apib-activation47-production-20261019/VERIFICATION.txt`，私有远端 `/opt/naumi-staging/evidence/apib-activation47-20261019`。四件为 `MODIFIED_FILE.json`、`DIFF_FILE.json`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`；后者是本地独立副本验收，生产回退须持三锁host ROLLBACK新版本publication。已向原线程2bb97993-42d7-4714-8357-2f34a6339fd5回传最终UUID/phase/版本/真实plan及边界，注明无需回执或执行。

最终只读健康db.ok=true；7运行容器（1Web+1Worker+5基础服务），原1852Web/Worker均stopped/restart=no。MemAvailable4286200kB、swap使用780KiB、磁盘空11036696576bytes；程序自动重启恢复仍未验收，restart=no并非自动恢复已具备。
