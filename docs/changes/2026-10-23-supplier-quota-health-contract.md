# 供应商 403：诊断、健康避让与付费重提边界

## 本模块与协作边界

- 基线：`cd64d1ffd4eda66afcbe7817fc9016203c92be4a`，分支 `t3/supplier-quota-health`。
- 子模块只修改 `scripts/verify-imagegen-history-supplier-quota.ts` 和本文；`channel-fetch.ts` 由父任务独占实现，验证时仅把父文件只读复制到本模块自有 candidate。
- 47 配置与发布 HOLD；没有充值、供应商访问、SSH、生产配置写入、付费任务或历史任务重放。本模块只本地提交，不 push/deploy。
- 开工 `git fetch origin main` 后 `origin/main` 与父 HEAD 同为 `cd64d1ff`。本轮一个验证模块，不是一次生产发布；不增加发布维护计数。

## 已核对的现有合同与最小必要性

1. `channel-health-policy.ts` 已将 401/403 归为粗粒度 `auth`，首次失败即冷却，默认五分钟，保留受限 `Retry-After`。这不是鉴权根因或供应商未收费证明。无需新框架、账户封禁表或额度正则。
2. `channel-scheduler.ts` 的健康键由 provider/base URL/wire model 构成。普通新请求跳过冷却/正在探测通道；到期允许单半开探测，不是永久关闭。已接受 operation 的原 pin 仍绑定原通道，不可把冷却当成重提许可。
3. 父基线 `channel-fetch.ts` 的图片 nondefinite 4xx 分支早于健康记录返回，所以 403 虽有 execution stage，却漏记 channel health。父补丁将原带本地错误排除规则的失败记录前移并只记一次；保留 Pending、pin 与 `not_charged` 门槛。
4. 父补丁将 nondefinite 图片 4xx 改成原 HTTP status、固定 `IMAGE_*` code/message/type，不透传上游正文，不新增 `billing_status`。本模块不能继续要求 raw body 不变。
5. `provider-balance.ts` 只读 GET + 本地设置缓存：成功五分钟、失败三十秒、刷新最短十五秒；APIB 为账户余额，Geek 为 API Key 额度，当前都 `unit=null`。负数/无限额哨兵、失败的 lastKnown 与当前测量分离。不把缓存接入付费选路，也不与客户积分、冻结报价或历史预扣数字换算。
6. `supplier-failure.ts` 的固定诊断与 `stageCost()` 的收费状态相互独立。一般 403/额度文字仍是 `failed-response` / supplier cost unknown；只有显式非收费合同允许当前 operation 换供应商。

## 本模块实现

- 验证器增加 `baseline` / `modified` / `rollback` 期望模式，默认 `modified`，便于在独立源码副本验证父运行时补丁和恢复。
- DSN 不再写死单任务端口/库；要求显式隔离 flag、PostgreSQL 协议、`127.0.0.1`、非默认显式端口、明确数据库名、本地 fixture 专用账号，并拒绝 DSN query/fragment（防止 host/service/options 覆盖）。fixture 继续使用随机 schema 并核对 app pool 的 current_schema。
- 旧请求：原 403，A1/B0，执行记录一次、供应商成本 unknown、租约归零；modified 精确核对 `IMAGE_ACCESS_DENIED` 固定文案，不含原摘要敏感数字或收费证明。
- 健康：modified 只计 auth failure 一次、进入冷却，保存 Retry-After；baseline/rollback 显式保留未记录的旧行为，不冒充修复通过。
- 新请求：使用不同 operation ID。modified A0/B1、200；原请求仍只有一条 attempt，绝不是旧请求 fallback/replay。
- 已接受 pin：只做 claim/release，无 HTTP POST；冷却不能改 pin 或改投 B。
- 显式 `not_charged`：先清隔离 schema 内健康行，仅对照 fixture A1/B1、200、原 A 健康计数一次，不把合成控制组当成历史免单证据。
- 文字分支：403 无免单标记仍保持原文字 fallback A1/B1，主通道健康计数一次，避免移动记录导致双计。
- 不创建客户余额、积分流水、reservation 或结算表；这些没有执行，不能写成客户扣费/退款验收。

## 集中验证与四产物

验证证据目录：`C:/Users/13357/.t3/worktrees/naumi/t3-18e71c29/output/supplier-quota-health-20261023/`。

- `MODIFIED_FILE.ts`：父独占运行时文件的只读修补副本，不回写父工作区。
- `DIFF_FILE.patch`：运行时基线与父修补副本的精确差异；子模块验证脚本差异另存 `SCRIPT_DIFF.patch`。
- `VERIFICATION.txt`：保存命令、环境输入、字面输出、exit、SHA256 与恢复状态。
- `ROLLBACK.sh`：可执行，仅接受本证据目录内带标记的源码副本，校验源/目标哈希后恢复基线运行时。独立副本恢复后跑 `rollback` 期望模式，candidate 与 MODIFIED_FILE 保持修补状态。

