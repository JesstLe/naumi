# APIB 增量接入（2026-10-19）

## 当前状态：线上已登记 v118，新增通道尚未启用

2026-10-19 用户先批准首批 1 USD 费用，随后明确暂停收费验收；再明确要求模型直接热更新到线上。本次已完成**正式版本化登记发布**，不是新增模型已可选/可调用：v117→v118，publication `9ffe3353-63f0-4a1a-9f30-aef1c7f4b5e8`，phase 原值 `applied`，digest `826f5228a6e67f89618c89d6ae9cdef568175e936f99634c6cda66209cc187ae`。2 个 provider、75 个 upstream 均保持禁用，密钥已加密进入凭据库；收费测试继续 PAUSED。详见第7节；下文第1—5节同时保留离线准备阶段记录。

用户批准 Image2.5 三型号、香蕉、新 Seedream/Qwen Image/FLUX 和视频型号的增量接入。保留全部已有供应商、启停、权重和客户售价；已有家族中新来源默认备用。收费验收须先提交批次、数量和费用资料再确认。

- 独立工作区：`C:/Users/13357/.codex/worktrees/apib-provider-20261019/naumi`，分支 `codex/apib-provider-20261019`。
- 开工与收尾均刷新 `origin/main`；初始基线 `f4bf7935d34d494693c6d0281657e5f442843922`。共享 checkout 的管理后台未提交改动不纳入本任务。
- 供应商 `https://api.apib.ai/v1`：此前鉴权目录 HTTP 200，317 个去重型号。目录不等于已验证生成能力。
- 本轮仅离线准备和无鉴权公开 GET；生产写入、凭据写入、付费生成、候选容器、重启和切流均为 0。

## 1. 资料发现

`/api/pricing` 和站点 `/` 返回 404，不代表无报价。实际可用公开接口：

```text
GET https://api.apib.ai/api/status
GET https://api.apib.ai/api/pricing/model?model=MODEL_ID
```

所选 75 个型号均取得 `success=true` 且 `data.model_name` 完全匹配的公开报价响应。75 是候选数（图片 **24**、视频 **51**），不是已验收可用数，也不是启用数。

`api/status` 声明 `system_name=APIMart`、`docs_link=https://docs.apimart.ai/`、USD 展示。仅据此读取关联公开文档，不向 APIMart 或其他域名发送 APIB 密钥。采集器只有 GET，无 Authorization、无生成和上传。

- 本轮采集 124 个公开 GET，123 个 HTTP 200，1 个尝试的 LTX 文档地址 404。
- LTX 两个候选没有找到有效文档，manifest 中 documentation=null；不能把尝试地址当来源。
- 关联文档成功取得 48 页，逐 URL/时间/SHA256 留档；完整目录仍保存于原调查产物。
- TokenPricingV2 仅 `data.pricing.unit` 和 `effective_rates` 可作为明确单位的公开价格信息；不把倍率换算为采购价。
- 其余 `paid_price`、`resolution_paid_prices` 等保留原始观察。部分响应不显式给出币种/计量单位，站点 USD 展示不等于已确认该密钥实际结算价。公开会员组折扣不等于当前账户组；不自动写入 procurement 或客户售价。

## 2. 候选与家族归属

完整精确白名单：`docs/providers/apib-onboarding-20261019.json`。

| 范围 | 数量 | 准备结果 |
| --- | ---: | --- |
| Image2.5 ext/flare/sunburst | 3 | 对应原 `gpt-image-2` / GPT-Image-2.5，记录备用路由意图，不改原 balanced 策略 |
| Nano Banana Pro | 2 | 原五别名家族，分别留存标准/official 来源；未验证不放行编辑 |
| Nano Banana 2 | 2 | 原五别名家族；保留原来源启停、quality/resolution 策略 |
| Nano Banana 2.1 | 2 | 归香蕉组但保留独立 2.1 版本，不冒充现有 2 等价通道 |
| Seedream | 5 | 4.0/4.5/5.0 flash/lite/pro；按各自真实参数准备 |
| Qwen Image | 4 | 2.0/3.0 标准与 pro，不合并 wire ID |
| FLUX 图片 | 6 | 2 flex/max/pro、3 image、Kontext max/pro |
| 视频 | 51 | Seedance、Veo、Kling、MiniMax/Hailuo、Wan、Grok、Vidu、LTX、PixVerse、HappyHorse、FLUX Video，逐型号 held |

排除混入：`ltx-2.3-text-image`、Wan image 两项、MiniMax Context-IR 不是本批视频生成候选。2.5 Flash、Banana Lite 不混入 Pro/2。

