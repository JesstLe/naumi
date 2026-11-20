# GPT-Image-2.6 与即梦 5.5 上架

## 最新执行顺序（用户追加，优先）

用户明确“那就均衡分流呗 / 先用上 / 再补代码”。本次先按现有 balanced 协议热上架，**不等待或发布随机调度新版程序**；先前程序构建已取消，没有建立服务器发布会话、清理备份、重启或切流。随机模式代码已合入 main，留作后续程序版本，不作为本次热上架门槛。

为兼容 47 当前实际程序的目录能力，用现有业务配置的 `inheritExisting` 为新模型明确支持的质量、分辨率和比例，保留旧模型全部选项及默认。启用的业务选项必须明确售价，因此把现有人工 quality-resolution 加法规则等值展开为新模型的积分矩阵；不是重新定价，原 billing v8 不变。类型/参数验证、实际业务计费快照与旧售价逐规格比较后才发布。

热发布仍使用三锁、固定管理操作源码、原模型/计费备份、PLAN/APPLY/VERIFY 和 CAS；运行 Web/Worker 身份、镜像、启动时间及生命周期原文必须保持。后续章节中的随机模式与程序发布方案作为已准备能力，不能写成本次已上线。

## 本轮实际交付结果

- 已完成 47 模型热发布 **v158**，publication `3ebd705a-d096-4787-99ca-64ad1d28f056`，digest `c844bd30bbd36b68f731cfcb9444741a752f207067db11c168e7b1cab394987f`，阶段 `applied`。管理操作固定来源 main `2c7719ca8212fa6a967802dcf27d7311d992afeb`。
- `GPT-Image-2.6` 仅一个公开入口，两个 exact wire ID 均启用，同 priority / weight=1，**balanced**；`即梦 5.5` 独立入口。新家族沿用标准 1K 6 积分/张等现有规格报价，未覆盖旧价表。21 个原创作功能继承旧选项；357 组新模型规格按实际 businessBillingSnapshot 验证与旧功能报价等值。
- 用与实际部署源码 `7aece11f` 相同的旧 schema / public-catalog / 参数与计费模块验证候选，通过；不以新代码的模拟冒充旧服务可读。真实公网 nginx 路由 `/api/models?feature=canvas.image`、`image.generate`、`tool.retouch` 均读回 v158、两个准确名称、参考数和支持规格；无 Flare/Sunburst 前端单独入口。标准画布默认仍为 GPT-Image-2.5；主生图入口保留原 settings 层的 Nano Banana Pro 默认。
- 首次公网检查把所有功能默认均误写成 `gpt-image-2` 而失败；只读定位确认原生图设置层仍选择 Nano Banana Pro，修正验证器的错误假设后通过，没有为了验证器更改生产默认项。
- 实际程序仍为 `7aece11f282d743542e3c468374a7780954158c7` / `1795151944`，原 Web `c775bb00…` / Worker `e888c15c…`，镜像 `35a8ace40abc…`，各阶段核对镜像、启动时间与生命周期原文不变。公网健康 DB ok。没有发布新程序、重启、切流、清理服务器备份或增记程序发布次数。
- 私有服务器证据 `/opt/naumi-staging/evidence/image26-seed55-hot-20261120-r1/` 含原配置/计费、PLAN、持久请求及发布回执、各阶段 export；辅助 tmp `/tmp/image26-seed55-launch-hot-20261120-r1` 在现有 Web 内保留为本轮即时逆操作材料，无新进程。三把部署锁在每个阶段退出时释放。
- 本机完整读回位于 `E:/workspace/naumi/output/image26-seed55-launch-20261120/`：`HOT_PLAN.log`、`HOT_APPLY.log`、`HOT_VERIFY.log`、`PUBLIC_VERIFIED.json`、`CANDIDATE.private.json`。原始参数/源码类型检查通过。独立 PG 已按唯一 label 核验并删除，fixture schema 已清理；取消的程序构建没有上线或重新启动。原主工作区及共享依赖保持，清理本任务 worktree 时只删 Junction 链接。

**验收边界**：本轮真实供应商收费 POST 为 0，没有把目录出现、配置 applied、参数验证或公开列表读回称为真实图片生成/上传编辑/作品存储/账务结算完成。用户已获知可刷新选择，也已明确告知尚未做真实出图核验。随机调度实现已在 main，尚未部署或启用；后续单独按用户安排使用。

### 逆操作交接

现有 Web 未切换时，使用原私有 helper 的 `ROLLBACK` 模式（相同 ops.cjs hash，SPEC 中已固定 rollbackOperationId），在三锁下选择性移除本次添加项；先检查当前模型版本和任何新依赖，不回滚 billing、数据库、媒体或供应商来源历史。若 Web 的 tmp 已因后续程序发布清理，先从最近一个 `export-VERIFY-*` 恢复整份原 PLAN / SPEC / bundle 到当前 Web 的同一私有 tmp，再使用相同逆操作身份；不能重新 PLAN 或改 ID。任何本轮字段被他人编辑/出现新依赖/计费已变化均保留现场并复核。旧 v157 与新 v158 的已受理任务均保留冻结上下文，不重新调用供应商。

## 目标与边界

用户要求 Flare/Sunburst 合为一个前端家族，后台随机选择，并增加 Seedream 5.5；随后明确前端命名与 Image 2.5 对齐。47 只读核对模型配置 v157 / 计费 v8，现有名称为 `GPT-Image-2.5` 和 `即梦 5.0 Pro`，故新增 `GPT-Image-2.6`（公开 ID `gpt-image-2.6`）及 `即梦 5.5`（`jimeng-image-5.5`）。不改旧名称、默认、报价、14 张香蕉参考图配置或已受理任务。