## 集中验证结果（本地真实 PostgreSQL + 真实 loopback HTTP）

输入为父提供的 `127.0.0.1:65435/goal`、`NAUMI_VERIFY_ISOLATED_DB=1`，专用 `fixture` 身份；每次 UUID schema，完成后核对 schema 不存在。源码使用同一份集中 harness：

| 阶段 | 实际代码与命令 | 字面结果摘要 | Exit |
| --- | --- | --- | --- |
| BASELINE | 本工作区 `cd64d1ff` 运行时；`node --import tsx --conditions react-server scripts/verify-imagegen-history-supplier-quota.ts baseline` | `DIAGNOSIS=RAW_BASELINE`、`HEALTH=UNRECORDED`；新 operation `RESELECTS_UNRECORDED STATUS=403 A_POSTS=1 B_POSTS=0` | 0 |
| MODIFIED | `candidate` 的父只读修补运行时；同命令末尾 `modified` | `DIAGNOSIS=IMAGE_ACCESS_DENIED`、`HEALTH_FAILURES=1 HEALTH=COOLDOWN`；新 operation `SKIPS_COOLDOWN STATUS=200 A_POSTS=0 B_POSTS=1` | 0 |
| ROLLBACK | 在独立 `rollback-copy` 先执行 `ROLLBACK.sh`，再同命令末尾 `rollback` | `ROLLBACK_COPY=RESTORED`；恢复 `RAW_BASELINE`、未记健康、新请求重新选 A；candidate/修补产物未改变 | 0 / 0 |

三阶段共同通过：旧 operation A1/B0、原 attempt 数仍一；supplier cost unknown；pin 仅 claim/release、不产生 POST；显式 non-charge 对照 A1/B1 且健康只计一次；文字原 fallback A1/B1 且健康只计一次；lease 归零；客户核算未执行；schema 清理通过。

另外在 candidate 运行现有 `node --import tsx --conditions react-server scripts/verify-channel-live-guards.ts`：401/403/429 分类、Retry-After/backoff、400/422 不惩罚、旧成功不抹新失败、跨 schedule 单半开、token release、原 pin 及 `CAPACITY_LEAKS=0` 全通过，exit 0。没有运行全量 tsc/build，没有供应商或付费调用。

原始错误与修正也保留：

- 第一轮新文字 fixture 缺少现有 `agent.text` 默认 binding，配置校验返回 `CONFIG_UNAVAILABLE`（exit 1）。仅补 fixture 的既有 binding，未改运行时代码，再完成上述集中三阶段。
- Windows 系统 tar 对仓库中文文件名解包失败；改用 Python `tarfile` 仅提取 `src/`、`scripts/`、`package.json`、`tsconfig.json` 进入自有源码副本，未删除或移动其他工作区。
- guard 脚本首轮额外注入 Router env 后，两次未消费 Response 的 GET 触发现有 capacityFetch，使末尾 lease 断言为 2（exit 1）；移除本模块额外 env，以该既有脚本自带配置再跑通过（exit 0）。没有改写该脚本或把失败当作通过。两个原始失败日志与最终日志均保留。

运行时 baseline SHA256：`5191264ae53b6c57268434bcceca961051dbcc36616001b6e5290bd1480532c3`。

父修补副本 SHA256：`76134c0e2da73ad7f080c04f2e6af377ade718d3691437a5816bbcf9c1c34c32`。

子 worktree 的 `src/lib/model-config/channel-fetch.ts` 始终保持 baseline hash；修补 candidate 与 `MODIFIED_FILE.ts` 保持父修补 hash。只有父任务整合其运行时补丁后，仓库默认 `modified` 验证才代表目标合同；单独 cherry-pick 本子提交不会修复生产行为。

## External unresolved / 精确所需证据

- 历史 22 笔只有 `E:/Workspace/naumi/output/recent-admin-failures47-20261023/REPORT.md` 与 snapshot 日志摘要，没有完整原始请求/响应。fixture 的 JSON envelope、图片/文字输入均是合成的，`EXACT_REPLAY=0`。
- 历史 403 是否确实未受理、未扣费：需要逐笔关联供应商 request ID / task ID、受理与扣费账本/最终回执，以及精确协议版本的官方未受理/未扣费合同；客户 consume=0 不代替供应商证明。没有这些证据就不新增历史 fallback 或重放。
- 真实余额是否够本次预扣：需要同一已发布凭据对应的当前只读余额、额度对象/单位/比例、该模型与参数的预扣规则及其来源时间；当前未知单位的缓存不足以判定。
- 线上避让是否生效：父修补尚未部署；要在获准发布后核对同版本 Web/Worker 的实际调用图、真实健康行、首次失败与后续独立请求的 execution stages、pin/租约与版本。不以本地 fixture 宣称线上恢复。
- 健康只按已配置 supplier channel 冷却，不自动永久停用同账户其他模型/别名。冷却到期仍可单次探测，这一行为保持原策略。
- 两笔 APIB completed/delivered 但未交付属于独立交付链问题，本模块没有修复或验收。