## 3. 热生效边界与代码缺口

线上只读快照（2026-10-19 上午采样）为模型 v117，digest `9dd5cc54611a1b96a82c694635d46799d4e12d4a471c521efd9b036d03dbc839`；Web/Worker 为 `1852b21c` / build `1792297790` 同镜像。只是该时点基线，不当作后续发布时实时状态。

当前 `channel-policy.ts` 的普通供应通道仅允许 openai-images/new-api-flow/openai-chat；`clients.ts` 仅在存在 imagePreset 时使用 apimartPresetFetch。已有持久单次提交、任务轮询、下载验收和账本实现，但不能通过只放开枚举或把协议伪装为同步 OpenAI 接入家族。

**因此本次不承诺纯热配置完成图片接入。** 后续需复用现有异步状态机，设计家族通道的冻结参数/采购证据/单次 POST/未知隔离/Worker 续查/实际像素验收，集中回归后按蓝绿约定发布适配代码。不要改全局 defaultImagePreset 抢占现有图像家族，不重放历史付费任务。比例修复 `generate-image` / `sizeFor` / 输出比例验收由独立线程负责，本任务不覆盖。

视频已有 `apimart` codec 与多种 profile；目录的 openai 标签不能证明 profile 可直接使用。Kling mode/audio、运动控制和首尾帧的 wire 不同；LTX 文档未知；MiniMax regeneration 等专用操作不按普通 text-to-video 自动放行。

参数实例：Seedream 4.5 **不支持 1K**，最低 2K；FLUX.2 的 1MP 与 1K 别名语义不同；Seedance1.5 文档最短 4 秒、Grok1.5 最短 6 秒、Veo3.1 固定 8 秒。不能统一发 1K/5 秒作为巡检。

## 4. 已实现的离线工具

- `scripts/collect-apib-public.py`：白名单型号报价与关联文档采集；三路并发、响应大小限制、无鉴权 GET、禁止重定向。
- `scripts/lib/apib-onboarding.mjs`：纯函数准备 disabled 候选，版本/digest 前置断言、精确目录匹配、去重、幂等、同 ID 冲突拒绝、保留全量旧字段。
- `scripts/prepare-apib-onboarding.mjs`：输出候选配置、路由意图、未知能力观察和输入原始 hash。
- `scripts/test-apib-onboarding.mjs`：集中离线单元测试；不接 DB/供应商。
- `scripts/verify-apib-candidate.ts`：调用项目真实 validateModelConfig 验证原配置/候选/回滚配置，并证明旧配置不变。

候选只增加 2 个禁用 provider、75 个禁用 upstream。所有新增 generate/edit/verified=false，不创建公模、不改家族路由、不写 credentialRef 或采购价。`ROUTING_INTENTS.json` 为后续接入意图，不是可直接发布的 family routing。默认 qualityRank/latency 等为禁用 schema 占位，不是实测数据。观察 payload 也不是直接覆盖管理员元数据的导入操作。

重复运行只接受完全相同的禁用候选；遇到同名已配置/已启用对象应重新审查，不覆盖。版本/digest 检查是离线输入前置条件，不是线上数据库 CAS 的替代。

可复用：

```powershell
node scripts/test-apib-onboarding.mjs
python scripts/collect-apib-public.py docs/providers/apib-onboarding-20261019.json output/apib-provider-20261019/selected-public
node scripts/prepare-apib-onboarding.mjs SNAPSHOT.json CATALOG.json docs/providers/apib-onboarding-20261019.json OUT EXPECTED_VERSION EXPECTED_DIGEST
node --conditions=react-server node_modules/tsx/dist/cli.mjs scripts/verify-apib-candidate.ts MODIFIED ORIGINAL_CONFIG.json MODIFIED_FILE.json
```

## 5. 首批收费验收建议（尚未执行）

先做 **8 张图片 + 3 段视频，11 次生成提交**，每项只提交一次；受理未知时暂停该项并保留原调用，不自动重发。首批验证协议、实际结果下载解码、像素/时长和指定模型，不外推为全家族/编辑/所有规格验收。