负责人为当前任务；分支 `codex/image26-seed55-launch-20261120`，工作目录 `E:/workspace/naumi-image26-seed55-launch-20261120`，起点及刷新 main `358bfb56f2d41e0e19c1fd63a9c5910f0ba66a1f`。共享 checkout 保持。只针对 47，未连接其他站。

## 职责、接口和状态归属

- 复用版本化模型注册表、现有 `apimartImagesFetch`、参数计划、supplier ledger、账务、作品与父子回执。纯配置 recipe 归 `scripts/lib/image26-seed55-launch.mjs`，管理操作归 `scripts/ops/image26-seed55-launch.ts`，不另造出图执行系统。
- `supplierRouting.mode=random` 扩展现有通道调度，优先级、权重、熔断、容量、最终提交门禁与原通道 pin 沿用原 owner。使用操作 ID 与实际通道身份的 SHA-256 生成加权随机排列，等权 Flare/Sunburst 各约一半；不同任务随机，同任务排序稳定，已受理 pin 始终优先。未知提交仍只核查原任务，不切通道重新付费。
- UI 管理配置增加“同级随机”，所有相关摘要同步展示；原 priority/balanced 算法不变。目录对新随机 APIMart 家族展示其通道支持比例的交集，防止选择不兼容选项。前台只有一个家族入口，无供应商后缀。
- GPT 2.6 复用 11 月 10 日已固定的独立参数契约，仅启用用户指定两个标准 wire ID，1K/2K/4K、显式质量和现有可严格交付的命名比例。不新增 Ext/MAI、GIF/SVG 或任意像素承诺。
- 即梦 5.5 使用确切 wire ID `seedream-5-5`，标准质量（不发送 quality）、1K/2K、文档 10 比例、单请求一张、最多 10 参考。使用现有受控 PNG/JPEG/WebP 上传；现有公共适配入口的 20 MiB 限制仍生效。文档中的 1.5K、拆层/OCR 与更多文件格式不在本轮新增 UI 范围；不把代表性像素输出猜成固定尺寸。
- 新模型沿用现有按功能的人工积分规则，不引入客户售价或采购价推断。公开供应商资料独立导入元数据库，保留人工字段优先级。运行能力保持 `verified=false`，目录/文档与真实付费交付分别验收。

## 来源与读回

47 使用现有 APIB image 凭据 GET `/v1/models`，三个 exact ID 均存在；未输出密钥。公开逐模型报价均 HTTP 200 且精确 `model_name` 匹配。关联文档、逐模型报价完整数据/URL/时间/hash 留在 `docs/providers/evidence/image26-seed55-20261120/`。关联 APIMart 契约不是 APIB 真实运行的证明。

原 SSH 握手失败是本机代理网络路径问题，读取当天已完成的运维文档后绑定实际 WLAN 地址，使用现有 `naumi-ops` 身份及 sudo 验证通过；没有修改服务器网络、密钥或 sshd。

## 已完成验证

- `verify-image26-seed55-launch.ts <private baseline>`：380 个实际参数编译组合；目录、命名、参考数、旧默认/报价保持、严格追加/碰撞/选择性逆变换；20,000 个操作的等权结果 9,872 / 10,128，3:1 权重结果 14,952 / 5,048。PASS，供应商 POST 0。
- 隔离 PostgreSQL `verify-channel-live-guards.ts`：关闭开关、冻结上下文、原 pin 在 priority/balanced/random 下恢复、最终提交门禁、未知状态、熔断/探测、租约释放。PASS，无真实收费请求；fixture schema 已删除。
- `verify-apimart-async-contract.ts`、`verify-apimart-single-pass.ts`：PASS，63 项检查，17 场景；单次映射、旧报价及原任务保留。
- 本机完整类型检查最初因复用依赖缺少主线新加 ag-psd 而失败；独立下载 lockfile 中的 34.2.2 类型并用临时 tsconfig 指定后检查通过，不修改共享依赖。初次发现的 provider routingModes 联合类型已收敛到通道公开类型。
- 历史 `verify-channel-clarity.cjs` 在与旧提交逐字比较未改 Dialog 时失败（主线已增加 className）；保留该基线差异，不扩大改动去恢复旧 Dialog 或放松无关断言。权重展示断言只按本轮增加随机模式更新。

## 发布、回滚与未完成

当前阶段为实现及定向验证通过，**尚未上线新模型，也尚未做本轮真实收费交付验收**。47 现场仍是 `7aece11f282d743542e3c468374a7780954158c7` / `1795151944`，Web/Worker 同镜像。接续须从合入 main 的固定提交构建，沿用蓝绿及三锁/生命周期协议，完成新代码上线，再以新鲜模型版本/digest CAS 执行 PLAN → APPLY → VERIFY。

管理发布先落盘原配置/计费、固定候选、operation ID 和请求；未知发布结果查询同 ID，不另开操作覆盖。`rollbackImageLaunch` 只移除本轮新增项及相应功能选项，对新增依赖/他人编辑拒绝逆变换；不恢复整份旧配置、不回灌数据库、不改媒体、不重发已受理任务。供应商资料的来源历史作为证据保留。

下一步：固定 main/构建与部署；核验在线目录和真实创作交付；追加实际源码/镜像、运行版号、通道命中、账务与作品回执、旧槽排空及资源清理结果。仍在运行的本任务隔离 PG 为 `naumi-image26-seed55-test-20261120`，最终按专用 label/身份核对后关闭；本任务 worktree 的 node_modules 仅为指向现有依赖的 Junction，清理只删链接。
