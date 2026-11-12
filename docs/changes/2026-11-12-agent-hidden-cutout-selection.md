# 智能创作透明图片：内部抠图模型选择修复

## 模块与职责

- Imagegen planner：把透明输出编排为原模型生成＋配置抠图步骤，冻结步骤模型与报价。
- Model preparation：区分请求显式模型与配置默认模型，准备参数。
- Model executor：核验准备方案版本、用途与模型身份，恢复同版本执行上下文。
- 本次从 `origin/main` 的 `3b028960e7af38b9cd65e6c62a81b5357c4cfcd2` 建立独立任务副本；共享 checkout 既有改动保持。

## 调研结论

1. 创作设置“智能”实际是没有显式 `modelId`，不是名为“智能”的模型。
2. 本轮只读回执显示 47 模型配置 v153 的 `image.cutout` 指向启用但隐藏的 `image-cutout-verified`；隐藏是后台处理器不出现在用户目录的正常配置。
3. `06a916d78d6aa6ab035042bf24ddeede6745d415`（2026-11-11 10:16 +08:00，提交作者字段 JesstLe）开放工具模型选择时，从 `ADMIN_CONFIGURED_FEATURES` 移除了 `tool.cutout`。旧 planner 把后台绑定 ID 填进显式模型字段，因而进入用户可见性检查并报 `MODEL_UNAVAILABLE`。
4. 准备器还把配置默认值提升为显式请求，执行器又把已准备的默认模型当作新用户选择；仅修 planner 不够。
5. 本地以相同关键配置形状运行真实 planner、准备器、报价器与模型选择器，旧代码复现同一中文错误。没有找到截图原始 tool-call 参数，所以不把此复现描述为已还原该用户全部请求。

## 公共接口、依赖方向、数据与事务归属

- 沿用 planner → preparation/quotation → executor；没有新增 HTTP 参数、持久化字段或旁路选择器。
- 内部 cutout 步骤不传用户模型 ID；准备和报价从同一个冻结快照读取配置默认值。
- 执行器只有在服务端准备方案通过版本/用途校验、且模型等于该快照配置默认值时，才按默认选择解析。其余显式选择仍经过可见性检查。
- 保留启用状态、工具范围、能力、候选通道和版本核验。用户显式填入隐藏 ID 仍拒绝。
- 报价/准备/步骤模型必须一致。没有修改数据库、媒体、积分规则、旧任务或供应商配置，没有重放收费请求。

## 实现与迁移状态

修改三个业务文件：

- `src/lib/model-config/image-preparation.ts`：`requestedModelId` 不再仅因存在 `featureDefault` 就成为显式模型。
- `src/lib/imagegen/plan.ts`：cutout 内部步骤的 `requestedModelId` 保持隐式；报价也使用同一默认语义，并核对三方模型身份一致。
- `src/lib/model-config/execution.ts`：通过验证的 `preparedDefault` 按冻结默认选择恢复，而非再次作为用户请求拒绝。

保留 11 月 11 日开放的工具手动选模型能力；没有恢复全局 admin-only 策略，没有把隐藏模型改成公开模型。无迁移步骤。

## 验证命令、结果与证据层级

证据目录：`E:/Workspace/naumi/output/agent-model-selection-20261112/`。

### 定向回归

`node scripts/verify-imagegen-hidden-cutout.cjs`

结果：`MODIFIED=PASS CHECKS=30 TRANSPARENT=generate+cutout DIRECT_CUTOUT=PASS EXPLICIT_HIDDEN=REJECTED QUOTE_PREPARED=IDENTICAL SUPPLIER_CALLS=0`，exit 0。

测试运行真实规划、参数准备、报价、执行解析及冻结上下文恢复。仅替换数据库/鉴权/媒体读取等 I/O 边界；不冒充生产收费生图验收。覆盖多份透明结果、独立抠图、原生透明、显式用户模型、隐藏/无效/停用模型、工具范围、功能授权、快照版本不符及模型一致性。

### 集中验证

- `node node_modules/typescript/bin/tsc --noEmit --incremental false`：exit 0。
- `verify-imagegen-contract.ts`、`verify-imagegen-intent.ts`、`verify-imagegen-capabilities.ts`、`verify-image-model-family-routing.ts`：使用 `node --conditions=react-server --import tsx scripts/<name>`，均 exit 0。
- `git diff --check`：exit 0。
- 初次借用共享旧依赖时存在 React 18/类型依赖问题，已改为本任务独立 `npm ci --ignore-scripts --no-audit --no-fund`（745 packages）并重测；未修改共享依赖。
- `verify-public-model-identity.ts` 的数据库集成测试要求隔离本地 PostgreSQL。本机无运行 PostgreSQL，Docker daemon 也未启动，故该项未通过环境前置检查，不计入通过项。

### 回滚

`ROLLBACK.sh` 逐文件核验全部原始/修改后 SHA256，再恢复三个源码文件。已在独立 `rollback-copy` 演练；结果 `ROLLBACK=RESTORED FILES=3 HASHES=MATCH`，随后 `--baseline` 再次复现原 `MODEL_UNAVAILABLE`。原工作副本与 `MODIFIED_FILE` 仍为修复状态。

四件套：`MODIFIED_FILE/`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。完整命令、输入、字面输出、退出码与哈希见证据目录。

## 未完成项与下一步

- 用户本轮明确选择“只合入 main，暂不发布”。交付到 main；47/103 均不部署、不更改运行配置。
- 47 本轮先前只读快照：Web/Worker `f5e8e95ba0746c1cb9eea05d05b596589c7dad04`，image `sha256:16160d114f205b360b9d9fc57821959e67ca2f4ac9e09fbbaf1ee7d134b99aa8`；该快照不是未来发布基线。
- 后续收到发布指令后重新读取在线状态、持锁蓝绿发布，再验收普通账号实际透明图片。Git 整合、本地回归均不代表已在线修复或已交付 SVG 能力。