| 型号 | 次数/最小测试规格 | 已取得公开展示数值 |
| --- | --- | --- |
| gpt-image-2.5-ext | 1，flare/1K/1:1/n=1 | version_resolution_paid_prices.flare.1K=0.0085 |
| gpt-image-2.5-flare、sunburst | 各1，1k/1:1/low/n=1 | 各 low 输出参考0.004704；明确输出 $24/百万token、文本输入 $4/百万token，最终按实际usage |
| gemini-3-pro-image-preview | 1，1K/1:1/n=1 | paid_price=0.03 |
| gemini-3.1-flash-image-preview | 1，1K/1:1/n=1 | resolution_paid_prices.1K=0.015 |
| seedream-4-5 | 1，2K/1:1/n=1 | paid_price=0.026 |
| qwen-image-2.0 | 1，1K/1:1/n=1 | paid_price=0.02 |
| flux-2-pro | 1，1MP/1:1/n=1，不带输入图 | resolution_paid_prices.1MP=0.024 |
| seedance-1-5-pro | 1，480p/4秒/16:9 | per_second；480P=0.0204，4秒展示参考0.0816 |
| veo3.1-fast | 1，720p/8秒/16:9 | paid_price=0.14，计价单位仍需账户确认 |
| grok-imagine-1.5-video-apimart | 1，480p/6秒/16:9 | per_second；480P=0.0102，6秒展示参考0.0612 |

**非 token 数值保留供应商原字段含义，不据此自动写美元采购价。** 若按站点 USD 展示口径试算，上述约0.42，加实际输入token；这不是账户确认报价、保证最终费用或完整75项验收预算。建议用户确认首批 **1 USD 总预算**；执行前刷新每项报价并确认计量/账户口径，报价未知或预计超余额则该项继续 held。首批不启用自动巡检、不测试视频编辑/续写/运动控制，也不把成功首批扩展到其他64个型号。

后续参考图编辑与剩余精确型号应另列批次（不自动追加收费）。

### 集中验证结果

- 单元测试：6/6 PASS；无真实供应商连接。
- BASELINE：`BASELINE_PASS schema=valid oldConfig=unchanged apibAdded=0`，exit 0。
- MODIFIED：`MODIFIED_PASS schema=valid image=24 video=51 newlyEnabled=0 oldConfig=unchanged`，exit 0。
- 独立副本回滚：`ROLLBACK_HASH_PASS restored=ORIGINAL_CONFIG.json fixtureOnly=true`，exit 0；恢复后 `ROLLBACK_PASS schema=valid oldConfig=unchanged apibAdded=0`，exit 0。
- 原配置文件 SHA256 `bf8607d218d41e02d6f48ae20a5d5076b7d8c64e6cc64e3d8c45d2435673139b`；候选 SHA256 `d996a82a38676031f0a84abce8a1442174b16e426ffac2ba83424c4d19a7d4e3`。回滚只操作显式命名的独立 rollback-copy.json，候选文件仍保留新增项。
- 四件产物均重开读取校验。完整命令、输入、原样 stdout/stderr 和退出状态见证据目录 VERIFICATION.txt / TEST_RESULTS.json。没有生产回滚测试。

## 6. 发布前剩余工作

1. 收费验收由用户明确暂停；先前 1 USD 批准不自动恢复，生成提交始终为0。
2. 补齐图片异步家族适配并集中验证；确认 APIB wire 与文档实际一致。
3. 逐项真实验收并保存有来源的能力/报价，保持人工优先、未知保持未知。
4. 协调47三锁、刷新 live 版本/保护基线，以正式版本化发布和 CAS 激活配置；适配代码另走完整蓝绿。
5. 只有已通过的精确模型/规格进入公开节点；既有家族新来源备用，新家族绑定与计费须显式配置。已受理任务冻结配置保留。

本轮没有 metadata revision / publication UUID / applied phase / 实际视频输出；不把离线候选或 schema 通过称为已热生效。迭代同步计数：本轮完成离线接入准备模块1，生产成功发布计数不增加。证据目录 `E:/Workspace/naumi/output/apib-provider-20261019/`，含候选、差异、验证与仅针对独立副本的回滚脚本。

> 上段为离线准备阶段的历史边界；随后发生的正式配置发布以第7节为准，不将两阶段混为一次已验收生成。

## 7. 线上热登记结果（2026-10-19）

### 发布与当前可用性

- 目标47，固定现有 Web/Worker 镜像；未重启、未切流、未增加应用候选或安装供应商适配代码。
- 全程按窗口持三把 deploy.lock；模型变更通过现有 `repo.draft → saveDraft → runtime.publish` 正式流程，未直接修改 active_version，也未重跑旧香蕉修复。
- **v117→v118**，publication `9ffe3353-63f0-4a1a-9f30-aef1c7f4b5e8` / `applied`。本任务 actor 仅有1笔配置版本；后续只修元数据并验证，没有第二次发布。
- 线上 provider 14→16、upstream 31→106；新增24图片＋51视频均 `enabled=false`，能力 generate/edit/verified=false；未增加公模、未将 APIB 挂入现有家族执行路由。
- 元数据库按所选分组登记：图片 provider 保留完整317项目录，视频 provider 留51项所选目录（明确为子集）；75项独立公开报价观察，125份脱敏来源快照。报价未提升为账户已确认采购价，未覆盖客户售价；能力仍未知/待核，不凭目录名放开。
- 两条 provider 凭据分别通过现有 AES-256-GCM 凭据库导入，仅存密文/UUID引用；无明文文件或日志。
- **本次“热更新”是后台型号配置登记，不是可选可调用上线。** 公网实际 GET `/api/models?feature=image.generate` 与 `video.generate` 均 HTTP200，返回 version118；图片仍14个公模、视频仍1个公模，没有 APIB 新条目。图片异步家族适配、视频逐项定义和计价、路由激活仍待完成。

### 保护与费用边界

- 7个运行容器 ID/Image/StartedAt 保持；Nginx全文 SHA256 `f5caef1a4faf134c9683a5482082a680155089d0be0c62d637d9c1bda6b35219` 保持。
- 线上应用仍源码 `1852b21c5db9ff40332e25d840d98086761209c5` / build `1792297790` / 同镜像 `d036e1d14f63…`；公网健康 HTTP200，db.ok=true。
- 原模型、公模、权重、绑定、业务价格、其他管理员草稿和 billing v8 保持；新增健康巡检目标0。
- 本操作将 fetch 限定到 Router 私有管理 origin，不允许供应商 HTTP；供应商调用/生成提交/本批生成费均0。其他用户仍有正常任务，**不把全站计数增加归为本操作，也不声称全站没有新任务**。
- 遇到并发 `system-discovery` 刷新：旧元数据原始hash确有变化，未回灌或覆盖这些刷新。按 publication 时点历史逐项对比1614条，去除独立 vendor source 字段后人工字段/价格差异0；旧供应商元数据没有本任务actor写入。不能写“所有旧元数据原始hash不变”。

### 执行过程与恢复材料

- 首次临时工具文件权限和独立bundle缺包在 PLAN 前终止，无配置发布。修正工具私有目录所有权、打包纯JS依赖，并对运维子进程单独覆盖 NODE_OPTIONS，避免继承在线 HTTP observer 预加载；没有修改容器的持久环境或在线观察器。
- 正式 APPLY 已 applied 后，元数据补录遇到供应商合法计价维度键 `token` 与元数据凭据字段白名单冲突。结合现有 `cleanSource` 脱敏后，仅按该 publication 继续元数据；不伪装或编码字段、不创建第二笔模型发布。初始合并执行器 exit1 不等于 publication 失败；最终 VERIFY、线上读回与宿主保护检查均 exit0。
- 一次过严的旧元数据全量hash断言被其他供应商的来源刷新触发；保留真实差异，转为历史来源/人工字段分开审计，未回滚其他线程或用户数据。
- 备份 `database-before-r2.dump`，218262581 bytes，`pg_restore --list` 可读；SHA256 `de1a9feb4edbd8c7f903575755c051ec04aed4c94b3ddaf6551ffcf233dfbc28`。备份保留在远端受保护证据目录，不回灌。
- 独立 JSON 副本已实际回退为v117原配置，真实v118候选保留；这不是生产回滚实测。远端 `LIVE_RESTORE.sh --apply-rollback` 仅准备/语法核验，持三锁、绑定原应用ID和active version118/digest，使用正式 restore publication；不回灌DB/媒体、不重放任务、不删除元数据和凭据审计。后续有新发布则拒绝旧脚本覆盖。
- 三锁释放后再次只读确认空闲；凭据库2项均密文；activeVersion118、本任务publication数量1。

证据：本地 `E:/Workspace/naumi/output/apib-hot-config47-20261019/`，远端 `/opt/naumi-staging/evidence/apib-hot-config47-20261019/`。四件套 MODIFIED_FILE.json / DIFF_FILE.patch / VERIFICATION.txt / ROLLBACK.sh 使用本次真实v118结果，不复用之前无凭据的离线候选。`verify-apib-candidate.ts --allow-credential-refs` 允许禁用provider携带合法凭据引用；默认离线核验仍要求无凭据引用。

本次只完成配置/元数据登记模块（开发同步计数累计2），不计作应用蓝绿成功发布；费用测试暂停，应用适配和真实生成验收尚未完成。Git提交/推送与服务器运行镜像继续分别记录。
